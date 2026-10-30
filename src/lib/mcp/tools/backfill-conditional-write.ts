import "server-only"

import type { Firestore, Timestamp } from "firebase-admin/firestore"

/**
 * Shared write step for the setlist-memory library back-fills.
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
): Promise<{ written: Set<string>; changedDuringRun: Set<string> }> {
    const written = new Set<string>()
    const changedDuringRun = new Set<string>()
    let next = 0
    const worker = async () => {
        while (next < rows.length) {
            const row = rows[next++]
            const ref = db.collection("library_index").doc(row.fileId)
            try {
                if (row.updateTime) {
                    await ref.update(row.patch, { lastUpdateTime: row.updateTime })
                } else {
                    await ref.update(row.patch)
                }
                written.add(row.fileId)
            } catch (error) {
                if (!changedSinceScan(error)) throw error
                changedDuringRun.add(row.fileId)
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(WRITE_CONCURRENCY, rows.length) }, worker),
    )
    return { written, changedDuringRun }
}
