import "server-only"

/**
 * Batch chart intake — the per-item processor.
 *
 * `processBatchItem` imports one item of a committed batch and
 * `finalizeBatch` closes the batch out. The HTTP executor
 * (`http-executor.ts`) and the MCP batch tools drive both. The invariants:
 *
 *  1. Every item import is idempotent. `processBatchItem` re-reads the item and
 *     returns it untouched when it already holds a terminal status, so a
 *     duplicate trigger (or a human re-running the batch) can never double-import
 *     a chart. `force` is the only way past that guard, and it is how a human's
 *     "yes, import it anyway" decision on a parked item gets executed.
 *  2. One bad chart costs exactly one `failed` item: every failure is recorded
 *     on the item rather than thrown.
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
import { logger } from "@/lib/logger"

import { getBatch, updateItem } from "./batch-store"
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
 * here would leave the batch with no record of which chart broke.
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

    // Idempotent retry guard — a duplicate run over an item that already
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
            // failure, so let the original error surface. The executor
            // records it, and the resume cron sweeps the batch up.
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
        // Multi-tenant phase 2 (W5): the batch's tenant, stamped atomically
        // with the row (the stampOrg below stays as a no-op guard).
        orgId: batch.orgId,
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
                  ...(item.driveParents && item.driveParents.length > 0
                      ? { parents: item.driveParents }
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
    // Only terminal outcomes that can never be re-run release their bytes.
    // Parked items keep them so a later `force` has something to import, and
    // so do FAILED items: a failure is retryable (`resolve_upload_item` with
    // action 'force'), and deleting the bytes would turn a transient pipeline
    // error into a permanent `staged_bytes_missing`.
    if (
        item.stagedPath &&
        (patch.status === "imported" || patch.status === "skipped")
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
 * Close a batch out: recompute `counts` from whatever the items actually say
 * and write `done` + `finishedAt`.
 *
 * Called by the HTTP executor once no item is left to run, so a batch never
 * stays parked in `processing` forever. Counts are recomputed here
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
