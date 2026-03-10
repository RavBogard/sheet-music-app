/**
 * POST /api/admin/set-sound-engineer
 *
 * Toggles the soundEngineer flag for a user.
 * Updates both Firestore profile and Firebase Auth custom claims
 * so Firestore rules can check the claim.
 *
 * Body: { targetUserId: string, soundEngineer: boolean }
 * Requires band_leader role or above.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
    targetUserId: z.string().min(1),
    soundEngineer: z.boolean(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const { targetUserId, soundEngineer } = ctx.body!

        initAdmin()
        const db = getFirestore()
        const fbAuth = getAuth()

        // Update Firestore profile
        await db.collection("users").doc(targetUserId).update({ soundEngineer })

        // Update custom claims
        try {
            const user = await fbAuth.getUser(targetUserId)
            const currentClaims = user.customClaims || {}
            await fbAuth.setCustomUserClaims(targetUserId, {
                ...currentClaims,
                soundEngineer,
            })
        } catch (claimErr) {
            logger.warn(`[SetSoundEngineer] Failed to update claims for ${targetUserId}:`, claimErr)
        }

        return NextResponse.json({ success: true, soundEngineer })
    },
    { role: 'band_leader', schema }
)
