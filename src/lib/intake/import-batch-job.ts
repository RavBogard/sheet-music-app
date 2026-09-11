import "server-only"

/**
 * Batch chart intake — the Inngest processor.
 *
 * One batch document becomes one Inngest run; each item inside it becomes one
 * durable `step.run`. Steps are the retry boundary, so the two invariants that
 * matter are:
 *
 *  1. Every step is idempotent. `processBatchItem` re-reads the item and
 *     returns it untouched when it already holds a terminal status, so an
 *     Inngest replay (or a human re-firing the event) can never double-import
 *     a chart. `force` is the only way past that guard, and it is how a human's
 *     "yes, import it anyway" decision on a parked item gets executed.
 *  2. Every step returns a tiny value. Inngest serializes step output into the
 *     run's history with a 4MB ceiling — the same reason `generatePdfJob`
 *     saves its PDF inside the step and returns only a URL. Each item step
 *     returns `{ itemId, status }`; the chart bytes never leave the closure.
 *
 * Staged-byte lifecycle: imported and failed items release their Storage
 * object (best-effort — a leftover blob is a sweep problem, never a
 * correctness one); parked items KEEP theirs, because the whole point of a
 * park is that a human may come back and force the import, and that needs the
 * bytes to still be there.
 */

import { DriveClient } from "@/lib/google-drive"
import { processChartUpload } from "@/lib/library-upload"
import { stampOrg } from "@/lib/mcp/org-context"
import { inngest } from "@/inngest/client"
import { getFirestore, initAdmin } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"

import { getBatch, setBatchStatus, updateItem } from "./batch-store"
import {
    mapUploadResultToItem,
    recomputeCounts,
    TERMINAL_ITEM_STATUSES,
} from "./batch-outcome"
import { deleteStaged, downloadStaged } from "./staged-storage"
import { fetchDriveFileForUpload } from "./drive-folder"
import { BATCH_COLLECTION } from "./batch-types"
import type {
    BatchCounts,
    UploadBatchDoc,
    UploadBatchItem,
} from "./batch-types"

/** Event name the commit path sends and this function listens on. */
export const IMPORT_BATCH_EVENT = "library/import-batch"

/**
 * The slice of Inngest's `step` this module uses. Narrowing it to `run` keeps
 * `runImportBatch` drivable from a test with `{ run: (_n, fn) => fn() }`.
 *
 * The return type is `Promise<unknown>` rather than `Promise<T>` because
 * Inngest's real `step.run` returns the JSON-round-tripped shape of `T`
 * (`Jsonify<T>`), which is not assignable to `T` in general. Both step bodies
 * here return plain JSON-safe objects, so the one place the value is used
 * (`finish`) casts it back.
 */
export interface BatchStepLike {
    run<T>(name: string, fn: () => Promise<T>): Promise<unknown>
}

/** What each per-item step hands back to the run history (kept tiny on purpose). */
export interface BatchItemStepResult {
    itemId: string
    status: UploadBatchItem["status"]
}

/**
 * Import one batch item end to end: fetch bytes, run the canonical upload
 * pipeline, map the outcome onto the item, stamp the org, release staged bytes.
 *
 * Returns the item as written. Throws only `Error("batch_not_found")` /
 * `Error("item_not_found")` — EVERY other failure, expected (a Drive 404, a
 * duplicate, a dead staged object) or not (processChartUpload blowing up, a
 * Firestore transaction error), is recorded ON the item instead of thrown.
 *
 * That containment is what keeps a batch from stranding: an error escaping
 * here escapes the enclosing `step.run`, and after `retries: 2` the whole run
 * dies with the batch still `processing` and no record of which chart broke.
 * One bad chart must cost exactly one `failed` item.
 *
 * @param opts.force Re-run an already-terminal item and pass `force: true`
 *   through to `processChartUpload` (bypassing duplicate detection). This is
 *   the "human said import it anyway" path for a parked item.
 */
export async function processBatchItem(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    itemId: string,
    opts?: { force?: boolean },
): Promise<UploadBatchItem> {
    const force = !!opts?.force

    const batch = await getBatch(db, batchId)
    if (!batch) throw new Error("batch_not_found")
    const item = batch.items[itemId]
    if (!item) throw new Error("item_not_found")

    // Idempotent retry guard — an Inngest replay of a step that already
    // committed must be a no-op, not a second import.
    if (TERMINAL_ITEM_STATUSES.has(item.status) && !force) return item

    try {
        return await importOneItem(db, batch, item, force)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error(
            `[import-batch] item ${batchId}/${itemId} threw; recording as failed:`,
            message,
        )
        try {
            return itemAfter(
                await updateItem(db, batchId, itemId, {
                    status: "failed",
                    error: { code: "internal", message },
                }),
                itemId,
            )
        } catch {
            // Firestore itself is unavailable — there is nowhere to record the
            // failure, so let the original error surface. `onFailure` closes
            // the batch out once Inngest gives up.
            throw err
        }
    }
}

/**
 * The item import proper. Split out of `processBatchItem` so the latter is
 * purely "guard, contain, record" and this can read straight through.
 */
async function importOneItem(
    db: FirebaseFirestore.Firestore,
    batch: UploadBatchDoc & { batchId: string },
    item: UploadBatchItem,
    force: boolean,
): Promise<UploadBatchItem> {
    const { batchId } = batch
    const { itemId } = item

    // ─── bytes ─────────────────────────────────────────────────────────────
    let buffer: Buffer
    let mimeType = item.mimeType
    let originalFileName = item.fileName

    if (item.driveFileId) {
        const fetched = await fetchDriveFileForUpload(
            new DriveClient(),
            item.driveFileId,
        )
        if (!fetched.ok) {
            return itemAfter(
                await updateItem(db, batchId, itemId, {
                    status: "failed",
                    error: { code: fetched.code, message: fetched.message },
                    parked: undefined,
                }),
                itemId,
            )
        }
        buffer = fetched.buffer
        mimeType = fetched.mimeType
        originalFileName = fetched.originalFileName
    } else {
        if (!item.stagedPath) {
            return itemAfter(
                await updateItem(db, batchId, itemId, {
                    status: "failed",
                    error: {
                        code: "no_bytes",
                        message: "Item has neither staged bytes nor a Drive file id.",
                    },
                    parked: undefined,
                }),
                itemId,
            )
        }
        try {
            buffer = await downloadStaged(item.stagedPath)
        } catch (err) {
            // The staged object expired, was swept, or never landed. That is an
            // item-level failure, not a batch-level one.
            return itemAfter(
                await updateItem(db, batchId, itemId, {
                    status: "failed",
                    error: {
                        code: "staged_bytes_missing",
                        message: err instanceof Error ? err.message : String(err),
                    },
                    parked: undefined,
                }),
                itemId,
            )
        }
    }

    // ─── the canonical pipeline ────────────────────────────────────────────
    const result = await processChartUpload({
        buffer,
        originalFileName,
        mimeType,
        title: item.title,
        collection: batch.defaults?.collection,
        tags: batch.defaults?.tags,
        uploaderUid: batch.ownerUid,
        force,
        source: item.driveFileId ? "drive-sync" : "upload",
        driveMetadata: item.driveFileId
            ? {
                  driveFileId: item.driveFileId,
                  // Populated by the Drive-folder listing; absent for a
                  // dropzone item, and omitted rather than sent as undefined.
                  ...(item.driveMd5Checksum
                      ? { md5Checksum: item.driveMd5Checksum }
                      : {}),
                  ...(item.driveModifiedTime
                      ? { modifiedTime: item.driveModifiedTime }
                      : {}),
              }
            : undefined,
    })

    const patch = mapUploadResultToItem(result)

    // ─── org stamp ─────────────────────────────────────────────────────────
    if (patch.status === "imported" && patch.resultFileId) {
        await stampOrg(db, patch.resultFileId, batch.orgId)
    }

    // ─── staged cleanup ────────────────────────────────────────────────────
    // Parked items keep their bytes so a later `force` has something to import.
    if (
        item.stagedPath &&
        (patch.status === "imported" || patch.status === "failed")
    ) {
        await deleteStaged(item.stagedPath).catch((err) =>
            logger.warn(
                `[import-batch] staged cleanup failed for ${item.stagedPath}:`,
                err,
            ),
        )
    }

    return itemAfter(await updateItem(db, batchId, itemId, patch), itemId)
}

/** Pull one item out of the doc `updateItem` returned. */
function itemAfter(
    doc: { items: Record<string, UploadBatchItem> },
    itemId: string,
): UploadBatchItem {
    const item = doc.items[itemId]
    if (!item) throw new Error("item_not_found")
    return item
}

/**
 * Drive one committed batch to completion.
 *
 * Items are processed in `itemId` order so a replayed run visits the same
 * steps in the same order (Inngest matches memoized steps by name AND
 * position). Only `staged` / `pending` items are queued — anything already
 * terminal is skipped outright, which is what makes a whole-run retry cheap.
 *
 * Returns the batch's final counts.
 */
export async function runImportBatch(
    db: FirebaseFirestore.Firestore,
    batchId: string,
    step: BatchStepLike,
): Promise<BatchCounts> {
    const batch = await getBatch(db, batchId)
    if (!batch) throw new Error("batch_not_found")

    await setBatchStatus(db, batchId, "processing")

    const queued = Object.values(batch.items)
        .filter((i) => i.status === "staged" || i.status === "pending")
        .map((i) => i.itemId)
        .sort()

    for (const itemId of queued) {
        await step.run(
            `item-${itemId}`,
            async (): Promise<BatchItemStepResult> => {
                const item = await processBatchItem(db, batchId, itemId)
                return { itemId: item.itemId, status: item.status }
            },
        )
    }

    const counts = await step.run("finish", () => finalizeBatch(db, batchId))
    return counts as BatchCounts
}

/**
 * Close a batch out: recompute `counts` from whatever the items actually say
 * and write `done` + `finishedAt`.
 *
 * Called from the happy-path `finish` step AND from the function's `onFailure`
 * handler, so a run that Inngest gave up on still leaves a readable batch
 * rather than one parked in `processing` forever. Counts are recomputed here
 * rather than trusted because a crashed run may have left the derived cache
 * behind by one item.
 */
export async function finalizeBatch(
    db: FirebaseFirestore.Firestore,
    batchId: string,
): Promise<BatchCounts> {
    const batch = await getBatch(db, batchId)
    if (!batch) throw new Error("batch_not_found")

    const counts = recomputeCounts(batch.items)
    await db.collection(BATCH_COLLECTION).doc(batchId).update({
        status: "done",
        finishedAt: new Date(),
        counts,
    })
    return counts
}

/**
 * Inngest function. `concurrency: { limit: 3 }` caps how many batches run at
 * once so a 200-file drop can't monopolise the upload pipeline (and the
 * MuseScore/HEIC converters inside it) against interactive single uploads.
 */
export const importBatchJob = inngest.createFunction(
    {
        id: "library-import-batch",
        concurrency: { limit: 3 },
        retries: 2,
        /**
         * Last resort. `processBatchItem` contains per-item errors, so getting
         * here means something outside an item broke (Firestore unreachable
         * during the initial read, the `finish` step failing, a run cancelled
         * mid-flight). Whatever it was, the batch must not be left in
         * `processing`: a UI polling that status would spin forever.
         */
        onFailure: async ({ event }) => {
            const batchId = failedRunBatchId(event)
            if (!batchId) return
            initAdmin()
            try {
                await finalizeBatch(getFirestore(), batchId)
            } catch (err) {
                logger.error(
                    `[import-batch] onFailure could not finalize ${batchId}:`,
                    err,
                )
            }
        },
    },
    { event: IMPORT_BATCH_EVENT },
    async ({ event, step }) => {
        initAdmin()
        const batchId = (event.data as { batchId?: string }).batchId as string
        const counts = await runImportBatch(getFirestore(), batchId, step)
        return { batchId, counts }
    },
)

/**
 * Dig the original `batchId` out of an `inngest/function.failed` event, whose
 * `data.event` is the event that triggered the dead run.
 */
export function failedRunBatchId(failureEvent: unknown): string | null {
    const original = (
        failureEvent as {
            data?: { event?: { data?: { batchId?: unknown } } }
        } | null
    )?.data?.event?.data?.batchId
    return typeof original === "string" && original ? original : null
}
