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

/** monitor-live/state schema version (C4). Bump on any shape change. */
const STATE_SCHEMA_VERSION = 1

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

    // ── State-write path (Monitor Overhaul Phase 1, C1/C3) ──
    // ONE throttled full-state `.set()` writer. The dot-path delta writer that
    // converted the `buses` ARRAY into a MAP (R3) is deleted. Every trigger —
    // inbound X32 echo, query-after-command confirm reply, startup sync, and the
    // two heartbeats — funnels through scheduleStateWrite → writeFullState.
    private stateWriteTimer: ReturnType<typeof setTimeout> | null = null
    private lastStateWrite = 0
    private lastSuccessfulStateWriteAt = 0
    private stateSeq = 0
    private readonly STATE_WRITE_INTERVAL = 100 // throttle: ≤10 writes/sec

    // C3 — two-tier heartbeat timers.
    private stateHeartbeatTimer: ReturnType<typeof setInterval> | null = null
    private fullRequeryTimer: ReturnType<typeof setInterval> | null = null
    private readonly STATE_HEARTBEAT_MS = 10_000 // cheap re-.set() of cached snapshot (idle never freezes — R2)
    private readonly FULL_REQUERY_MS = 30_000 // authoritative syncFullState resync (catch drift / missed echoes)

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

        // C3 — cheap state-write heartbeat: re-.set() the cached snapshot so
        // monitor-live/state.updatedAt advances even on a fully idle desk (kills
        // R2). No X32 traffic — just republishes what's already in cache.
        this.stateHeartbeatTimer = setInterval(
            () => this.scheduleStateWrite(),
            this.STATE_HEARTBEAT_MS,
        )
        // C3 — authoritative re-query resync: periodically re-read the desk to
        // catch any drift or echo we missed. Restores (intentionally, at a sane
        // cadence) the periodic resync BR-02 had removed as a side effect.
        this.fullRequeryTimer = setInterval(() => {
            if (this.x32.isConnected()) {
                this.x32
                    .syncFullState(this.config.getConfig().monitorBuses)
                    .catch((err) =>
                        console.error("[Transport] Full re-query failed:", (err as Error).message),
                    )
            }
        }, this.FULL_REQUERY_MS)

        console.log("[Transport] Firestore transport active — iPads connect via Firestore")
    }

    /**
     * Write the FULL mixer state snapshot to monitor-live/state via `.set()`
     * (C1 — never a dot-path `.update()`, which corrupted the buses ARRAY into a
     * MAP = R3). Carries light freshness/identity fields (C4): schemaVersion,
     * bridgeVersion, stateSeq (monotonic), updatedAt, and the B11 `unconfirmed`
     * list. Does NOT embed `config` — consumers read config/monitor directly;
     * the embedded copy went stale and was the misleading bridge.version:"2.0.0"
     * source.
     */
    async writeFullState(): Promise<void> {
        this.lastStateWrite = Date.now()
        try {
            await this.db.doc("monitor-live/state").set({
                schemaVersion: STATE_SCHEMA_VERSION,
                channels: this.x32.channels,
                buses: this.x32.buses,
                matrices: this.x32.matrices,
                unconfirmed: this.x32.getUnconfirmed(),
                bridgeVersion: process.env.BRIDGE_VERSION || "2.0.0",
                stateSeq: ++this.stateSeq,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
            this.lastSuccessfulStateWriteAt = Date.now()
        } catch (err) {
            console.error("[Transport] Failed to write state:", (err as Error).message)
        }
    }

    /**
     * Throttled full-state write (≤10/s). Coalesces rapid changes: a write that
     * is already scheduled captures the latest cache when it fires, so callers
     * never track per-field dirtiness. ALL state-write triggers route here (C1/C5).
     */
    private scheduleStateWrite(): void {
        if (this.stateWriteTimer) return
        const elapsed = Date.now() - this.lastStateWrite
        if (elapsed >= this.STATE_WRITE_INTERVAL) {
            void this.writeFullState()
        } else {
            this.stateWriteTimer = setTimeout(() => {
                this.stateWriteTimer = null
                void this.writeFullState()
            }, this.STATE_WRITE_INTERVAL - elapsed)
        }
    }

    /**
     * Age in ms since the last SUCCESSFUL state write (Infinity if never).
     * Lets the bridge heartbeat derive liveness from state-freshness, not just
     * socket chatter (B3/C5).
     */
    getStateAgeMs(): number {
        return this.lastSuccessfulStateWriteAt === 0
            ? Infinity
            : Date.now() - this.lastSuccessfulStateWriteAt
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

    // C4 (RESERVED — Phase 2, do NOT implement here): a per-command ack surface
    // at monitor-live/acks/{commandId} = { commandId, status:
    // 'applied'|'rejected'|'timeout', confirmedValue?, reason?, at }, server-write
    // / client-read, TTL-swept — the read target for Phase-2 get_command_status
    // (closes B6/MCP-D3). Not written in Phase 1.

    /**
     * Process a single command from an iPad. Does not delete immediately; adds delete to a batch.
     * Confirmation of the applied value happens via the X32Client's
     * query-after-command (C2): the SET schedules a debounced read-back whose
     * reply refreshes the cache and triggers a full-state write here.
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
     * Listen for X32 state changes and push to Firestore. Every change — an
     * inbound echo (manual desk move / another client) OR a query-after-command
     * confirm reply (C2) — refreshes the X32Client cache and emits one of these
     * events; we respond with ONE throttled FULL-STATE write (C1). No per-field
     * dot-path deltas (those coerced the array into a map — R3). `state_synced`
     * covers startup, the periodic re-query, reconnect, and config-change syncs.
     */
    private setupX32Listeners(): void {
        const onChange = () => this.scheduleStateWrite()
        this.x32.on("bus_fader", onChange)
        this.x32.on("send_level", onChange)
        this.x32.on("send_on", onChange)
        this.x32.on("matrix_fader", onChange)
        this.x32.on("matrix_on", onChange)
        this.x32.on("state_synced", onChange)
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
        if (this.stateWriteTimer) {
            clearTimeout(this.stateWriteTimer)
            this.stateWriteTimer = null
        }
        if (this.stateHeartbeatTimer) {
            clearInterval(this.stateHeartbeatTimer)
            this.stateHeartbeatTimer = null
        }
        if (this.fullRequeryTimer) {
            clearInterval(this.fullRequeryTimer)
            this.fullRequeryTimer = null
        }
    }
}
