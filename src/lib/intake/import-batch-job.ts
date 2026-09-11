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
import { mapUploadResultToItem, TERMINAL_ITEM_STATUSES } from "./batch-outcome"
import { deleteStaged, downloadStaged } from "./staged-storage"
import { fetchDriveFileForUpload } from "./drive-folder"
import type { BatchCounts, UploadBatchItem } from "./batch-types"

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
 * `Error("item_not_found")` — every upload-side failure is recorded ON the
 * item as `failed`, so one bad chart never aborts the batch.
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
                        message:
                            err instanceof Error ? err.message : String(err),
                    },
                }),
                itemId,
            )
        }
    }

    // ─── the canonical pipeline ────────────────────────────────────────────
    // `UploadBatchItem` carries only `driveFileId`, but a drive-folder writer
    // may have stashed the Drive provenance fields alongside it; pass them
    // through when present so `library_index` gets the same md5/modifiedTime
    // the cron drive-sync importer writes.
    const driveExtras = item as Partial<{
        md5Checksum: string
        modifiedTime: string
    }>

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
                  ...(driveExtras.md5Checksum
                      ? { md5Checksum: driveExtras.md5Checksum }
                      : {}),
                  ...(driveExtras.modifiedTime
                      ? { modifiedTime: driveExtras.modifiedTime }
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

    const counts = await step.run("finish", async () => {
        await setBatchStatus(db, batchId, "done", { finishedAt: new Date() })
        const final = await getBatch(db, batchId)
        if (!final) throw new Error("batch_not_found")
        return final.counts
    })
    return counts as BatchCounts
}

/**
 * Inngest function. `concurrency: { limit: 3 }` caps how many batches run at
 * once so a 200-file drop can't monopolise the upload pipeline (and the
 * MuseScore/HEIC converters inside it) against interactive single uploads.
 */
export const importBatchJob = inngest.createFunction(
    { id: "library-import-batch", concurrency: { limit: 3 }, retries: 2 },
    { event: IMPORT_BATCH_EVENT },
    async ({ event, step }) => {
        initAdmin()
        const batchId = (event.data as { batchId?: string }).batchId as string
        const counts = await runImportBatch(getFirestore(), batchId, step)
        return { batchId, counts }
    },
)
