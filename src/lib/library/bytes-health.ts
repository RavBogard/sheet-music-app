/**
 * PGR-04 — detect chart-bytes loss against the `library_index` truth table.
 *
 * Sibling of `storage-backup/health.ts` (PGR-03 — storage-backup staleness).
 * That alarm covers the off-Firebase BACKUP cron's health; this one covers the
 * inverse failure mode — a primary `library/{fileId}` Storage object silently
 * vanishing while its `library_index` row still claims it exists. The
 * 2026-05-23T14:04Z cron-blast incident (legacy `/api/cron/sync` sweep-deleted
 * 348 active-row bytes; disarmed at `e9442cae1`, hard-removed at `a41f9aef8`)
 * was discovered ~18h later via a band-iPad failure. This alarm catches the
 * next instance of that failure class within ~24h instead of "until the band
 * hits a 404."
 *
 * Detection contract:
 *   - the caller (cron route) pre-fetches the N most-recently-`lastSyncedAt`
 *     rows from `library_index` (default sample = 200; full library is ~568
 *     rows so 200 is near-100% to catch a 348-row blast). It hands the rows
 *     plus a Storage `bucket`-shaped probe to this helper.
 *   - the helper probes each row by listing `library/{fileId}*` and treats a
 *     row as "missing" iff the listing returns ZERO objects matching the
 *     fileId-anchored shape (`library/{fileId}` exact OR
 *     `library/{fileId}.${ext}`). One prefix listing per row catches all four
 *     known extensions (`.pdf` / `.xml` / `.mp3` / no-extension) — same
 *     shape `scripts/probe-gcs-versions-wider-blast.mjs` already validates.
 *   - the helper computes a `verdict` so the cron route's Sentry-level
 *     decision is testable in isolation. Dispatch thresholds:
 *       missingCount == 0                                → 'healthy' (silent)
 *       0  < missingCount <  ceil(sampleSize * 0.05)     → 'warning'
 *       ceil(sampleSize * 0.05) <= missingCount          → 'error'
 *     Empty sample (sampleSize=0) collapses to 'healthy'; the `>=ceil(0)`
 *     formula would otherwise alarm on no-data which is meaningless noise.
 *
 * Pure-ish: the only impurity is the bucket prefix listing. `nowMs` is taken
 * so future drift checks (e.g. "row claims fresh sync but bytes pre-date row
 * by months") can extend the verdict without an API break.
 *
 * Out of scope (hard boundaries, per the dispatch):
 *   - no auto-heal / restoration ops (single-owner per
 *     `[[feedback_single_owner_destructive_runs]]`)
 *   - no other Storage subtrees (`charts-backup/*`, `monitor-live/*`, etc.)
 *   - no schema or sync-engine changes
 */

/** Sample size when the cron route doesn't override. 200 ≈ 35% of the active
 * library (~568 rows per `[[project_orphan_baseline]]`). A 5%-threshold
 * error alarm at that sample size requires 10+ missing rows — high enough to
 * filter benign orphan-mark-then-delete ops, low enough to catch a 348-row
 * blast with near-100% probability. */
export const DEFAULT_LIBRARY_BYTES_SAMPLE_SIZE = 200

/** Cap on entries recorded in the `missing[]` report. Bounded so a runaway
 * outage doesn't bloat the cron response payload or Sentry extras. */
export const DEFAULT_LIBRARY_BYTES_MAX_REPORTED = 20

/** Fraction of the sample treated as a high-confidence blast signal. */
export const LIBRARY_BYTES_ERROR_FRACTION = 0.05

/** Minimal `library_index` row shape this helper needs. Other fields ignored. */
export interface LibraryBytesRow {
    fileId: string
    lastSyncedAt?: unknown
    updatedAt?: unknown
}

/**
 * Bucket-shaped probe interface. Decouples the helper from
 * `@google-cloud/storage` so tests don't need a real bucket. The real cron
 * wiring is `getStorage().bucket()` from `firebase-admin/storage`, whose
 * `getFiles` matches this shape.
 */
export interface LibraryBytesBucket {
    getFiles(opts: { prefix: string }): Promise<[Array<{ name: string }>]>
}

export interface LibraryBytesMissingEntry {
    fileId: string
    /** Parsed lastSyncedAt as epoch ms; null if the row had no parseable ts. */
    lastSyncedAt: number | null
}

export type LibraryBytesVerdict = 'healthy' | 'warning' | 'error'

export interface LibraryBytesHealthResult {
    /** rows actually probed (may be < rows.length if maxScanned hit). */
    scanned: number
    /** sampleSize the helper aimed at (rows.length unless capped). */
    sampleSize: number
    /** total missing across the whole scan. */
    missingCount: number
    /** Up to `maxReported` entries; ordered as scanned (oldest-lastSyncedAt
     * first since the caller usually sorts most-recent-first then reverses,
     * but the helper doesn't reorder — it preserves caller intent). */
    missing: LibraryBytesMissingEntry[]
    /** Oldest `lastSyncedAt` (epoch ms) across ALL missing rows, not just
     * reported. null if no parseable timestamps among the missing. */
    oldestMissing: number | null
    /** Hours since `oldestMissing`, derived against `nowMs` — keeps the
     * Sentry-message phrasing testable without re-deriving in the route. */
    oldestMissingAgeHours: number | null
    verdict: LibraryBytesVerdict
}

/**
 * Coerce a Firestore-ish timestamp value to epoch-ms. Mirrors the shape
 * handler in `storage-backup/health.ts` so both alarms parse the same four
 * known timestamp variants (number, Date, ISO string, Firestore Timestamp).
 * Returns null for anything unparseable.
 */
function toMillis(value: unknown): number | null {
    if (value == null) return null
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (value instanceof Date) {
        const t = value.getTime()
        return Number.isFinite(t) ? t : null
    }
    if (typeof value === 'string') {
        if (value.length === 0) return null
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    if (typeof value === 'object') {
        const obj = value as { toMillis?: unknown; seconds?: unknown }
        if (typeof obj.toMillis === 'function') {
            try {
                const ms = (obj.toMillis as () => number).call(obj)
                return typeof ms === 'number' && Number.isFinite(ms) ? ms : null
            } catch {
                return null
            }
        }
        if (typeof obj.seconds === 'number' && Number.isFinite(obj.seconds)) {
            return obj.seconds * 1000
        }
    }
    return null
}

/** Pick the best available timestamp on a row: lastSyncedAt > updatedAt. */
function rowTimestampMs(row: LibraryBytesRow): number | null {
    return toMillis(row.lastSyncedAt) ?? toMillis(row.updatedAt)
}

/**
 * Decide whether the bucket listing for `library/{fileId}*` proves the row
 * still has bytes. The probe uses a single prefix listing because two known
 * fileId shapes (bare-UUID, `upload-<uuid>`) MUST anchor on the dot so a
 * shorter-prefix fileId doesn't false-match a longer-prefix sibling's
 * extension:
 *   - `library/{fileId}` exact   → no-extension variant
 *   - `library/{fileId}.{ext}`   → `.pdf` / `.xml` / `.mp3`
 * Anything past the dot we don't second-guess — Storage doesn't grow
 * extensions the rest of the codebase doesn't write.
 */
function listingProvesPresent(fileId: string, files: Array<{ name: string }>): boolean {
    const exact = `library/${fileId}`
    const dotted = `library/${fileId}.`
    for (const f of files) {
        if (!f.name) continue
        if (f.name === exact) return true
        if (f.name.startsWith(dotted)) return true
    }
    return false
}

/** Derive the verdict from the missing/sample counts. Pure; exported for
 * direct unit tests so we can exercise the boundary without spinning fakes
 * around the I/O path. */
export function deriveLibraryBytesVerdict(
    missingCount: number,
    sampleSize: number,
): LibraryBytesVerdict {
    if (missingCount <= 0) return 'healthy'
    if (sampleSize <= 0) return 'healthy'
    const errorThreshold = Math.ceil(sampleSize * LIBRARY_BYTES_ERROR_FRACTION)
    if (missingCount >= errorThreshold) return 'error'
    return 'warning'
}

/**
 * Probe a list of library_index rows for missing Storage bytes.
 *
 * Caller pre-fetches rows ordered by recency (typically `library_index`
 * `where status='active' orderBy lastSyncedAt desc limit N`). The helper
 * preserves caller order in its iteration + report — no internal re-sort.
 */
export async function checkLibraryBytesHealth(
    rows: LibraryBytesRow[],
    bucket: LibraryBytesBucket,
    nowMs: number,
    opts?: { maxReported?: number; maxScanned?: number },
): Promise<LibraryBytesHealthResult> {
    const maxReported = opts?.maxReported ?? DEFAULT_LIBRARY_BYTES_MAX_REPORTED
    const sampleSize = rows.length
    const maxScanned = opts?.maxScanned ?? sampleSize
    const cap = Math.min(sampleSize, maxScanned)

    const missing: LibraryBytesMissingEntry[] = []
    let missingCount = 0
    let oldestMissing: number | null = null
    let scanned = 0

    for (let i = 0; i < cap; i++) {
        const row = rows[i]
        if (!row || typeof row.fileId !== 'string' || row.fileId.length === 0) continue
        let present: boolean
        try {
            const [files] = await bucket.getFiles({ prefix: `library/${row.fileId}` })
            present = listingProvesPresent(row.fileId, files)
        } catch {
            // Probe failure is NOT proof of absence — skip the row to avoid
            // false alarms during a Storage outage. The row is excluded from
            // `scanned` (the verdict denominator) so partial coverage is
            // visible to the caller via `scanned < sampleSize`. PGR-03
            // covers the separate "alarm cron itself broken" failure mode.
            continue
        }
        scanned++
        if (present) continue
        missingCount++
        const ts = rowTimestampMs(row)
        if (ts != null && (oldestMissing === null || ts < oldestMissing)) {
            oldestMissing = ts
        }
        if (missing.length < maxReported) {
            missing.push({ fileId: row.fileId, lastSyncedAt: ts })
        }
    }

    const oldestMissingAgeHours =
        oldestMissing != null ? (nowMs - oldestMissing) / (60 * 60 * 1000) : null

    return {
        scanned,
        sampleSize,
        missingCount,
        missing,
        oldestMissing,
        oldestMissingAgeHours,
        verdict: deriveLibraryBytesVerdict(missingCount, scanned),
    }
}
