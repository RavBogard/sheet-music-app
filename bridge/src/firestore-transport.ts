/**
 * Firestore Transport
 *
 * Replaces the WebSocket server entirely. Instead of iPads connecting
 * directly to the bridge via WSS (which requires TLS certificates and
 * manual trust on every iPad), we use Firestore as the message bus.
 *
 * The bridge and iPads already have authenticated Firestore connections,
 * so this "just works" — zero configuration on iPads.
 *
 * Data flow:
 *   iPad writes command → Firestore → Bridge reads & executes → X32
 *   X32 state change → Bridge writes state → Firestore → iPad reads
 *
 * Collections:
 *   monitor-live/state     — Full mixer snapshot, written by bridge
 *   monitor-live/commands/* — Individual commands from iPads, processed & deleted
 */

import * as admin from "firebase-admin"
import { X32Client } from "./x32-client"
import { ConfigManager } from "./config"
import { MixerSnapshot } from "./types"

interface PendingCommand {
    type: string
    busIndex?: number
    channelIndex?: number
    matrixIndex?: number
    value?: number | boolean
    uid: string
    createdAt: number
}

export class FirestoreTransport {
    private db: admin.firestore.Firestore
    private x32: X32Client
    private config: ConfigManager
    private commandUnsub: (() => void) | null = null
    private stateThrottleTimer: ReturnType<typeof setTimeout> | null = null
    private stateDirty = false
    private fullSyncPending = false
    private pendingDeltas: Record<string, any> = {}
    private lastSnapshot: MixerSnapshot | null = null
    private lastStateWrite = 0
    private readonly STATE_WRITE_INTERVAL = 100 // Max 10 writes/sec

    // Track the latest command timestamp for each target to discard obsolete delayed commands
    // Key format: "bus_master:1" or "send_level:1:5" or "matrix_fader:2"
    private latestCommandTimestamps: Map<string, number> = new Map();
    // Batch processing state
    private pendingCommandQueue: { cmd: PendingCommand, ref: admin.firestore.DocumentReference }[] = [];
    private commandBatchTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly COMMAND_BATCH_WINDOW = 20; // ms to accumulate commands before processing

    // BR-01: cache each user's admin/soundEngineer ("engineer") flag so the
    // authz check does NOT read users/{uid} from Firestore on every fader tick
    // (the dominant avoidable latency + the dominant per-command read cost).
    // role/soundEngineer change rarely; a short TTL keeps the gate correct
    // within seconds of a role change. Only the SOURCE of the flag changes —
    // the authorization logic in isCommandAuthorized is unchanged.
    private engineerCache: Map<string, { isEngineer: boolean; expiresAt: number }> = new Map();
    private readonly ENGINEER_CACHE_TTL_MS = 30_000;

    constructor(x32: X32Client, config: ConfigManager) {
        this.x32 = x32
        this.config = config
        this.db = admin.firestore()
    }

    /**
     * Start listening for commands and broadcasting state.
     */
    start(): void {
        this.listenForCommands()
        this.setupX32Listeners()
        console.log("[Transport] Firestore transport active — iPads connect via Firestore")
    }

    /**
     * Write the full mixer state snapshot to Firestore.
     * Called on initial sync and periodically as state changes.
     */
    async writeFullState(): Promise<void> {
        const snapshot: MixerSnapshot = {
            channels: this.x32.channels,
            buses: this.x32.buses,
            matrices: this.x32.matrices,
            config: this.config.getConfig(),
        }

        try {
            await this.db.doc("monitor-live/state").set({
                ...snapshot,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
        } catch (err) {
            console.error("[Transport] Failed to write state:", (err as Error).message)
        }
    }

    /**
     * Mark a specific field as dirty to be written in the next throttled batch.
     * Uses dot notation compatible with Firestore updates.
     */
    private scheduleDeltaWrite(field: string, value: any): void {
        this.pendingDeltas[field] = value
        this.stateDirty = true
        this.scheduleStateWrite()
    }

    /**
     * Throttled state write — batches rapid X32 changes into a single
     * Firestore write at most every STATE_WRITE_INTERVAL ms.
     */
    private scheduleStateWrite(): void {
        const now = Date.now()
        const elapsed = now - this.lastStateWrite

        if (elapsed >= this.STATE_WRITE_INTERVAL) {
            // Enough time has passed — write immediately
            this.flushState()
        } else if (!this.stateThrottleTimer) {
            // Schedule a write for when the interval expires
            this.stateThrottleTimer = setTimeout(() => {
                this.flushState()
            }, this.STATE_WRITE_INTERVAL - elapsed)
        }
    }

    private async flushState(): Promise<void> {
        if (this.stateThrottleTimer) {
            clearTimeout(this.stateThrottleTimer)
            this.stateThrottleTimer = null
        }

        if (this.fullSyncPending) {
            this.fullSyncPending = false
            this.stateDirty = false
            this.pendingDeltas = {}
            this.lastStateWrite = Date.now()
            await this.writeFullState()
            return
        }

        if (!this.stateDirty) return

        const deltas = { ...this.pendingDeltas }
        this.stateDirty = false
        this.pendingDeltas = {}
        this.lastStateWrite = Date.now()

        // Apply deltas to our local cached snapshot if it exists
        if (this.lastSnapshot) {
            // We just let the next full sync fix any drift
            // The local cache isn't strictly necessary to maintain perfectly right now
        }

        try {
            // Use update for deltas so we don't overwrite the whole document
            await this.db.doc("monitor-live/state").update({
                ...deltas,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
        } catch (err: any) {
            // If update fails (e.g. document doesn't exist yet), fall back to a full write
            if (err.code === 5 || err.message.includes("NOT_FOUND")) {
                console.log("[Transport] State doc missing, falling back to full sync")
                await this.writeFullState()
            } else {
                console.error("[Transport] Failed to write state deltas:", err.message)
            }
        }
    }

    /**
     * Listen for commands from iPads via Firestore.
     */
    private listenForCommands(): void {
        const commandsRef = this.db.collection("monitor-live/commands/pending")

        this.commandUnsub = commandsRef
            .orderBy("createdAt")
            .onSnapshot(
                (snap) => {
                    for (const change of snap.docChanges()) {
                        if (change.type === "added") {
                            const data = change.doc.data() as PendingCommand
                            this.queueCommand(data, change.doc.ref)
                        }
                    }
                },
                (err) => {
                    console.error("[Transport] Command listener error:", err.message)
                    // Re-establish listener after a delay
                    setTimeout(() => this.listenForCommands(), 5000)
                }
            )

        console.log("[Transport] Listening for iPad commands")
    }

    private queueCommand(cmd: PendingCommand, ref: admin.firestore.DocumentReference): void {
        this.pendingCommandQueue.push({ cmd, ref });
        if (!this.commandBatchTimer) {
            this.commandBatchTimer = setTimeout(() => this.processCommandBatch(), this.COMMAND_BATCH_WINDOW);
        }
    }

    private async processCommandBatch(): Promise<void> {
        this.commandBatchTimer = null;
        if (this.pendingCommandQueue.length === 0) return;

        const batchToProcess = [...this.pendingCommandQueue];
        this.pendingCommandQueue = [];

        // Sort by creation time to ensure chronological processing within the batch
        batchToProcess.sort((a, b) => a.cmd.createdAt - b.cmd.createdAt);

        const firestoreBatch = this.db.batch();
        let batchCount = 0;

        for (const { cmd, ref } of batchToProcess) {
            await this.processCommand(cmd, ref, firestoreBatch);
            batchCount++;

            // Firestore batches have a limit of 500 operations. 
            // We do 1 delete/update per command, so commit at 400 for safety.
            if (batchCount >= 400) {
                try { await firestoreBatch.commit(); } catch (e) { console.error("[Transport] Batch commit error", e); }
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            try { await firestoreBatch.commit(); } catch (e) { console.error("[Transport] Batch commit error", e); }
        }
    }

    /**
     * Process a single command from an iPad. Does not delete immediately; adds delete to a batch.
     */
    private async processCommand(
        cmd: PendingCommand,
        ref: admin.firestore.DocumentReference,
        batch: admin.firestore.WriteBatch
    ): Promise<void> {
        try {
            // Verify authorization
            const authorized = await this.isCommandAuthorized(cmd);
            if (!authorized) {
                console.warn(`[Transport] Unauthorized command from ${cmd.uid}: ${cmd.type}`)
                batch.update(ref, { error: "Unauthorized", processedAt: Date.now() })
                return
            }

            // Discard stale commands (older than 10 seconds)
            if (Date.now() - cmd.createdAt > 10_000) {
                batch.update(ref, { error: "Timeout", processedAt: Date.now() })
                return
            }

            // Generate a target key to track command freshness
            let targetKey = cmd.type;
            if (cmd.busIndex !== undefined) targetKey += `:${cmd.busIndex}`;
            if (cmd.channelIndex !== undefined) targetKey += `:${cmd.channelIndex}`;
            if (cmd.matrixIndex !== undefined) targetKey += `:${cmd.matrixIndex}`;

            const lastCmdTime = this.latestCommandTimestamps.get(targetKey) || 0;

            // If we've already processed a NEWER command for this exact target, 
            // discard this older one as obsolete (can happen due to Firestore latency/reordering jitter)
            if (cmd.createdAt < lastCmdTime) {
                // Obsolete
                batch.delete(ref)
                return
            }

            // Record this as the latest command for this target
            this.latestCommandTimestamps.set(targetKey, cmd.createdAt);

            // Execute the command on the X32
            switch (cmd.type) {
                case "set_bus_master":
                    if (cmd.busIndex !== undefined && cmd.value !== undefined) {
                        this.x32.setBusFader(cmd.busIndex, cmd.value as number)
                    }
                    break

                case "set_send_level":
                    if (cmd.busIndex !== undefined && cmd.channelIndex !== undefined && cmd.value !== undefined) {
                        this.x32.setSendLevel(cmd.channelIndex, cmd.busIndex, cmd.value as number)
                    }
                    break

                case "set_send_on":
                    if (cmd.busIndex !== undefined && cmd.channelIndex !== undefined && cmd.value !== undefined) {
                        this.x32.setSendOn(cmd.channelIndex, cmd.busIndex, cmd.value as boolean)
                    }
                    break

                case "set_matrix_fader":
                    if (cmd.matrixIndex !== undefined && cmd.value !== undefined) {
                        this.x32.setMatrixFader(cmd.matrixIndex, cmd.value as number)
                    }
                    break

                case "set_matrix_on":
                    if (cmd.matrixIndex !== undefined && cmd.value !== undefined) {
                        this.x32.setMatrixOn(cmd.matrixIndex, cmd.value as boolean)
                    }
                    break

                default:
                    console.warn(`[Transport] Unknown command type: ${cmd.type}`)
            }

            // Mark for deletion after successful execution
            batch.delete(ref)
        } catch (err) {
            console.error(`[Transport] Command error:`, (err as Error).message)
            batch.update(ref, { error: (err as Error).message, processedAt: Date.now() })
        }
    }

    /**
     * Check if a user is authorized to execute this command.
     */
    private async isCommandAuthorized(cmd: PendingCommand): Promise<boolean> {
        // This is the AUTHORITATIVE bus-ownership / privilege gate. firestore.rules
        // does NOT enforce per-bus ownership (it only checks membership, self-
        // attribution, the command shape, and admin/SE-gates the FOH matrix
        // primitives — see firestore.rules monitor-live/commands/pending). So this
        // check is the only thing verifying a user owns the bus they're driving;
        // if it is removed or weakened, any member could control any bus.
        const userBus = this.config.getUserBus(cmd.uid)

        // Admin/sound-engineer privilege (cached — see getIsEngineer / BR-01).
        const isEngineer = await this.getIsEngineer(cmd.uid)

        if (cmd.type === "set_matrix_fader" || cmd.type === "set_matrix_on") {
            return isEngineer
        }

        if (cmd.busIndex !== undefined) {
            return isEngineer || userBus === cmd.busIndex
        }

        return false
    }

    /**
     * Whether a user is an admin or sound engineer, cached in-memory with a
     * short TTL (BR-01). On a cache miss/expiry it reads users/{uid} once and
     * caches the result; subsequent commands within the TTL skip the read
     * entirely. A failed read fails CLOSED (engineer=false) for that command
     * and is NOT cached, so the next command retries — preserving the original
     * per-command behavior on transient Firestore errors. Bus-ownership (via
     * config.getUserBus) is unaffected by a read failure, exactly as before.
     */
    private async getIsEngineer(uid: string): Promise<boolean> {
        const now = Date.now()
        const cached = this.engineerCache.get(uid)
        if (cached && cached.expiresAt > now) {
            return cached.isEngineer
        }

        let isEngineer = false
        try {
            const userDoc = await this.db.collection("users").doc(uid).get()
            if (userDoc.exists) {
                const userData = userDoc.data()
                if (userData?.role === "admin" || userData?.soundEngineer === true) {
                    isEngineer = true
                }
            }
            // Cache successful reads only (including negative results).
            this.engineerCache.set(uid, { isEngineer, expiresAt: now + this.ENGINEER_CACHE_TTL_MS })
        } catch (e) {
            // Fail closed for engineer privilege; do NOT cache an error so the
            // next command re-attempts the read.
            console.error("[Transport] Failed to fetch user role for auth check:", e)
        }
        return isEngineer
    }

    /**
     * Listen for X32 state changes and push to Firestore.
     */
    private setupX32Listeners(): void {
        // Any fader/send/matrix change triggers a throttled delta write
        this.x32.on("bus_fader", (busIndex, value) => {
            // Assuming buses array is index 0-based in snapshot but 1-based in X32, usually handled in X32Client
            // The array index matches the bus order
            // Find the array index for this bus
            const arrayIndex = this.x32.buses.findIndex(b => b.index === busIndex)
            if (arrayIndex >= 0) {
                this.scheduleDeltaWrite(`buses.${arrayIndex}.fader`, value)
            } else {
                this.fullSyncPending = true; this.scheduleStateWrite();
            }
        })

        this.x32.on("send_level", (busIndex, channelIndex, value) => {
            const busArrayIndex = this.x32.buses.findIndex(b => b.index === busIndex)
            if (busArrayIndex >= 0) {
                const sendArrayIndex = this.x32.buses[busArrayIndex].sends.findIndex(s => s.channelIndex === channelIndex)
                if (sendArrayIndex >= 0) {
                    this.scheduleDeltaWrite(`buses.${busArrayIndex}.sends.${sendArrayIndex}.level`, value)
                } else {
                    this.fullSyncPending = true; this.scheduleStateWrite();
                }
            }
        })

        this.x32.on("send_on", (busIndex, channelIndex, on) => {
            const busArrayIndex = this.x32.buses.findIndex(b => b.index === busIndex)
            if (busArrayIndex >= 0) {
                const sendArrayIndex = this.x32.buses[busArrayIndex].sends.findIndex(s => s.channelIndex === channelIndex)
                if (sendArrayIndex >= 0) {
                    this.scheduleDeltaWrite(`buses.${busArrayIndex}.sends.${sendArrayIndex}.on`, on)
                } else {
                    this.fullSyncPending = true; this.scheduleStateWrite();
                }
            }
        })

        this.x32.on("matrix_fader", (matrixIndex, value) => {
            const arrayIndex = this.x32.matrices?.findIndex(m => m.index === matrixIndex) ?? -1
            if (arrayIndex >= 0) {
                this.scheduleDeltaWrite(`matrices.${arrayIndex}.fader`, value)
            } else {
                this.fullSyncPending = true; this.scheduleStateWrite();
            }
        })

        this.x32.on("matrix_on", (matrixIndex, on) => {
            const arrayIndex = this.x32.matrices?.findIndex(m => m.index === matrixIndex) ?? -1
            if (arrayIndex >= 0) {
                this.scheduleDeltaWrite(`matrices.${arrayIndex}.on`, on)
            } else {
                this.fullSyncPending = true; this.scheduleStateWrite();
            }
        })

        // Full state sync events
        this.x32.on("state_synced", () => {
            this.fullSyncPending = true
            this.scheduleStateWrite()
        })
        this.x32.on("reconnected", () => {
            // Small delay to let state populate
            setTimeout(() => {
                this.fullSyncPending = true
                this.scheduleStateWrite()
            }, 500)
        })
    }

    /**
     * Clean up old commands (safety net for commands that weren't deleted).
     * Call periodically from the heartbeat loop.
     */
    async cleanupStaleCommands(): Promise<void> {
        try {
            // Clean up old commands (both unprocessed and processed errors)
            const stale = await this.db
                .collection("monitor-live/commands/pending")
                .where("createdAt", "<", Date.now() - 30_000)
                .limit(50)
                .get()

            if (!stale.empty) {
                const batch = this.db.batch()
                stale.docs.forEach((doc) => batch.delete(doc.ref))
                await batch.commit()
                console.log(`[Transport] Cleaned ${stale.size} stale commands`)
            }
        } catch {
            // Best effort
        }
    }

    stop(): void {
        if (this.commandUnsub) {
            this.commandUnsub()
            this.commandUnsub = null
        }
        if (this.stateThrottleTimer) {
            clearTimeout(this.stateThrottleTimer)
        }
    }
}
