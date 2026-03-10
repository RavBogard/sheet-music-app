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

import { db, auth } from "@/lib/firebase"
import {
    doc,
    collection,
    onSnapshot,
    addDoc,
    Unsubscribe,
} from "firebase/firestore"
import { MixerSnapshot, MonitorConfig } from "@/types/monitor"
import { logger } from "@/lib/logger"

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface FirestoreMonitorClientOptions {
    onStateUpdate: (snapshot: MixerSnapshot) => void
    onConfigUpdate: (config: MonitorConfig) => void
    onStatusChange: (status: ConnectionStatus, error?: string) => void
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

export class FirestoreMonitorClient {
    private options: FirestoreMonitorClientOptions
    private stateUnsub: Unsubscribe | null = null
    private throttleMap = new Map<string, ThrottledCommand>()
    private _connected = false
    private _snapshotCount = 0
    private _lastSnapshotAt = 0
    private _snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null
    private _pendingSnapshot: MixerSnapshot | null = null
    private _firstSnapshot = true

    constructor(options: FirestoreMonitorClientOptions) {
        this.options = options
    }

    /**
     * Start listening to mixer state from Firestore.
     */
    connect(): void {
        this.options.onStatusChange("connecting")
        this._firstSnapshot = true

        // Listen to the live mixer state document
        this.stateUnsub = onSnapshot(
            doc(db, "monitor-live", "state"),
            (snap) => {
                if (!snap.exists()) {
                    // Bridge hasn't written state yet
                    if (!this._connected) {
                        this.options.onStatusChange("connecting")
                    }
                    return
                }

                const data = snap.data() as MixerSnapshot & { updatedAt?: unknown }

                if (!this._connected) {
                    this._connected = true
                    this.options.onStatusChange("connected")
                }

                // Firestore may return arrays as objects with numeric keys —
                // ensure we always pass real arrays to the store
                const toArray = <T>(val: unknown): T[] =>
                    Array.isArray(val) ? val : val && typeof val === "object" ? Object.values(val) : []

                const parsed: MixerSnapshot = {
                    channels: toArray(data.channels),
                    buses: toArray<Record<string, unknown>>(data.buses).map((b) => ({
                        ...b,
                        sends: toArray(b.sends),
                    })) as MixerSnapshot["buses"],
                    matrices: toArray(data.matrices),
                    config: data.config,
                }

                this._snapshotCount++

                // First snapshot fires immediately so UI populates instantly
                if (this._firstSnapshot) {
                    this._firstSnapshot = false
                    logger.debug("[MonitorFS] First snapshot — forwarding immediately")
                    this.forwardSnapshot(parsed)
                    return
                }

                // Debounce subsequent snapshots
                logger.debug("[MonitorFS] Snapshot received (debouncing)")
                this._pendingSnapshot = parsed
                if (this._snapshotDebounceTimer) {
                    clearTimeout(this._snapshotDebounceTimer)
                }
                this._snapshotDebounceTimer = setTimeout(() => {
                    if (this._pendingSnapshot) {
                        this.forwardSnapshot(this._pendingSnapshot)
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
                logger.error("[MonitorFS] State listener error:", err.message)
                this._connected = false
                this.options.onStatusChange("error", err.message)
            }
        )
    }

    private forwardSnapshot(snapshot: MixerSnapshot): void {
        this._lastSnapshotAt = Date.now()
        logger.debug("[MonitorFS] Snapshot forwarded to store (total: %d)", this._snapshotCount)
        this.options.onStateUpdate(snapshot)
    }

    /**
     * Stop listening and clean up.
     */
    disconnect(): void {
        if (this.stateUnsub) {
            this.stateUnsub()
            this.stateUnsub = null
        }

        // Clear snapshot debounce timer
        if (this._snapshotDebounceTimer) {
            clearTimeout(this._snapshotDebounceTimer)
            this._snapshotDebounceTimer = null
        }
        this._pendingSnapshot = null

        // Clear all throttled commands
        for (const [, throttled] of this.throttleMap) {
            clearTimeout(throttled.timer)
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
     */
    private async sendCommandImmediate(data: Record<string, unknown>): Promise<void> {
        const user = auth.currentUser
        if (!user) return

        try {
            await addDoc(collection(db, "monitor-live", "commands", "pending"), {
                ...data,
                uid: user.uid,
                createdAt: Date.now(),
            })
        } catch (err) {
            logger.error("[MonitorFS] Command send failed:", (err as Error).message)
        }
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
