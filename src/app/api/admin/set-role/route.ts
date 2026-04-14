import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const setRoleSchema = z.object({
    targetUserId: z.string().min(1),
    newRole: z.enum(['admin', 'band_leader', 'musician', 'member', 'pending'])
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { targetUserId, newRole } = ctx.body!

        const fbAuth = getAuth()
        const { FieldValue } = await import('firebase-admin/firestore')
        const db = getFirestore()

        // Read existing claims before transaction (Auth is external)
        const existingUser = await fbAuth.getUser(targetUserId)
        const existingClaims = existingUser.customClaims || {}

        // Firestore transaction: user doc update + audit log + demotion guard
        await db.runTransaction(async (txn) => {
            const userRef = db.collection("users").doc(targetUserId)

            // Update user role
            txn.update(userRef, {
                role: newRole,
                claimsUpdatedAt: FieldValue.serverTimestamp(),
            })

            // Audit log
            txn.create(db.collection("auditLogs").doc(), {
                action: "ROLE_CHANGE",
                targetUserId,
                newRole,
                previousRole: existingClaims.role || "pending",
                actorUid: ctx.auth.uid,
                actorEmail: ctx.auth.email || "unknown",
                timestamp: FieldValue.serverTimestamp()
            })

        })

        // Update Auth custom claims (external service, after Firestore transaction succeeds)
        try {
            await fbAuth.setCustomUserClaims(targetUserId, { ...existingClaims, role: newRole })
        } catch (e) {
            logger.error("[Set Role] Auth claims update failed after Firestore commit:", e)
        }

        return NextResponse.json({ success: true, role: newRole })
    },
    { role: 'admin', schema: setRoleSchema }
)
