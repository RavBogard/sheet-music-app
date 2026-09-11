import "server-only"

/**
 * Batch chart intake — the stuck-batch sweeper behind
 * `/api/cron/import-batches-resume`.
 *
 * `commit_upload_batch` seals the batch in Firestore BEFORE it calls
 * `enqueueImportBatch`, on purpose: the Firestore write is the record of
 * record, and losing the batch id to a transport exception would be worse than
 * a delayed import. The cost of that ordering is two failure modes, and this
 * sweeper closes both:
 *
 *  1. **Never started.** The trigger (an HTTP POST to `/api/intake/run`, or an
 *     Inngest send) failed, so a `committed` doc exists that nothing will ever
 *     process. Anything still `committed` after the grace window is re-sent.
 *  2. **Started and died.** The HTTP executor works a batch in slices and
 *     chains to a fresh invocation when its time budget runs out. If that
 *     re-trigger fails — or the function is killed mid-slice — the batch is
 *     left `processing` with items outstanding and no invocation coming back
 *     for it. So a `processing` batch whose newest item `updatedAt` (or
 *     `committedAt`, if no item has moved yet) is older than the window is
 *     re-sent too. This is the only thing standing between a dropped chain and
 *     a batch that spins forever in a polling UI.
 *
 * Re-sending is safe. The processor re-reads each item's status and skips
 * everything already terminal, so a duplicate trigger costs one no-op run, not
 * a duplicate import. That is why there is no attempt counter here: the sweep
 * keeps retrying until the batch actually reaches `done`.
 *
 * The staleness test runs IN MEMORY over a small `status in [...]` page rather
 * than as an inequality query: a `processing` batch's clock is "newest item
 * updatedAt", a value inside the items map, which Firestore cannot index, and
 * splitting it into a second indexed field would add a write to every item
 * mutation for a query that runs six times an hour. The page itself is still
 * ordered by `committedAt`, so the `upload_batches` (status ASC, committedAt
 * ASC) composite index in firestore.indexes.json is still required — the
 * emulator does not enforce composite indexes, so a missing one only shows up
 * against the real project.
 */

import { logger } from "@/lib/logger"
import { BATCH_COLLECTION } from "./batch-types"
import { enqueueImportBatch } from "./enqueue"

export interface ResumeStuckBatchesOptions {
    /**
     * How long a batch may sit in `committed` — measured from `committedAt`,
     * never from item stamps — before it counts as stuck.
     */
    olderThanMs?: number
    /**
     * How long a `processing` batch may go without any item moving before it
     * counts as stuck. Longer than `olderThanMs` on purpose: a live slice is
     * allowed up to `RUN_TIME_BUDGET_MS` (4 min) and one slow chart inside it
     * can hold the item map still for most of that. Defaults to 10 minutes.
     */
    processingOlderThanMs?: number
    /** Cap on batches re-sent per sweep — one cron tick is not a backfill. */
    limit?: number
}

export interface ResumeStuckBatchesResult {
    /** Batch ids that were successfully handed back to the queue. */
    resent: string[]
}

/** How many candidate docs one sweep reads before filtering in memory. */
const SCAN_LIMIT = 50

/** Firestore Timestamp | Date | ISO string → epoch ms, or null when absent. */
function toMillis(value: unknown): number | null {
    if (!value) return null
    if (value instanceof Date) return value.getTime()
    if (typeof value === "string") {
        const ms = Date.parse(value)
        return Number.isNaN(ms) ? null : ms
    }
    const maybe = value as { toMillis?: () => number; toDate?: () => Date }
    if (typeof maybe.toMillis === "function") return maybe.toMillis()
    if (typeof maybe.toDate === "function") return maybe.toDate().getTime()
    return null
}

/**
 * When this batch last visibly moved — the clock the staleness test runs on.
 *
 * The two statuses need DIFFERENT clocks:
 *
 * - `committed`: `committedAt`, and only that. Item `updatedAt` is stamped when
 *   bytes are STAGED, which happens before the commit — a batch whose files
 *   were dropped ten minutes ago and sealed thirty seconds ago has old item
 *   stamps and is not stuck at all. Reading them here would re-send it
 *   instantly, every sweep, for as long as it took the user to drop the files.
 * - `processing`: the newest item `updatedAt`, because that IS the progress
 *   signal — a live slice bumps an item every import — falling back to
 *   `committedAt` for a batch no item has moved in yet.
 *
 * `null` means "no idea": a doc with no stamp is left alone, because there is
 * no way to tell a stuck batch from one committed a second ago.
 */
function lastProgressAt(data: FirebaseFirestore.DocumentData): number | null {
    const committedAt = toMillis(data.committedAt)
    if (data.status !== "processing") return committedAt

    const items = (data.items ?? {}) as Record<string, { updatedAt?: unknown }>
    let newest: number | null = null
    for (const item of Object.values(items)) {
        const ms = toMillis(item?.updatedAt)
        if (ms !== null && (newest === null || ms > newest)) newest = ms
    }
    return newest ?? committedAt
}

export async function resumeStuckBatches(
    db: FirebaseFirestore.Firestore,
    options: ResumeStuckBatchesOptions = {},
): Promise<ResumeStuckBatchesResult> {
    const {
        olderThanMs = 5 * 60 * 1000,
        processingOlderThanMs = 10 * 60 * 1000,
        limit = 20,
    } = options
    const now = Date.now()

    // Ordered by `committedAt` so a project with more stuck batches than one
    // page shows this sweep the oldest ones, not an arbitrary slice. Firestore
    // treats `in` as an equality filter, so the existing
    // `(status ASC, committedAt ASC)` composite index covers this query
    // unchanged. The order-by also drops any doc missing `committedAt` — which
    // is the same set the staleness test below would skip for having no clock.
    const snap = await db
        .collection(BATCH_COLLECTION)
        .where("status", "in", ["committed", "processing"])
        .orderBy("committedAt", "asc")
        .limit(Math.max(SCAN_LIMIT, limit))
        .get()

    // Oldest progress first, so a sweep capped by `limit` drains the batches
    // that have been waiting longest rather than an arbitrary page of them.
    const stale = snap.docs
        .map((doc) => {
            const data = doc.data()
            const window =
                data.status === "processing" ? processingOlderThanMs : olderThanMs
            return { doc, at: lastProgressAt(data), cutoff: now - window }
        })
        .filter((row): row is { doc: (typeof snap.docs)[number]; at: number; cutoff: number } =>
            row.at !== null && row.at < row.cutoff,
        )
        .sort((a, b) => a.at - b.at)
        .slice(0, limit)

    const resent: string[] = []
    for (const { doc } of stale) {
        const queued = await enqueueImportBatch(doc.id)
        if (!queued.ok) {
            logger.warn(
                `[import-batches-resume] re-send failed for ${doc.id}: ${queued.message}`,
            )
            continue
        }
        resent.push(doc.id)
        if (queued.eventId) {
            // Keep the doc pointing at the trigger that is actually live, so a
            // later investigation follows the retry rather than the dead send.
            // (Field name predates the HTTP executor; on that path it holds an
            // `http:<batchId>:<ms>` marker rather than an Inngest event id.)
            await doc.ref.update({ inngestEventId: queued.eventId })
        }
    }

    if (resent.length > 0) {
        logger.warn(
            `[import-batches-resume] re-sent ${resent.length} stuck batch(es): ${resent.join(", ")}`,
        )
    }
    return { resent }
}
