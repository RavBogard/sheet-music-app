/**
 * Bridge control & diagnostics (v10.0.4).
 *
 * ONE shared command-type family + ONE diagnostics shape, so the observability
 * (O2/O4) and recovery (R1-R4) additions land without colliding:
 *
 *   - collectDiagnostics() — the additive heartbeat field-set (O2) AND the
 *     bridge.selftest snapshot (O4), from one source of truth. Sanitizes the
 *     Infinity/0 sentinels to null so a Firestore write can never reject.
 *   - BridgeControlDispatcher — handles the config/monitor.bridgeControl channel
 *     (R1): dispatch by `action`, dedup by `nonce`. The recovery verbs (resync /
 *     reconnect / restart) + the diagnostic verb (selftest) all flow through here.
 *
 * Pure + dependency-injected so every branch is unit-testable without standing up
 * Electron, the X32 socket, or a real Firestore.
 */

import type { BridgeControl } from "./types"

/**
 * Convert a `FirestoreDate` (string | Date | number | Timestamp-ish) to epoch
 * ms, or null when the shape is missing/unparseable. Defensive: bridgeControl
 * docs can be hand-written via Firebase MCP, and a future MCP wrapper might
 * populate `requestedAt` as a serverTimestamp object, a Date, or an ISO string.
 * Pure (no admin imports) so it stays unit-testable.
 */
function firestoreDateToMs(d: unknown): number | null {
    if (d == null) return null
    if (typeof d === "number" && Number.isFinite(d)) return d
    if (d instanceof Date) {
        const ms = d.getTime()
        return Number.isFinite(ms) ? ms : null
    }
    if (typeof d === "string") {
        const ms = Date.parse(d)
        return Number.isFinite(ms) ? ms : null
    }
    if (typeof d === "object") {
        const obj = d as { seconds?: number; toDate?: () => Date }
        if (typeof obj.toDate === "function") {
            try {
                const ms = obj.toDate().getTime()
                return Number.isFinite(ms) ? ms : null
            } catch {
                return null
            }
        }
        if (typeof obj.seconds === "number") return obj.seconds * 1000
    }
    return null
}

/** O2 — the additive diagnostics published on the heartbeat + by selftest. */
export interface BridgeDiagnostics {
    /** Raw X32 socket liveness (NOT the folded x32Connected health bit). */
    socketAlive: boolean
    /** Age of the last successful state write, ms; null when never written. */
    stateAgeMs: number | null
    /** How many OSC value reads were unconfirmed in the last sync. */
    unconfirmedCount: number
    /** Epoch ms of the last inbound OSC message; null when none yet. */
    lastOscRxAt: number | null
    /** Epoch ms of the last successful state write; null when none yet. */
    lastStateWriteAt: number | null
    /** Epoch ms the bridge process booted. */
    startedAt: number
    /** Process uptime in ms. */
    uptimeMs: number
    /** Pending command-queue depth (a wedged/undrained queue grows). */
    queueDepth: number
    /** Running count of captured error/warn lines (O1 logger). */
    errCount: number
    /** Most-recent captured error/warn line (O1 logger), or null. */
    lastError: { msg: string; ts: number } | null
}

export interface DiagnosticsSources {
    x32: {
        isConnected(): boolean
        getUnconfirmed(): string[]
        getLastMessageAt(): number
    }
    transport: {
        getStateAgeMs(): number
        getQueueDepth(): number
        getLastStateWriteAt(): number
    }
    logger: {
        getErrCount(): number
        getLastError(): { msg: string; ts: number } | null
    }
    startedAt: number
    now?: () => number
}

/**
 * Snapshot the bridge's live diagnostics. Pure read of state the bridge already
 * holds — no I/O. Sentinels are normalized for Firestore: getStateAgeMs()'s
 * Infinity → null, and the 0-means-never timestamps → null (Firestore rejects
 * Infinity/NaN and 0 would read as 1970).
 */
export function collectDiagnostics(s: DiagnosticsSources): BridgeDiagnostics {
    const now = (s.now ?? Date.now)()
    const stateAgeRaw = s.transport.getStateAgeMs()
    const lastOscRx = s.x32.getLastMessageAt()
    const lastStateWrite = s.transport.getLastStateWriteAt()
    return {
        socketAlive: s.x32.isConnected(),
        stateAgeMs: Number.isFinite(stateAgeRaw) ? Math.round(stateAgeRaw) : null,
        unconfirmedCount: s.x32.getUnconfirmed().length,
        lastOscRxAt: lastOscRx > 0 ? lastOscRx : null,
        lastStateWriteAt: lastStateWrite > 0 ? lastStateWrite : null,
        startedAt: s.startedAt,
        uptimeMs: Math.max(0, now - s.startedAt),
        queueDepth: s.transport.getQueueDepth(),
        errCount: s.logger.getErrCount(),
        lastError: s.logger.getLastError(),
    }
}

export interface BridgeControlDeps {
    x32: DiagnosticsSources["x32"] & {
        syncFullState(buses: number[]): Promise<void>
        forceReconnect(): void
    }
    transport: DiagnosticsSources["transport"] & {
        writeFullState(): Promise<void>
    }
    logger: DiagnosticsSources["logger"]
    getMonitorBuses: () => number[]
    /** Relaunch the process (Electron app.relaunch + exit). No-op off Electron. */
    restart: () => void
    /** Persist a fresh diagnostic snapshot (writes monitor-live/selftest). */
    writeSelftest: (
        snapshot: BridgeDiagnostics & { ts: number; bridgeVersion: string },
    ) => Promise<void>
    /**
     * v10.0.5 — clear the persisted `config/monitor.bridgeControl` doc field
     * BEFORE invoking `restart()`. Closes the cross-process boot-loop: in-memory
     * `lastHandledNonce` is lost on relaunch, and the config snapshot listener
     * re-fires the same `{action: "restart", nonce}` on next boot → infinite
     * loop. Clearing the field idempotently kills the source.
     *
     * Failure-mode = current behavior (boot loop possible if BOTH this fails AND
     * the new `requestedAt < processStartedAt` skip-guard doesn't catch the
     * re-fire because the writer didn't populate `requestedAt`). Dispatcher
     * swallows + logs failure, then proceeds with `restart()` — refusing to
     * restart on a clear-failure would itself wedge the bridge.
     */
    clearBridgeControl: () => Promise<void>
    startedAt: number
    now?: () => number
}

export type DispatchOutcome =
    | {
          handled: false
          reason:
              | "no-control"
              | "no-action"
              | "no-nonce"
              | "duplicate-nonce"
              | "stale-request"
              | "unknown-action"
      }
    | { handled: true; action: BridgeControl["action"] }

/**
 * Dispatch the config/monitor.bridgeControl channel (R1). The bridge's heartbeat
 * writes config/monitor every 60s, which re-fires the config snapshot listener
 * with the SAME bridgeControl — so the `nonce` dedup is load-bearing, not
 * optional: only a nonce we haven't run triggers an action. A nonce is consumed
 * BEFORE the action runs so a re-delivered snapshot (or a throwing action) can
 * never double-apply on the desk.
 */
export class BridgeControlDispatcher {
    private lastHandledNonce: string | null = null
    private readonly deps: BridgeControlDeps
    /**
     * v10.0.5 — frozen at construction. The cross-process counterpart to
     * `lastHandledNonce`: a request whose `requestedAt` predates the process
     * boot cannot have been issued for THIS process and is by definition stale
     * (it's the boot-loop fingerprint — same persisted nonce, fresh dispatcher).
     */
    private readonly processStartedAt: number

    constructor(deps: BridgeControlDeps) {
        this.deps = deps
        this.processStartedAt = deps.startedAt
    }

    async handle(
        ctrl: BridgeControl | null | undefined,
    ): Promise<DispatchOutcome> {
        if (!ctrl || typeof ctrl !== "object") {
            return { handled: false, reason: "no-control" }
        }
        const action = ctrl.action
        const nonce = ctrl.nonce
        if (!action) return { handled: false, reason: "no-action" }
        if (!nonce || typeof nonce !== "string") {
            return { handled: false, reason: "no-nonce" }
        }
        // v10.0.5 cross-process skip-guard. If the writer populated
        // `requestedAt` AND it predates this process's boot, the request was
        // issued for a previous bridge incarnation — skipping it short-circuits
        // the restart-nonce boot loop even when the doc-clear in the restart
        // branch (the primary fix) failed on the prior run. Missing /
        // unparseable `requestedAt` falls through to the in-memory nonce dedup
        // (current behavior — safe for same-process re-fires).
        const requestedAtMs = firestoreDateToMs(ctrl.requestedAt)
        if (requestedAtMs !== null && requestedAtMs < this.processStartedAt) {
            return { handled: false, reason: "stale-request" }
        }
        if (nonce === this.lastHandledNonce) {
            return { handled: false, reason: "duplicate-nonce" }
        }
        // Consume the nonce up front: idempotent across the heartbeat's own
        // config re-fires AND across an action that throws.
        this.lastHandledNonce = nonce

        switch (action) {
            case "resync": {
                console.log("[Control] resync requested — re-reading desk + republishing state")
                if (this.deps.x32.isConnected()) {
                    await this.deps.x32.syncFullState(this.deps.getMonitorBuses())
                }
                await this.deps.transport.writeFullState()
                return { handled: true, action }
            }
            case "reconnect": {
                console.log("[Control] reconnect requested — forcing X32 socket reconnect")
                this.deps.x32.forceReconnect()
                return { handled: true, action }
            }
            case "restart": {
                console.warn("[Control] restart requested — relaunching the bridge process")
                // v10.0.5 — clear the persisted bridgeControl field BEFORE
                // relaunching. The next boot's config snapshot will fire the
                // listener WITHOUT a `bridgeControl` field, so the dispatcher
                // ignores it (no-control). Defense-in-depth: even if a writer
                // races and re-populates the doc between this clear and the
                // restart hook firing, the in-memory nonce dedup blocks the
                // CURRENT process from double-firing, and the
                // `requestedAt < processStartedAt` skip-guard blocks the NEXT
                // process from re-firing the same nonce. Failure-mode: log and
                // proceed with restart (refusing to restart on a clear-failure
                // would itself wedge the bridge).
                try {
                    await this.deps.clearBridgeControl()
                } catch (err) {
                    console.error(
                        "[Control] clearBridgeControl failed before restart:",
                        (err as Error).message,
                    )
                }
                this.deps.restart()
                return { handled: true, action }
            }
            case "selftest": {
                console.log("[Control] selftest requested — writing diagnostic snapshot")
                const diag = collectDiagnostics({
                    x32: this.deps.x32,
                    transport: this.deps.transport,
                    logger: this.deps.logger,
                    startedAt: this.deps.startedAt,
                    now: this.deps.now,
                })
                await this.deps.writeSelftest({
                    ...diag,
                    ts: (this.deps.now ?? Date.now)(),
                    bridgeVersion: process.env.BRIDGE_VERSION || "2.0.0",
                })
                return { handled: true, action }
            }
            default:
                console.warn(`[Control] unknown bridgeControl action: ${String(action)}`)
                return { handled: false, reason: "unknown-action" }
        }
    }
}
