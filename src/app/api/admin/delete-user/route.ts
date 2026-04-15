import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const deleteUserSchema = z.object({
    targetUserId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { targetUserId } = ctx.body!

        // Prevent self-deletion
        if (targetUserId === ctx.auth.uid) {
            return apiError("Cannot delete yourself", 400, "SELF_DELETE")
        }

        const fbAuth = getAuth()
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // v4.3 D07: revoke active tokens FIRST so the deleted user can't
        // continue acting with a cached ID token during the brief window
        // between Firestore delete and Auth delete. revokeRefreshTokens
        // invalidates anything older than the call; subsequent
        // verifyIdToken({checkRevoked:true}) calls reject.
        try {
            await fbAuth.revokeRefreshTokens(targetUserId)
        } catch (e) {
            logger.warn("[Delete User] revokeRefreshTokens failed:", e)
        }

        // 1. Atomically delete Firestore doc + write audit log
        const batch = db.batch()
        batch.delete(db.collection("users").doc(targetUserId))
        batch.create(db.collection("auditLogs").doc(), {
            action: "USER_DELETED",
            targetUserId,
            actorUid: ctx.auth.uid,
            actorEmail: ctx.auth.email || "unknown",
            timestamp: FieldValue.serverTimestamp()
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
    { role: 'admin', schema: deleteUserSchema }
)
