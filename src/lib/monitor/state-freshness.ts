/**
 * Live-mixer-state freshness math (consumer side).
 *
 * The bridge stamps `monitor-live/state.updatedAt` on every write. The MCP
 * read tools already surface `stateAgeSeconds` / `stateStale` off it
 * (`server-monitor.ts`, threshold 90s, shipped 70357f47f) — but the iPad
 * ignored it and instead inferred "Live/Stale" from `lastSnapshotAt` (when a
 * *changed* snapshot last arrived). That proxy LIES on page-load against a
 * frozen desk: `onSnapshot` fires once with the stale doc, `lastSnapshotAt`
 * becomes "now", and the UI shows green "Live" over a 2-hour-old value — the
 * exact "green health + dead writes" trap (coder-2 F-1 / monitor-f1-probe).
 *
 * AUDIT-consumers C-6: the iPad should derive staleness from
 * `state.updatedAt`, the same authoritative signal the MCP uses, collapsing
 * the 10s / 90s / 120s threshold sprawl toward one source.
 *
 * These pure helpers intentionally MIRROR the server-side copies in
 * `src/lib/mcp/server-monitor.ts` (which can't be imported here — it pulls in
 * admin-SDK / error-envelope server code). Both reference the same documented
 * 90s rationale; keep them in lock-step if either changes.
 */

/** See server-monitor.ts STALE_STATE_THRESHOLD_SECONDS for the 90s rationale. */
export const STALE_STATE_THRESHOLD_SECONDS = 90

/**
 * Coerce a FirestoreDate-ish value (Timestamp | Date | ISO string | epoch
 * millis | raw `{seconds, nanoseconds}`) to epoch millis; null when absent or
 * uncoercible.
 */
export function firestoreDateToMillis(v: unknown): number | null {
    if (v == null) return null
    if (typeof v === "number") return Number.isFinite(v) ? v : null
    if (typeof v === "string") {
        const ms = Date.parse(v)
        return Number.isNaN(ms) ? null : ms
    }
    if (typeof v === "object") {
        const o = v as {
            toMillis?: () => number
            toDate?: () => Date
            seconds?: number
            nanoseconds?: number
        }
        if (typeof o.toMillis === "function") {
            try {
                return o.toMillis()
            } catch {
                return null
            }
        }
        if (typeof o.toDate === "function") {
            try {
                return o.toDate().getTime()
            } catch {
                return null
            }
        }
        if (typeof o.seconds === "number") {
            const nanos = typeof o.nanoseconds === "number" ? o.nanoseconds : 0
            return o.seconds * 1000 + Math.floor(nanos / 1e6)
        }
    }
    return null
}

/**
 * Age of the live mixer snapshot in whole seconds = (now − updatedAt). Accepts
 * either a pre-coerced epoch-millis number (what the store holds) or a raw
 * FirestoreDate-ish value. Returns null when `updatedAt` is missing or
 * uncoercible. `now` is injectable for deterministic tests. Pure.
 */
export function computeStateAgeSeconds(
    updatedAt: unknown,
    now: number = Date.now(),
): number | null {
    const ms = firestoreDateToMillis(updatedAt)
    if (ms == null) return null
    return Math.round((now - ms) / 1000)
}

/** A snapshot with no timestamp, or older than the threshold, is stale. */
export function isStateStale(ageSeconds: number | null): boolean {
    return ageSeconds == null || ageSeconds > STALE_STATE_THRESHOLD_SECONDS
}
