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
                            this.processCommand(data, change.doc.ref)
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

    /**
     * Process a single command from an iPad, then delete it.
     */
    private async processCommand(
        cmd: PendingCommand,
        ref: admin.firestore.DocumentReference
    ): Promise<void> {
        try {
            // Verify authorization
            if (!this.isCommandAuthorized(cmd)) {
                console.warn(`[Transport] Unauthorized command from ${cmd.uid}: ${cmd.type}`)
                // Update with error instead of deleting immediately so the client sees it failed
                await ref.update({ error: "Unauthorized", processedAt: Date.now() })
                return
            }

            // Discard stale commands (older than 10 seconds)
            if (Date.now() - cmd.createdAt > 10_000) {
                await ref.update({ error: "Timeout", processedAt: Date.now() })
                return
            }

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

            // Delete command after successful execution
            try { await ref.delete() } catch { /* best effort */ }
        } catch (err) {
            console.error(`[Transport] Command error:`, (err as Error).message)
            try { await ref.update({ error: (err as Error).message, processedAt: Date.now() }) } catch { /* best effort */ }
        }
    }

    /**
     * Check if a user is authorized to execute this command.
     */
    private isCommandAuthorized(cmd: PendingCommand): boolean {
        // Need to verify the uid has access to the bus they're controlling.
        // For now, we trust that the Firestore security rules enforce this.
        // The bridge-side check is a defense-in-depth measure.
        const userBus = this.config.getUserBus(cmd.uid)
        const isEngineer = this.config.isAuthorized(cmd.uid, "admin", true)

        if (cmd.type === "set_matrix_fader" || cmd.type === "set_matrix_on") {
            return isEngineer
        }

        if (cmd.busIndex !== undefined) {
            return isEngineer || userBus === cmd.busIndex
        }

        return false
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
