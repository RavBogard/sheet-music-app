import "server-only"

import type { Firestore, Timestamp } from "firebase-admin/firestore"

/**
 * Shared write step for the setlist-memory back-fills (library rows by
 * default; `setlists` for the service-class back-fill).
 *
 * Each row is written with `update` (never `set`, so a row deleted since the
 * scan is not recreated without its orgId) and a `lastUpdateTime`
 * precondition from the scanned snapshot, so a row someone edited during the
 * run is left alone. Rows written one at a time (bounded concurrency), so
 * one changed row never fails the whole run: it is reported in
 * `changedDuringRun` instead.
 */

const WRITE_CONCURRENCY = 10

export interface ConditionalRowUpdate {
    fileId: string
    updateTime: Timestamp | undefined
    patch: Record<string, unknown>
}

function changedSinceScan(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code
    // gRPC FAILED_PRECONDITION (9) / NOT_FOUND (5), or their string forms.
    return code === 9 || code === 5 || code === "failed-precondition" || code === "not-found"
}

export async function updateRowsIfUnchanged(
    db: Firestore,
    rows: ConditionalRowUpdate[],
    /** The collection the row ids live in. `fileId` is the doc id. */
    collection: string = "library_index",
    /**
     * When true, a write that fails for a reason other than its precondition
     * skips that row and is reported in `failed`; otherwise it aborts the run.
     */
    opts: { skipFailures?: boolean } = {},
): Promise<{
    written: Set<string>
    changedDuringRun: Set<string>
    failed: Array<{ id: string; message: string }>
}> {
    const written = new Set<string>()
    const changedDuringRun = new Set<string>()
    const failed: Array<{ id: string; message: string }> = []
    let next = 0
    const worker = async () => {
        while (next < rows.length) {
            const row = rows[next++]
            const ref = db.collection(collection).doc(row.fileId)
            try {
                if (row.updateTime) {
                    await ref.update(row.patch, { lastUpdateTime: row.updateTime })
                } else {
                    await ref.update(row.patch)
                }
                written.add(row.fileId)
            } catch (error) {
                if (changedSinceScan(error)) {
                    changedDuringRun.add(row.fileId)
                } else if (opts.skipFailures) {
                    failed.push({
                        id: row.fileId,
                        message: error instanceof Error ? error.message : String(error),
                    })
                } else {
                    throw error
                }
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(WRITE_CONCURRENCY, rows.length) }, worker),
    )
    return { written, changedDuringRun, failed }
}
