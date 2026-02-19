/**
 * POST /api/admin/set-sound-engineer
 * 
 * Toggles the soundEngineer flag for a user.
 * Updates both Firestore profile and Firebase Auth custom claims
 * so Firestore rules can check the claim.
 * 
 * Body: { targetUserId: string, soundEngineer: boolean }
 * Requires admin role.
 */

import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
    try {
        const auth = await withAuth(request, "admin")
        if (auth instanceof NextResponse) return auth

        const body = await request.json()
        const { targetUserId, soundEngineer } = body

        if (!targetUserId || typeof soundEngineer !== "boolean") {
            return NextResponse.json({ error: "Missing targetUserId or soundEngineer" }, { status: 400 })
        }

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
    } catch (err) {
        logger.error("[SetSoundEngineer] Error:", err)
        return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }
}
