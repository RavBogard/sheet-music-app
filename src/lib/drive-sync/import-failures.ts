import type { Firestore } from "firebase-admin/firestore"

/**
 * Chart Inbox import failures — the `chartImportQueue/{driveFileId}` rows the
 * Drive poller (`poller.ts` enqueueFailure) writes when a file in the inbox
 * cannot be imported (`drive_404`, `permission_lost`, `conversion_failed`,
 * `mime_unrecognized`, `dedup_blocked`, `storage_failed`,
 * `google_doc_skipped`, `unknown`). A later successful import of the same
 * file clears its row (`clearQueue`).
 *
 * Surfaced through the Chart Inbox MCP tools: `get_chart_inbox` lists them,
 * `sync_chart_inbox` takes `importFailures` actions. These used to be one
 * bucket of the AI library-review queue (`list_review_queue`,
 * `retry_enrichment` / `dismiss_failure` with kind 'import'); the AI part is
 * gone and this is what was kept.
 *
 * Tenancy: a queue row carries no orgId, only the file's Drive `parents`. A
 * tenant sees and acts on the rows whose parents include its inbox folder or
 * one of that folder's subfolders, and no others.
 */

export interface ImportFailureRow {
    /** chartImportQueue/{driveFileId}. */
    driveFileId: string
    driveName: string | null
    driveMimeType: string | null
    status: string
    errorMessage: string
    attemptCount: number
    firstSeenAt: string
    lastAttemptAt: string
}

export type ImportFailureAction = "retry" | "dismiss"

export type ImportFailureOutcome =
    | { driveFileId: string; action: ImportFailureAction; ok: true; status: "cleared" | "dismissed" }
    | { driveFileId: string; action: ImportFailureAction; ok: false; error: "not_found" }

/** Firestore `array-contains-any` accepts at most 30 disjuncts. */
const ARRAY_CONTAINS_ANY_MAX = 30

function str(v: unknown): string | null {
    return typeof v === "string" && v ? v : null
}

function inFolders(parents: unknown, folderIds: string[]): boolean {
    return Array.isArray(parents) && parents.some((p) => folderIds.includes(p as string))
}

/**
 * The undismissed failures for files in these folders, most recent first.
 * `folderIds` is the tenant's inbox folder plus its subfolders.
 */
export async function listImportFailures(
    db: Firestore,
    folderIds: string[],
    limit = 25,
): Promise<{ rows: ImportFailureRow[]; total: number }> {
    const ids = folderIds.filter(Boolean).slice(0, ARRAY_CONTAINS_ANY_MAX)
    if (ids.length === 0) return { rows: [], total: 0 }
    const snap = await db
        .collection("chartImportQueue")
        .where("parents", "array-contains-any", ids)
        .get()
    const rows = snap.docs
        .filter((d) => d.data().dismissed !== true)
        .map((d) => {
            const x = d.data()
            return {
                driveFileId: d.id,
                driveName: str(x.driveName),
                driveMimeType: str(x.driveMimeType),
                status: String(x.status ?? "unknown"),
                errorMessage: String(x.errorMessage ?? ""),
                attemptCount: typeof x.attemptCount === "number" ? x.attemptCount : 1,
                firstSeenAt: String(x.firstSeenAt ?? ""),
                lastAttemptAt: String(x.lastAttemptAt ?? ""),
            }
        })
        .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))
    return { rows: rows.slice(0, limit), total: rows.length }
}

/**
 * Act on one failure row in these folders.
 *  - `retry`   deletes the row, so the next import that sees the file starts
 *              fresh. The importer only revisits a file when it changes in
 *              Drive, so the file has to be re-saved or dropped in again.
 *  - `dismiss` marks the row `dismissed: true` so it stops being listed. The
 *              poller's next failure on the same file rewrites the row and
 *              clears the flag, so a recurring problem comes back.
 * A row outside these folders is answered as `not_found`.
 */
export async function resolveImportFailure(
    db: Firestore,
    folderIds: string[],
    driveFileId: string,
    action: ImportFailureAction,
    actorUid: string,
): Promise<ImportFailureOutcome> {
    const ref = db.collection("chartImportQueue").doc(driveFileId)
    const snap = await ref.get()
    if (!snap.exists || !inFolders(snap.data()?.parents, folderIds)) {
        return { driveFileId, action, ok: false, error: "not_found" }
    }
    if (action === "retry") {
        await ref.delete()
        return { driveFileId, action, ok: true, status: "cleared" }
    }
    await ref.update({
        dismissed: true,
        dismissedAt: new Date().toISOString(),
        dismissedBy: actorUid,
    })
    return { driveFileId, action, ok: true, status: "dismissed" }
}
