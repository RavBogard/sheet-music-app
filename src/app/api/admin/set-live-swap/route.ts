/**
 * POST /api/admin/set-live-swap
 *
 * Toggles the canLiveSwap flag for a user.
 * Updates both Firestore profile and Firebase Auth custom claims
 * so Firestore rules can check the claim.
 *
 * Body: { targetUserId: string, canLiveSwap: boolean }
 * Requires band_leader role or above.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
    targetUserId: z.string().min(1),
    canLiveSwap: z.boolean(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, 'api')
        if (limited) return limited

        const { targetUserId, canLiveSwap } = ctx.body!

        initAdmin()
        const db = getFirestore()
        const fbAuth = getAuth()

        // Update Firestore profile
        await db.collection("users").doc(targetUserId).update({ canLiveSwap })

        // Update custom claims
        try {
            const user = await fbAuth.getUser(targetUserId)
            const currentClaims = user.customClaims || {}
            await fbAuth.setCustomUserClaims(targetUserId, {
                ...currentClaims,
                canLiveSwap,
            })
        } catch (claimErr) {
            logger.warn(`[SetLiveSwap] Failed to update claims for ${targetUserId}:`, claimErr)
        }

        return NextResponse.json({ success: true, canLiveSwap })
    },
    { role: 'band_leader', schema }
)
