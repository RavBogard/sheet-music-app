/**
 * Remote error/event log → Firestore (v10.0.4 — O1).
 *
 * THE single biggest unblind for a box that is ON but physically unreachable
 * for ~2 days: every diagnostic in the bridge is `console.*`, redirected only to
 * the LOCAL Electron UI (main.ts). If the bridge throws at hour 30 there is zero
 * remote trace. This logger captures error/warn lines into a bounded in-memory
 * ring and periodically flushes them to a single capped Firestore doc that an
 * admin can read remotely (Firebase MCP / get_bridge_health surfaces lastError).
 *
 * Hard constraints for the one box we can't touch (OBSERVABILITY P0-1):
 *   - BOUNDED — in-memory ring + the published array are both capped (~50), so
 *     it can't grow without bound on a long-running bridge.
 *   - RATE-LIMITED — error/warn only, never per-line: a burst coalesces into ONE
 *     debounced batch write every few seconds. Cannot blow Firestore quota.
 *   - FAIL-OPEN — every path is try/catch-swallowed and the flush failure path is
 *     SILENT (no console.* → it can never recurse through the console intercept
 *     that feeds it, and a logger fault can never destabilize the bridge).
 */

import * as admin from "firebase-admin"

export type LogLevel = "error" | "warn"

export interface LogEntry {
    level: LogLevel
    msg: string
    ts: number
}

export interface RemoteLoggerOptions {
    /** Max entries kept in memory + published (default 50). */
    ringSize?: number
    /** Debounce window before a batch flush (default 5000ms). Never per-line. */
    flushDebounceMs?: number
    /** Truncate any single message to this length (default 500 chars). */
    maxMsgLen?: number
    /** Firestore doc to publish to (default "monitor-live/bridgeLog"). */
    docPath?: string
    /** Injectable clock for deterministic tests. */
    now?: () => number
}

export class RemoteLogger {
    private readonly db: admin.firestore.Firestore
    private ring: LogEntry[] = []
    private errCount = 0
    private lastError: { msg: string; ts: number } | null = null
    private flushTimer: ReturnType<typeof setTimeout> | null = null
    private dirty = false
    private stopped = false

    private readonly ringSize: number
    private readonly flushDebounceMs: number
    private readonly maxMsgLen: number
    private readonly docPath: string
    private readonly now: () => number

    constructor(db: admin.firestore.Firestore, opts: RemoteLoggerOptions = {}) {
        this.db = db
        this.ringSize = Math.max(1, opts.ringSize ?? 50)
        this.flushDebounceMs = Math.max(0, opts.flushDebounceMs ?? 5_000)
        this.maxMsgLen = Math.max(1, opts.maxMsgLen ?? 500)
        this.docPath = opts.docPath ?? "monitor-live/bridgeLog"
        this.now = opts.now ?? Date.now
    }

    /**
     * Capture one error/warn line. Pushes to the bounded ring, bumps the running
     * counter + most-recent record, and schedules a debounced batch flush. Pure
     * in-memory + fail-open — NEVER throws, so it is safe to call from the
     * console intercept on every error/warn.
     */
    record(level: LogLevel, msg: string): void {
        try {
            if (this.stopped) return
            const text = String(msg ?? "").slice(0, this.maxMsgLen)
            const ts = this.now()
            this.ring.push({ level, msg: text, ts })
            // Trim from the front so the ring holds the most-recent N.
            if (this.ring.length > this.ringSize) {
                this.ring.splice(0, this.ring.length - this.ringSize)
            }
            this.errCount++
            this.lastError = { msg: text, ts }
            this.dirty = true
            this.scheduleFlush()
        } catch {
            // Fail-open — a logger fault must never break the caller's console.*.
        }
    }

    private scheduleFlush(): void {
        // Coalesce a burst into ONE flush: while a flush is already pending, new
        // records just ride the same timer (rate-limit — never per-line).
        if (this.flushTimer || this.stopped) return
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null
            void this.flush()
        }, this.flushDebounceMs)
    }

    /**
     * Publish the current ring + counters to the capped Firestore doc. Idempotent
     * when nothing changed. SILENT on failure (no console.* → no recursion); the
     * in-memory ring is preserved and the next record reschedules a retry.
     */
    async flush(): Promise<void> {
        if (!this.dirty) return
        this.dirty = false
        const entries = this.ring.slice(-this.ringSize)
        try {
            await this.db.doc(this.docPath).set(
                {
                    entries,
                    errCount: this.errCount,
                    lastError: this.lastError,
                    bridgeVersion: process.env.BRIDGE_VERSION || "2.0.0",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true },
            )
        } catch {
            // Fail-open + SILENT (no console — would recurse via the intercept).
            // Mark dirty so the next record retries the flush.
            this.dirty = true
        }
    }

    /** O2 — running count of captured error/warn lines (for the heartbeat). */
    getErrCount(): number {
        return this.errCount
    }

    /** O2 — most-recent captured error/warn line (for the heartbeat), or null. */
    getLastError(): { msg: string; ts: number } | null {
        return this.lastError
    }

    /** Stop scheduling flushes (shutdown). The ring + counters are retained. */
    stop(): void {
        this.stopped = true
        if (this.flushTimer) {
            clearTimeout(this.flushTimer)
            this.flushTimer = null
        }
    }
}
