/**
 * Firestore Monitor Client
 *
 * Replaces the WebSocket client. Instead of connecting directly to the
 * bridge via WSS (which requires self-signed cert trust on every iPad),
 * we use Firestore as the transport layer.
 *
 * State flow:  Bridge writes → monitor-live/state → iPad reads (onSnapshot)
 * Command flow: iPad writes → monitor-live/commands/pending → Bridge reads & deletes
 *
 * Zero configuration on iPads — uses the existing authenticated Firestore connection.
 */

import { getDb, auth, subscribeWithDb, recoverFromFirestoreShutdown } from "@/lib/firebase"
import {
    doc,
    collection,
    onSnapshot,
    addDoc,
    Unsubscribe,
} from "firebase/firestore"
import { MixerSnapshot, MonitorConfig } from "@/types/monitor"
import { coerceMixerSnapshot } from "@/lib/monitor/coerce-state"
import { commandTargetKey } from "@/lib/monitor/target-key"
import { firestoreDateToMillis } from "@/lib/monitor/state-freshness"
import { logger } from "@/lib/logger"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

/** R2 — a command the bridge refused, addressed to the fader that sent it. */
export interface CommandRejection {
    /** The desk slot, in the bridge's own key vocabulary (`send_level:3:5`). */
    targetKey: string
    /** The bridge's raw reason (`unauthorized`, `bridge-standby`, …). */
    reason: string
    commandId: string
}

export interface FirestoreMonitorClientOptions {
    /**
     * Fired with the coerced mixer snapshot and the bridge's own write time
     * (`state.updatedAt`, epoch millis; null when the doc has no/uncoercible
     * stamp). The timestamp drives consumer-side staleness (AUDIT-consumers
     * C-6) instead of the weaker "snapshot arrived" proxy.
     */
    onStateUpdate: (snapshot: MixerSnapshot, stateUpdatedAt: number | null) => void
    onConfigUpdate: (config: MonitorConfig) => void
    onStatusChange: (status: ConnectionStatus, error?: string) => void
    /**
     * R2 — the bridge wrote a `rejected` ack for one of THIS user's commands.
     * Optional so existing constructions (and tests) keep compiling; when absent
     * no ack listener is ever attached.
     */
    onCommandRejected?: (rejection: CommandRejection) => void
}

// Command throttle: batch rapid fader changes (e.g., dragging)
// into at most 1 command per 50ms per parameter
const COMMAND_THROTTLE_MS = 50

// Snapshot debounce: coalesce rapid bridge writes into at most
// 1 store update per 150ms (first snapshot fires immediately)
const SNAPSHOT_DEBOUNCE_MS = 150

interface ThrottledCommand {
    timer: ReturnType<typeof setTimeout>
    data: Record<string, unknown>
}

// Retry constants for transient Firestore errors
const ERROR_RETRY_DELAY_MS = 2000
const MAX_CONSECUTIVE_ERRORS = 3

/**
 * R2 — how long to WAIT before attaching an ack listener for a command.
 *
 * A drag emits a command every ~50ms per target. Attaching a listener per
 * command would open and close ~20 Firestore watches a second on congregation
 * WiFi, and every rejection it could surface mid-drag is `superseded` — noise,
 * by construction, since a newer command for the same target already replaced
 * it. So each new command for a target RESCHEDULES the pending attach: while the
 * finger is moving nothing is watched, and ~250ms after the musician stops,
 * exactly one listener attaches — for the release command, the one whose verdict
 * they are actually waiting on. Acks live 5 minutes (`ACK_TTL_MS`), so the delay
 * cannot miss one.
 */
const ACK_WATCH_DELAY_MS = 250

/**
 * How long an attached ack listener stays attached. The bridge's own confirm
 * budget is 1.5s (`ACK_CONFIRM_TIMEOUT_MS`), after which it writes a `timeout`
 * ack; 6s covers that plus Firestore propagation with room to spare, and bounds
 * the listener so an ack that never arrives cannot leak a watch.
 */
const ACK_WATCH_TTL_MS = 6000

interface AckWatch {
    commandId: string
    attachTimer: ReturnType<typeof setTimeout> | null
    expiryTimer: ReturnType<typeof setTimeout> | null
    unsub: Unsubscribe | null
}

export class FirestoreMonitorClient {
    private options: FirestoreMonitorClientOptions
    private stateUnsub: Unsubscribe | null = null
    private throttleMap = new Map<string, ThrottledCommand>()
    private _connected = false
    private _snapshotCount = 0
    private _lastSnapshotAt = 0
    private _snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null
    private _pendingSnapshot: MixerSnapshot | null = null
    private _pendingStateUpdatedAt: number | null = null
    private _firstSnapshot = true
    private _consecutiveErrors = 0
    private _retryTimer: ReturnType<typeof setTimeout> | null = null
    private _disconnected = false // v4.3 P6-B03: guards against post-teardown forwardSnapshot
    private _lastCommandError = 0
    /** R2 — at most ONE ack watch per target key (see ACK_WATCH_DELAY_MS). */
    private ackWatches = new Map<string, AckWatch>()

    constructor(options: FirestoreMonitorClientOptions) {
        this.options = options
    }

    /**
     * Start listening to mixer state from Firestore.
     */
    connect(): void {
        this.options.onStatusChange("connecting")
        this._firstSnapshot = true

        // Listen to the live mixer state document. Firestore SDK is lazy-loaded,
        // so we wrap onSnapshot in subscribeWithDb to preserve the sync-unsub
        // contract while deferring the actual subscription attach until the
        // firestore module resolves.
        this.stateUnsub = subscribeWithDb((db) => onSnapshot(
            doc(db, "monitor-live", "state"),
            (snap) => {
                if (!snap.exists()) {
                    // Bridge hasn't written state yet
                    if (!this._connected) {
                        this.options.onStatusChange("connecting")
                    }
                    return
                }

                const data = snap.data() as Record<string, unknown>

                if (!this._connected) {
                    this._connected = true
                    this.options.onStatusChange("connected")
                }
                this._consecutiveErrors = 0

                // C-4: route every read through the ONE shared defensive guard,
                // so a corrupted (array→map) `buses` degrades identically here
                // and on the MCP side. C-6: capture the bridge's own write time.
                const parsed = coerceMixerSnapshot(data)
                const stateUpdatedAt = firestoreDateToMillis(data.updatedAt)

                this._snapshotCount++

                // First snapshot fires immediately so UI populates instantly
                if (this._firstSnapshot) {
                    this._firstSnapshot = false
                    logger.debug("[MonitorFS] First snapshot — forwarding immediately")
                    this.forwardSnapshot(parsed, stateUpdatedAt)
                    return
                }

                // Debounce subsequent snapshots
                logger.debug("[MonitorFS] Snapshot received (debouncing)")
                this._pendingSnapshot = parsed
                this._pendingStateUpdatedAt = stateUpdatedAt
                if (this._snapshotDebounceTimer) {
                    clearTimeout(this._snapshotDebounceTimer)
                }
                this._snapshotDebounceTimer = setTimeout(() => {
                    // v4.3 P6-B03: bail if teardown happened between schedule + fire
                    if (this._disconnected) return
                    if (this._pendingSnapshot) {
                        this.forwardSnapshot(this._pendingSnapshot, this._pendingStateUpdatedAt)
                        this._pendingSnapshot = null
                    }
                    this._snapshotDebounceTimer = null
                }, SNAPSHOT_DEBOUNCE_MS)

                // Note: we intentionally do NOT call onConfigUpdate here.
                // The dedicated config/monitor Firestore listener in useMonitorConnection
                // handles config updates. Calling it here would reset defaultChannels
                // on every bridge state push (since bridge config lacks that field).
            },
            (err) => {
                if (recoverFromFirestoreShutdown(err)) return  // recovery in flight; skip noisy log + skip incrementing the consecutive-errors disconnect counter
                this._consecutiveErrors++
                logger.error("[MonitorFS] State listener error (%d/%d):", this._consecutiveErrors, MAX_CONSECUTIVE_ERRORS, err.message)

                if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    // Too many consecutive errors — surface to UI
                    this._connected = false
                    this.options.onStatusChange("error", err.message)
                } else {
                    // Transient error — retry after delay without flashing error UI
                    logger.info("[MonitorFS] Retrying listener in %dms...", ERROR_RETRY_DELAY_MS)
                    this._retryTimer = setTimeout(() => {
                        this._retryTimer = null
                        if (this.stateUnsub) {
                            this.stateUnsub()
                            this.stateUnsub = null
                        }
                        this.connect()
                    }, ERROR_RETRY_DELAY_MS)
                }
            }
        ))
    }

    private forwardSnapshot(snapshot: MixerSnapshot, stateUpdatedAt: number | null): void {
        // v4.3 P6-B03: guard against post-teardown forwarding. onSnapshot
        // unsubscription is asynchronous in Firestore, so a snapshot
        // callback can still fire briefly after disconnect().
        if (this._disconnected) return
        this._lastSnapshotAt = Date.now()
        logger.debug("[MonitorFS] Snapshot forwarded to store (total: %d)", this._snapshotCount)
        this.options.onStateUpdate(snapshot, stateUpdatedAt)
    }

    /**
     * Stop listening and clean up.
     */
    disconnect(): void {
        this._disconnected = true
        if (this.stateUnsub) {
            this.stateUnsub()
            this.stateUnsub = null
        }

        // Clear retry timer
        if (this._retryTimer) {
            clearTimeout(this._retryTimer)
            this._retryTimer = null
        }
        this._consecutiveErrors = 0

        // Clear snapshot debounce timer
        if (this._snapshotDebounceTimer) {
            clearTimeout(this._snapshotDebounceTimer)
            this._snapshotDebounceTimer = null
        }
        this._pendingSnapshot = null
        this._pendingStateUpdatedAt = null

        // R2: drop every ack listener (and its pending attach) on teardown.
        this.clearAllAckWatches()

        // Flush any pending throttled commands before disconnecting
        // This ensures the last fader position is always sent
        for (const [, throttled] of this.throttleMap) {
            clearTimeout(throttled.timer)
            this.sendCommandImmediate(throttled.data).catch(() => {})
        }
        this.throttleMap.clear()

        this._connected = false
        this.options.onStatusChange("disconnected")
    }

    // ─── Command Methods (called by UI fader interactions) ───

    setBusMaster(busIndex: number, value: number): void {
        this.sendCommand(`bus_master_${busIndex}`, {
            type: "set_bus_master",
            busIndex,
            value,
        })
    }

    setBusOn(busIndex: number, on: boolean): void {
        // Master bus mute (X32 `/bus/MM/mix/on`). On/off toggles send immediately
        // (no throttle), mirroring `setSendOn` / `setMatrixOn`.
        this.sendCommandImmediate({
            type: "set_bus_on",
            busIndex,
            value: on,
        })
    }

    setSendLevel(busIndex: number, channelIndex: number, value: number): void {
        this.sendCommand(`send_level_${busIndex}_${channelIndex}`, {
            type: "set_send_level",
            busIndex,
            channelIndex,
            value,
        })
    }

    setSendOn(busIndex: number, channelIndex: number, on: boolean): void {
        // On/off toggles send immediately (no throttle)
        this.sendCommandImmediate({
            type: "set_send_on",
            busIndex,
            channelIndex,
            value: on,
        })
    }

    setMatrixFader(matrixIndex: number, value: number): void {
        this.sendCommand(`matrix_fader_${matrixIndex}`, {
            type: "set_matrix_fader",
            matrixIndex,
            value,
        })
    }

    setMatrixOn(matrixIndex: number, on: boolean): void {
        // On/off toggles send immediately
        this.sendCommandImmediate({
            type: "set_matrix_on",
            matrixIndex,
            value: on,
        })
    }

    // ─── Internal ───

    /**
     * Throttled command send — coalesces rapid fader changes.
     * Only the latest value is sent for each unique key.
     */
    private sendCommand(key: string, data: Record<string, unknown>): void {
        const existing = this.throttleMap.get(key)
        if (existing) {
            // Update the pending data but keep the timer
            existing.data = data
            return
        }

        // Send immediately, then throttle further sends
        this.sendCommandImmediate(data)

        const throttled: ThrottledCommand = {
            data,
            timer: setTimeout(() => {
                const latest = this.throttleMap.get(key)
                if (latest && latest.data !== data) {
                    // A newer value came in while we were throttling — send it
                    this.sendCommandImmediate(latest.data)
                }
                this.throttleMap.delete(key)
            }, COMMAND_THROTTLE_MS),
        }
        this.throttleMap.set(key, throttled)
    }

    /**
     * Send a command to Firestore immediately.
     *
     * R2: the created document's id is the ack id — the bridge writes its verdict
     * to `monitor-live/commands/acks/{id}`. This used to discard the
     * `DocumentReference`, which is half of why every rejection was invisible
     * (the other half being that `firestore.rules` denied clients the read).
     */
    private async sendCommandImmediate(data: Record<string, unknown>): Promise<void> {
        const user = auth.currentUser
        if (!user) return

        try {
            const db = await getDb()
            const ref = await addDoc(collection(db, "monitor-live", "commands", "pending"), {
                ...data,
                uid: user.uid,
                createdAt: Date.now(),
            })
            this.scheduleAckWatch(ref.id, data)
        } catch (err) {
            this._lastCommandError = Date.now()
            logger.error("[MonitorFS] Command send failed:", (err as Error).message)
        }
    }

    // ─── R2: per-command ack watching ───

    /**
     * Arm (or re-arm) the ack watch for this command's target. Called after every
     * successful send; a newer command for the same target replaces the pending
     * attach rather than adding a second listener.
     */
    private scheduleAckWatch(commandId: string, data: Record<string, unknown>): void {
        if (!this.options.onCommandRejected || this._disconnected) return
        const targetKey = commandTargetKey(data)
        if (!targetKey) return // malformed shape — the bridge will reject it, but we can't key it

        this.clearAckWatch(targetKey)

        const watch: AckWatch = {
            commandId,
            attachTimer: setTimeout(() => {
                watch.attachTimer = null
                this.attachAckWatch(targetKey, watch)
            }, ACK_WATCH_DELAY_MS),
            expiryTimer: null,
            unsub: null,
        }
        this.ackWatches.set(targetKey, watch)
    }

    private attachAckWatch(targetKey: string, watch: AckWatch): void {
        if (this._disconnected) return

        watch.expiryTimer = setTimeout(() => this.clearAckWatch(targetKey), ACK_WATCH_TTL_MS)

        watch.unsub = subscribeWithDb((db) => onSnapshot(
            doc(db, "monitor-live", "commands", "acks", watch.commandId),
            (snap) => {
                if (!snap.exists() || this._disconnected) return
                const ack = snap.data() as { status?: string; reason?: string }

                if (ack.status === "rejected") {
                    this.clearAckWatch(targetKey)
                    logger.warn("[MonitorFS] Command rejected (%s): %s", targetKey, ack.reason || "no reason given")
                    this.options.onCommandRejected?.({
                        targetKey,
                        reason: ack.reason || "",
                        commandId: watch.commandId,
                    })
                    return
                }

                // `applied` — nothing to say; the authoritative snapshot confirms
                // the fader. `timeout` is deliberately NOT surfaced as a rejection:
                // the bridge may well have applied it and merely missed the
                // read-back, so the existing confirmation machine's gentle ease-back
                // stays the honest response.
                if (ack.status === "applied") this.clearAckWatch(targetKey)
            },
            (err) => {
                // A denied or failed ack read must never break command sending —
                // this is a diagnostic channel, not the control path.
                if (!recoverFromFirestoreShutdown(err)) {
                    logger.debug("[MonitorFS] Ack listener error (%s): %s", targetKey, err.message)
                }
                this.clearAckWatch(targetKey)
            },
        ))
    }

    private clearAckWatch(targetKey: string): void {
        const watch = this.ackWatches.get(targetKey)
        if (!watch) return
        if (watch.attachTimer) clearTimeout(watch.attachTimer)
        if (watch.expiryTimer) clearTimeout(watch.expiryTimer)
        if (watch.unsub) watch.unsub()
        this.ackWatches.delete(targetKey)
    }

    private clearAllAckWatches(): void {
        for (const targetKey of [...this.ackWatches.keys()]) this.clearAckWatch(targetKey)
    }

    get lastCommandError(): number {
        return this._lastCommandError
    }

    get isConnected(): boolean {
        return this._connected
    }

    get snapshotCount(): number {
        return this._snapshotCount
    }

    get lastSnapshotAt(): number {
        return this._lastSnapshotAt
    }
}
