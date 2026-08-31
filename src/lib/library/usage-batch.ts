/**
 * Batched fetch of song-usage summaries.
 *
 * `GET /api/library/usage` hard-caps at 100 fileIds per request (see
 * `src/app/api/library/usage/route.ts` — >100 is a 400, not a truncation).
 * The library is 762+ charts, so the client MUST issue one request per
 * 100-id chunk and merge the results.
 *
 * The prior implementation took a single `fileIds.slice(0, 100)` and never
 * looped, so every chart past the first 100 (alphabetical order) had no
 * usage entry at all: no "last used" badge, and silently wrong behaviour
 * under the Recency filter (`applyLibraryFilters` treats a missing entry as
 * "never played"). It also swallowed every failure with `.catch(() => {})`.
 *
 * This module therefore does two things the old path did not:
 *   1. covers EVERY id, and
 *   2. reports which ids could not be fetched, so the caller can make the
 *      gap visible instead of rendering a confidently-wrong recency filter.
 */

export type UsageSummary = { lastUsedDate: string; totalUses: number }
export type UsageMap = Record<string, UsageSummary | null>

/** Must stay <= the server-side cap in /api/library/usage. */
export const USAGE_BATCH_SIZE = 100

/** Max requests in flight at once — the `api` rate limiter allows 60/min. */
export const USAGE_BATCH_CONCURRENCY = 4

/** Split `ids` into fixed-size chunks. A trailing partial chunk is kept. */
export function chunkIds(ids: string[], size: number = USAGE_BATCH_SIZE): string[][] {
    if (size < 1) throw new Error('chunkIds: size must be >= 1')
    const out: string[][] = []
    for (let i = 0; i < ids.length; i += size) {
        out.push(ids.slice(i, i + size))
    }
    return out
}

export interface FetchUsageBatchesOptions {
    /** Chunk size; defaults to the server cap. */
    batchSize?: number
    /** Requests in flight at once. */
    concurrency?: number
    /** Called after each successful batch with just that batch's slice. */
    onBatch?: (partial: UsageMap) => void
}

export interface FetchUsageBatchesResult {
    /** Merged map of every batch that succeeded. */
    map: UsageMap
    /** Ids belonging to batches that failed. Empty => the map is complete. */
    failedIds: string[]
}

/**
 * Fetch usage for every id in `ids` via `fetchBatch`, one call per chunk.
 *
 * Never throws: a rejected batch contributes its ids to `failedIds` so the
 * caller can distinguish "this chart has never been played" from "we do not
 * know whether this chart has been played".
 */
export async function fetchUsageBatches(
    ids: string[],
    fetchBatch: (batch: string[]) => Promise<UsageMap>,
    options: FetchUsageBatchesOptions = {},
): Promise<FetchUsageBatchesResult> {
    const {
        batchSize = USAGE_BATCH_SIZE,
        concurrency = USAGE_BATCH_CONCURRENCY,
        onBatch,
    } = options

    // De-duplicate while preserving order — a duplicate id would otherwise
    // waste a slot in the 100-id budget.
    const unique = Array.from(new Set(ids))
    if (unique.length === 0) return { map: {}, failedIds: [] }

    const batches = chunkIds(unique, batchSize)
    const map: UsageMap = {}
    const failedIds: string[] = []

    let cursor = 0
    const workers = Array.from(
        { length: Math.max(1, Math.min(concurrency, batches.length)) },
        async () => {
            while (cursor < batches.length) {
                const batch = batches[cursor++]
                try {
                    const partial = await fetchBatch(batch)
                    // Guard against a non-object body (e.g. an HTML error page
                    // that still parsed) so a bad response can't poison the map.
                    if (partial && typeof partial === 'object' && !Array.isArray(partial)) {
                        Object.assign(map, partial)
                        onBatch?.(partial)
                    } else {
                        failedIds.push(...batch)
                    }
                } catch {
                    failedIds.push(...batch)
                }
            }
        },
    )

    await Promise.all(workers)

    return { map, failedIds }
}
