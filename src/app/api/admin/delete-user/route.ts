import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { ensureMembershipsMigrated } from "@/lib/org/memberships-write"
import { z } from "zod"

const deleteUserSchema = z.object({
    targetUserId: z.string().min(1),
})

/**
 * POST /api/admin/delete-user: deletes an ACCOUNT (Auth user, users doc,
 * memberships). Multi-tenant phase 2 (design §3.4): the platform owner may
 * delete anyone; a tenant admin only when every membership the target holds is
 * in the caller's (host) tenant, otherwise 403 MULTI_TENANT_USER (remove from
 * this tenant instead = set-role newRole:null). The audit row carries orgId.
 */
export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const { targetUserId } = ctx.body!

        // Prevent self-deletion
        if (targetUserId === ctx.auth.uid) {
            return apiError("Cannot delete yourself", 400, "SELF_DELETE")
        }

        const fbAuth = getAuth()
        const db = getFirestore()
        const { FieldValue } = await import("firebase-admin/firestore")

        // Tenant boundary: a tenant admin may only delete people who belong to
        // no other tenant. Unmigrated targets are migrated first so their
        // legacy tenants show up as memberships.
        await ensureMembershipsMigrated(targetUserId)
        const memberships = await db.collection("memberships").where("uid", "==", targetUserId).get()
        const otherTenants = memberships.docs
            .map((d) => d.get("tenantId") as string)
            .filter((t) => t !== ctx.auth.orgId)
        if (!ctx.auth.po && otherTenants.length > 0) {
            return apiError(
                "This person also belongs to another tenant; remove them from this tenant instead",
                403,
                "MULTI_TENANT_USER",
            )
        }

        // v4.3 D07: revoke active tokens FIRST so the deleted user can't
        // continue acting with a cached ID token during the brief window
        // between Firestore delete and Auth delete.
        try {
            await fbAuth.revokeRefreshTokens(targetUserId)
        } catch (e) {
            logger.warn("[Delete User] revokeRefreshTokens failed:", e)
        }

        // 1. Atomically delete users doc + memberships + write audit log
        const batch = db.batch()
        batch.delete(db.collection("users").doc(targetUserId))
        for (const m of memberships.docs) batch.delete(m.ref)
        batch.create(db.collection("auditLogs").doc(), {
            action: "USER_DELETED",
            orgId: ctx.auth.orgId,
            targetUserId,
            actorUid: ctx.auth.uid,
            actorEmail: ctx.auth.email || "unknown",
            timestamp: FieldValue.serverTimestamp(),
        })
        await batch.commit()

        // 2. Delete from Firebase Auth (external service, best-effort after Firestore)
        try {
            await fbAuth.deleteUser(targetUserId)
        } catch (e) {
            logger.warn("[Delete User] Auth user delete failed:", e)
        }

        return NextResponse.json({ success: true })
    },
    { role: "admin", schema: deleteUserSchema },
)
