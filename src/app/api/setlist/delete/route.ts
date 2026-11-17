import { NextResponse } from "next/server"
import { isHostTenantDoc } from "@/lib/org/setlist-tenant"
import { getT } from "@/i18n/server"
import { z } from "zod"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { logger } from "@/lib/logger"
import { deleteSetlistCascade } from "@/lib/setlist-ops"

/**
 * D01 — Cascading setlist delete (Admin SDK).
 *
 * Checks existence, tenant and owner-or-admin, then runs the shared cascade
 * `deleteSetlistCascade` (src/lib/setlist-ops/cascade.ts): assignments,
 * tasks, notifications, tracks, and the setlist doc with every subcollection.
 * Each phase is best-effort: failures log + accumulate into errors[] but
 * don't halt the cascade. Retrying the same id is a no-op.
 */

const bodySchema = z
    .object({ setlistId: z.string().min(1) })
    .strict()

export const POST = createApiHandler(
    async (ctx) => {
        if (!initAdmin()) {
            const t = await getT()
            return NextResponse.json(
                { error: t("api-setlist.serverNotReady"), code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const db = getFirestore()
        const { setlistId } = ctx.body!

        // 1) Verify setlist exists — 404 with no side effects if not.
        const setlistRef = db.collection("setlists").doc(setlistId)
        const setlistSnap = await setlistRef.get()
        if (!setlistSnap.exists) {
            const t = await getT()
            return apiError(t("api-setlist.setlistNotFound"), 404, "setlist_not_found")
        }

        // v4.4 SEC-006: band_leader role alone is not enough — require
        // ownership or admin to delete. Prevents a compromised/rogue band
        // leader from destroying another leader's work.
        const setlistData = setlistSnap.data()
        // Another tenant's setlist answers exactly as a missing one.
        if (!isHostTenantDoc(setlistData, ctx.auth.orgId)) {
            const t = await getT()
            return apiError(t("api-setlist.setlistNotFound"), 404, "setlist_not_found")
        }
        const isOwner = setlistData?.ownerId === ctx.auth.uid
        if (!isOwner && !ctx.auth.isAdmin) {
            const t = await getT()
            return apiError(t("api-setlist.deleteOwnerOrAdminOnly"), 403, "forbidden")
        }

        // 2) The shared cascade (src/lib/setlist-ops/cascade.ts), the same one
        // the MCP delete_setlist tool runs. No "deleted" history entry is
        // written: it landed in setlists/{id}/history after the recursive
        // delete, under a parent that no longer exists, and nothing reads it.
        const { assignments, tasks, notifications, tracks, errors } = await deleteSetlistCascade(
            db,
            ctx.auth.orgId,
            setlistId,
        )

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
