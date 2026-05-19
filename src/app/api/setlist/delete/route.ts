import { NextResponse } from "next/server"
import { z } from "zod"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { logger } from "@/lib/logger"
import type { Firestore, Query, DocumentSnapshot } from "firebase-admin/firestore"

/**
 * D01 — Cascading setlist delete (Admin SDK).
 *
 * Removes the setlist doc + every collection that references it:
 *   - scheduling_assignments where setlistId == id
 *   - tasks where setlistId == id
 *   - notifications (collectionGroup) where entityId == id
 *   - setlists/{id}/** (history, emailEvents, any other subcollection)
 *
 * Each phase is best-effort: failures log + accumulate into errors[] but
 * don't halt the cascade. Retrying the same id is a no-op because each
 * phase's query will simply find 0 docs.
 */

const bodySchema = z
    .object({ setlistId: z.string().min(1) })
    .strict()

async function batchDeleteByField(
    db: Firestore,
    collectionPath: string,
    field: string,
    value: string,
    opts: { collectionGroup?: boolean } = {},
): Promise<number> {
    const ref: Query = opts.collectionGroup
        ? db.collectionGroup(collectionPath).where(field, "==", value)
        : db.collection(collectionPath).where(field, "==", value)

    let total = 0
    // Chunk at 500 per WriteBatch (Firestore hard limit).
    while (true) {
        const snap = await ref.limit(500).get()
        if (snap.empty) break
        const batch = db.batch()
        snap.docs.forEach((d: DocumentSnapshot) => batch.delete(d.ref))
        await batch.commit()
        total += snap.size
        if (snap.size < 500) break
    }
    return total
}

export const POST = createApiHandler(
    async (ctx) => {
        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const { setlistId } = ctx.body!

        // 1) Verify setlist exists — 404 with no side effects if not.
        const setlistRef = db.collection("setlists").doc(setlistId)
        const setlistSnap = await setlistRef.get()
        if (!setlistSnap.exists) {
            return apiError("Setlist not found", 404, "setlist_not_found")
        }

        // v4.4 SEC-006: band_leader role alone is not enough — require
        // ownership or admin to delete. Prevents a compromised/rogue band
        // leader from destroying another leader's work.
        const setlistData = setlistSnap.data()
        const isOwner = setlistData?.ownerId === ctx.auth.uid
        if (!isOwner && !ctx.auth.isAdmin) {
            return apiError("Only the owner or an admin can delete this setlist", 403, "forbidden")
        }

        const errors: string[] = []
        let assignments = 0
        let tasks = 0
        let notifications = 0
        let tracks = 0

        // 2) scheduling_assignments where setlistId == id
        try {
            assignments = await batchDeleteByField(db, "scheduling_assignments", "setlistId", setlistId)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] assignment cleanup failed for ${setlistId}: ${msg}`)
            errors.push(`assignments: ${msg}`)
        }

        // 3) tasks where setlistId == id
        try {
            tasks = await batchDeleteByField(db, "tasks", "setlistId", setlistId)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] task cleanup failed for ${setlistId}: ${msg}`)
            errors.push(`tasks: ${msg}`)
        }

        // 4) notifications (collectionGroup) where entityId == id
        try {
            notifications = await batchDeleteByField(db, "notifications", "entityId", setlistId, {
                collectionGroup: true,
            })
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] notification cleanup failed for ${setlistId}: ${msg}`)
            errors.push(`notifications: ${msg}`)
        }

        // 5) tracks (top-level) where setlistId == id.
        // v60-07-02 moved tracks from embedded → top-level. The MCP
        // `delete_setlist` tool (src/lib/mcp/tools/setlist-write.ts) cascades
        // these in a transaction; this HTTP route never picked up the
        // cascade and orphaned the rows. Cycle-7 Lane 3 (C7I4-002): observed
        // setlist `b12a5221-…` with `list_setlists.trackCount=43` but
        // `tracks/{setlistId:b12a5221-…}` empty AND parent doc still present.
        // The reverse shape (parent gone, top-level tracks present) is what
        // we close here.
        try {
            tracks = await batchDeleteByField(db, "tracks", "setlistId", setlistId)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] tracks cleanup failed for ${setlistId}: ${msg}`)
            errors.push(`tracks: ${msg}`)
        }

        // 6) recursiveDelete: parent + subcollections (history, emailEvents, ...)
        try {
            await db.recursiveDelete(setlistRef)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            logger.error(`[setlist/delete] recursiveDelete failed for ${setlistId}: ${msg}`)
            errors.push(`setlist: ${msg}`)
        }

        logger.info(
            `[setlist/delete] ${setlistId} — assignments=${assignments} tasks=${tasks} notifications=${notifications} tracks=${tracks} errors=${errors.length}`,
        )

        return NextResponse.json({
            deleted: { setlist: 1, assignments, tasks, notifications, tracks },
            errors,
        })
    },
    { role: "band_leader", schema: bodySchema },
)
