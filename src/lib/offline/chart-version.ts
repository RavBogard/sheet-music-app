/**
 * PERF-18: the version of a chart's bytes, as the offline store compares it.
 *
 * A chart can be healed in place under the same fileId (reconcile mirror,
 * shortcut-target resolve, finalize-heal), so an iPad that cached the old
 * bytes needs something other than the fileId to notice. The library row's
 * `contentHash` (sha256 of the stored bytes) is the authoritative identity;
 * a row that has not been hashed yet falls back to its `updatedAt`.
 *
 * Pure and dependency-free: the server builds the map, the client compares.
 */

/** Map of fileId -> version string, as handed to Perform in its initial frame. */
export type ChartVersions = Readonly<Record<string, string>>

function millisOf(raw: unknown): number | null {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw
    if (typeof raw === "string" && raw) {
        const ms = Date.parse(raw)
        return Number.isFinite(ms) && ms > 0 ? ms : null
    }
    if (raw && typeof raw === "object") {
        const o = raw as { toMillis?: () => number; seconds?: number; _seconds?: number }
        if (typeof o.toMillis === "function") {
            const ms = o.toMillis()
            return Number.isFinite(ms) && ms > 0 ? ms : null
        }
        const s = typeof o.seconds === "number" ? o.seconds : o._seconds
        if (typeof s === "number" && s > 0) return s * 1000
    }
    return null
}

/**
 * The version string for a `library_index` row, or null when the row carries
 * neither a content hash nor an update time. `contentHash` is stored as
 * `{ alg, value, ... }`; a bare string is accepted too.
 */
export function chartVersionOf(row: Record<string, unknown> | undefined | null): string | null {
    if (!row) return null
    const h = row.contentHash
    const hash =
        typeof h === "string"
            ? h
            : h && typeof h === "object" && typeof (h as { value?: unknown }).value === "string"
              ? (h as { value: string }).value
              : ""
    if (hash.trim()) return `h:${hash.trim()}`
    const ms = millisOf(row.updatedAt)
    return ms !== null ? `u:${ms}` : null
}

/**
 * What to do about a chart that IS cached, given its saved version and the
 * server's current one:
 *
 * - `none`: nothing to compare against (no server version), or already current.
 * - `hash-check`: the server knows a content hash. Hash the bytes on the
 *   device first (idle time); a match only stamps the version, a mismatch
 *   leads to one verified refresh.
 * - `refresh`: an `updatedAt` version that differs from the saved one.
 *   Re-fetch, type-checked, and replace in place.
 *
 * An unversioned (legacy) entry against an `updatedAt` version can't be
 * compared, so it is left alone rather than assumed stale.
 */
export type CachedChartPlan = "none" | "hash-check" | "refresh"

export function planForCachedChart(
    cached: string | null,
    server: string | null | undefined,
): CachedChartPlan {
    if (!server || cached === server) return "none"
    if (server.startsWith("h:")) return "hash-check"
    return cached === null ? "none" : "refresh"
}
