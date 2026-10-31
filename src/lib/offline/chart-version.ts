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
 * Whether a cached entry should be re-fetched.
 *
 * - `cached === undefined`: not cached at all. That is a plain save, not a
 *   refresh, so this returns false.
 * - No server version known: nothing to compare against, never stale.
 * - Cached without a version (saved before PERF-18): stale, fetched once.
 * - Otherwise: stale when the two differ.
 */
export function isCachedChartStale(
    cached: string | null | undefined,
    server: string | null | undefined,
): boolean {
    if (cached === undefined) return false
    if (!server) return false
    return cached !== server
}
