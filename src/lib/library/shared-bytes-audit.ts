import "server-only"
/**
 * Multi-tenant phase 5 — "shared charts are live references": when the owner
 * replaces the bytes of a chart other tenants can see, every one of them gets
 * the new bytes at once. Each such replacement is written to `platformAudit`
 * (action `shared_chart_bytes_replaced`) so the platform activity feed shows it.
 * Charts visible only to their owner write nothing here.
 */
import type { Firestore } from "firebase-admin/firestore"
import { Timestamp } from "firebase-admin/firestore"
import { ownerOf, type VisibilityRow } from "@/lib/library/visibility"
import { logger } from "@/lib/logger"

export const SHARED_BYTES_REPLACED = "shared_chart_bytes_replaced"

/** Tenants other than the owner that can see the row (empty = not shared). */
export function otherViewers(row: VisibilityRow): string[] {
    const owner = ownerOf(row)
    const v = Array.isArray(row.visibleToOrgs) ? row.visibleToOrgs : []
    return v.filter((x): x is string => typeof x === "string" && !!x && x !== owner)
}

/**
 * Record a byte replacement on a shared chart. `before` is the row as read
 * before the write (mimeType, fileSize, contentHash), `after` the new values.
 * Never throws: an audit failure is logged and the replacement stands.
 */
export async function auditSharedBytesReplaced(
    db: Firestore,
    e: {
        fileId: string
        row: VisibilityRow
        actorUid: string
        via: "console" | "claude"
        source: string
        after: { mimeType: string; fileSize: number }
    },
): Promise<string | null> {
    const viewers = otherViewers(e.row)
    if (viewers.length === 0) return null
    try {
        const ref = await db.collection("platformAudit").add({
            actorUid: e.actorUid,
            actorEmail: null,
            via: e.via,
            action: SHARED_BYTES_REPLACED,
            orgId: ownerOf(e.row),
            before: {
                fileId: e.fileId,
                mimeType: typeof e.row.mimeType === "string" ? e.row.mimeType : null,
                fileSize: typeof e.row.fileSize === "number" ? e.row.fileSize : null,
            },
            after: { fileId: e.fileId, ...e.after, source: e.source, sharedWith: viewers },
            at: Timestamp.now(),
        })
        return ref.id
    } catch (err) {
        logger.warn(`[shared-bytes-audit] ${e.fileId}: audit write failed`, err)
        return null
    }
}
