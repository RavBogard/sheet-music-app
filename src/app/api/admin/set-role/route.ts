import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { logger } from "@/lib/logger"
import { createApiHandler } from "@/lib/api-wrapper"
import { z } from "zod"

const setRoleSchema = z.object({
    targetUserId: z.string().min(1),
    newRole: z.enum(['admin', 'band_leader', 'leader', 'musician', 'member', 'pending'])
})

export const POST = createApiHandler(
    async (ctx) => {
        const { targetUserId, newRole } = ctx.body!

        // Set Custom Claims — preserve existing claims (like soundEngineer)
        const fbAuth = getAuth()
        const existingUser = await fbAuth.getUser(targetUserId)
        const existingClaims = existingUser.customClaims || {}
        await fbAuth.setCustomUserClaims(targetUserId, { ...existingClaims, role: newRole })

        // Update Firestore for UI consistency
        const { FieldValue } = await import('firebase-admin/firestore')
        const db = getFirestore()

        await db.collection("users").doc(targetUserId).update({
            role: newRole,
            claimsUpdatedAt: FieldValue.serverTimestamp(),
        })

        // Audit Log
        try {
            await db.collection("auditLogs").add({
                action: "ROLE_CHANGE",
                targetUserId,
                newRole,
                previousRole: existingClaims.role || "pending",
                actorUid: ctx.auth.uid,
                actorEmail: ctx.auth.email || "unknown",
                timestamp: FieldValue.serverTimestamp()
            })
        } catch (e) {
            logger.error("Failed to write audit log:", e)
        }

        // Leader Demotion Guard: Lock public setlists
        if (newRole === 'member' || newRole === 'pending') {
            try {
                const publicSetlists = await db.collection("setlists")
                    .where("createdBy.uid", "==", targetUserId)
                    .where("isPublic", "==", true)
                    .get()

                if (!publicSetlists.empty) {
                    const batch = db.batch()
                    publicSetlists.docs.forEach(doc => {
                        batch.update(doc.ref, {
                            isPublic: false,
                            updatedAt: FieldValue.serverTimestamp()
                        })
                    })
                    await batch.commit()
                    logger.info(`[Demotion Guard] Locked ${publicSetlists.size} public setlists for demoted user ${targetUserId}`)
                }
            } catch (e) {
                logger.error("[Demotion Guard] Failed to lock setlists:", e)
            }
        }

        return NextResponse.json({ success: true, role: newRole })
    },
    { role: 'admin', schema: setRoleSchema }
)
