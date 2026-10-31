import "server-only"

import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { clearQueue, findRowByDriveFileId } from "@/lib/drive-sync/poller"
import { applyRevision, loadRevisionTarget, type RevisionReport } from "@/lib/library/lineage"
import type { OrgId } from "@/lib/org/types"
import { importChartFromDrive } from "./library-upload"
import type { UploaderRoles } from "./uploader-roles"

/**
 * Bet 2 — `sync_chart_inbox` items declared as new versions. For each
 * `{driveFileId, revisionOf}`:
 *   - the file is already in the library (the scheduled import got to it):
 *     that row becomes the next version of `revisionOf`;
 *   - otherwise it is imported now as that version (the name dedupe is
 *     skipped) and stamped with its Drive id, so the importer leaves it be.
 * Runs before the normal sync so a declared version is never filed as a
 * sibling. Every lookup is in the caller's org.
 */

export interface InboxRevisionInput {
    driveFileId: string
    revisionOf: string
}

export type InboxRevisionOutcome =
    | { driveFileId: string; ok: true; outcome: "linked" | "imported"; fileId: string; revision: RevisionReport }
    | { driveFileId: string; ok: false; error: RichErrorEnvelope }

export async function applyInboxRevisions(
    db: FirebaseFirestore.Firestore,
    uid: string,
    org: OrgId,
    roles: UploaderRoles,
    items: InboxRevisionInput[],
): Promise<InboxRevisionOutcome[]> {
    const out: InboxRevisionOutcome[] = []
    for (const item of items) {
        const driveFileId = item.driveFileId?.trim() ?? ""
        const revisionOf = item.revisionOf?.trim() ?? ""
        if (!driveFileId || !revisionOf) {
            out.push({
                driveFileId,
                ok: false,
                error: richError("invalid_argument", "Each revision needs driveFileId and revisionOf.", {
                    fields: ["driveFileId", "revisionOf"],
                }),
            })
            continue
        }
        const existing = await findRowByDriveFileId(db, driveFileId)
        if (existing && rowOrg(existing.data.orgId) === org) {
            if (existing.docId === revisionOf) {
                out.push({
                    driveFileId,
                    ok: false,
                    error: richError(
                        "invalid_argument",
                        "A chart cannot be a new version of itself.",
                        { driveFileId, revisionOf },
                        "Pass the fileId of the older chart this file replaces.",
                    ),
                })
                continue
            }
            const target = await loadRevisionTarget(db, revisionOf, org, uid, roles)
            if ("error" in target) {
                out.push({ driveFileId, ok: false, error: target })
                continue
            }
            const revision = await applyRevision(uid, org, target, existing.docId, { tool: "sync_chart_inbox" })
            out.push({ driveFileId, ok: true, outcome: "linked", fileId: existing.docId, revision })
            continue
        }
        // Not in this org's library yet (another tenant's row by the same Drive id is not ours).
        const imported = await importChartFromDrive(uid, { driveFileId, revisionOf }, org, {
            driveProvenance: !existing,
        })
        if (!("ok" in imported) || imported.ok !== true || !("fileId" in imported)) {
            out.push({ driveFileId, ok: false, error: imported as RichErrorEnvelope })
            continue
        }
        await clearQueue(db, driveFileId)
        out.push({
            driveFileId,
            ok: true,
            outcome: "imported",
            fileId: imported.fileId,
            revision: imported.revision as RevisionReport,
        })
    }
    return out
}
