/**
 * Batch chart intake — mapping a `processChartUpload` result onto a batch item,
 * and the derived count roll-up.
 *
 * PURE module (no server imports) — see the header on `batch-types.ts`.
 */

import type { ProcessChartUploadResult } from "@/lib/library-upload"
import type { BatchCounts, ItemStatus, UploadBatchItem } from "./batch-types"

/** Statuses an item never leaves once it arrives. */
export const TERMINAL_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set<ItemStatus>([
    "imported",
    "parked",
    "failed",
    "skipped",
])

/**
 * Translate one pipeline result into the item patch the store should merge.
 *
 * - ok                 -> imported + resultFileId
 * - 409 `duplicate_*`  -> parked + the matched library row (Task 1 fields)
 * - anything else      -> failed + { code, message }
 *
 * Every patch names BOTH `parked` and `error`, clearing the one that does not
 * apply. An item can be re-processed (a human forcing a parked item through,
 * a retry of a failure), and `updateItem` merges patches onto the stored item —
 * without the explicit clear, forcing a parked item that then fails would leave
 * the stale `parked` block sitting next to the new `error`. `undefined` is how
 * the store spells "remove this field"; see `batch-store.updateItem`.
 */
export function mapUploadResultToItem(
    r: ProcessChartUploadResult,
): Partial<UploadBatchItem> {
    if (r.ok) {
        return {
            status: "imported",
            resultFileId: r.fileId,
            parked: undefined,
            error: undefined,
        }
    }
    if (r.code === "duplicate_exact" || r.code === "duplicate_similar") {
        return {
            status: "parked",
            parked: {
                reason: r.code,
                matchedFileId: r.matchedFileId ?? "",
                matchedTitle: r.matchedTitle ?? "",
                score: r.score,
            },
            error: undefined,
        }
    }
    return {
        status: "failed",
        error: { code: r.code, message: r.error },
        parked: undefined,
    }
}

/**
 * Recompute `counts` from the item map. `pending` folds the three in-flight
 * statuses (awaiting-bytes / staged / pending) so a caller can watch one number
 * to know whether the batch is still working.
 */
export function recomputeCounts(
    items: Record<string, UploadBatchItem>,
): BatchCounts {
    const counts: BatchCounts = {
        total: 0,
        pending: 0,
        imported: 0,
        parked: 0,
        failed: 0,
        skipped: 0,
    }
    for (const item of Object.values(items)) {
        counts.total += 1
        switch (item.status) {
            case "awaiting-bytes":
            case "staged":
            case "pending":
                counts.pending += 1
                break
            case "imported":
                counts.imported += 1
                break
            case "parked":
                counts.parked += 1
                break
            case "failed":
                counts.failed += 1
                break
            case "skipped":
                counts.skipped += 1
                break
        }
    }
    return counts
}
