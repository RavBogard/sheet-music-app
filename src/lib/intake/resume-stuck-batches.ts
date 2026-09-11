import "server-only"

/**
 * Batch chart intake — the stuck-batch sweeper behind
 * `/api/cron/import-batches-resume`.
 *
 * `commit_upload_batch` seals the batch in Firestore BEFORE it calls
 * `enqueueImportBatch`, on purpose: the Firestore write is the record of
 * record, and losing the batch id to a transport exception would be worse than
 * a delayed import. The cost of that ordering is a failure mode — Inngest is
 * unreachable for the length of the call — where a `committed` doc exists that
 * nothing will ever process. This sweeper closes it: anything still
 * `committed` after the grace window is re-sent.
 *
 * Re-sending is safe. The processor re-reads each item's status and skips
 * everything already terminal, so a duplicate event costs one no-op run, not a
 * duplicate import. That is why there is no attempt counter here: the sweep
 * keeps retrying until the processor actually advances the batch past
 * `committed`.
 *
 * Needs the `upload_batches` (status ASC, committedAt ASC) composite index in
 * firestore.indexes.json — the emulator does not enforce composite indexes, so
 * a missing index only shows up against the real project.
 */

import { logger } from "@/lib/logger"
import { BATCH_COLLECTION } from "./batch-types"
import { enqueueImportBatch } from "./enqueue"

export interface ResumeStuckBatchesOptions {
    /** How long a batch may sit in `committed` before it counts as stuck. */
    olderThanMs?: number
    /** Cap on batches re-sent per sweep — one cron tick is not a backfill. */
    limit?: number
}

export interface ResumeStuckBatchesResult {
    /** Batch ids that were successfully handed back to the queue. */
    resent: string[]
}

export async function resumeStuckBatches(
    db: FirebaseFirestore.Firestore,
    options: ResumeStuckBatchesOptions = {},
): Promise<ResumeStuckBatchesResult> {
    const { olderThanMs = 5 * 60 * 1000, limit = 20 } = options
    const cutoff = new Date(Date.now() - olderThanMs)

    // A `committed` doc with no `committedAt` is invisible to this inequality
    // (Firestore skips docs missing the field) — deliberate: without a stamp
    // there is no way to tell a stuck batch from one committed a second ago.
    const snap = await db
        .collection(BATCH_COLLECTION)
        .where("status", "==", "committed")
        .where("committedAt", "<", cutoff)
        .orderBy("committedAt", "asc")
        .limit(limit)
        .get()

    const resent: string[] = []
    for (const doc of snap.docs) {
        const queued = await enqueueImportBatch(doc.id)
        if (!queued.ok) {
            logger.warn(
                `[import-batches-resume] re-send failed for ${doc.id}: ${queued.message}`,
            )
            continue
        }
        resent.push(doc.id)
        if (queued.eventId) {
            // Keep the doc pointing at the event that is actually live, so a
            // later investigation follows the retry rather than the dead send.
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
