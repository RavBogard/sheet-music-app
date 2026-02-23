import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"

const deleteUserSchema = z.object({
    targetUserId: z.string().min(1),
})

export const POST = createApiHandler(
    async (ctx) => {
        const { targetUserId } = ctx.body!

        // Prevent self-deletion
        if (targetUserId === ctx.auth.uid) {
            return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 })
        }

        const fbAuth = getAuth()
        const db = getFirestore()
        const { FieldValue } = await import('firebase-admin/firestore')

        // 1. Delete user's Firestore document
        try {
            await db.collection("users").doc(targetUserId).delete()
        } catch (e) {
            logger.warn("[Delete User] Firestore doc delete failed (may not exist):", e)
        }

        // 2. Delete from Firebase Auth
        try {
            await fbAuth.deleteUser(targetUserId)
        } catch (e) {
            // User may have already been deleted from Auth
            logger.warn("[Delete User] Auth user delete failed:", e)
        }

        // 3. Audit log
        try {
            await db.collection("auditLogs").add({
                action: "USER_DELETED",
                targetUserId,
                actorUid: ctx.auth.uid,
                actorEmail: ctx.auth.email || "unknown",
                timestamp: FieldValue.serverTimestamp()
            })
        } catch (e) {
            logger.error("[Delete User] Failed to write audit log:", e)
        }

        return NextResponse.json({ success: true })
    },
    { role: 'admin', schema: deleteUserSchema }
)
