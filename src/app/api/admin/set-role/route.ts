import { NextResponse } from "next/server"
import { getAuth, getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

export async function POST(request: Request) {
    try {
        const auth = await withAuth(request, 'admin')
        if (auth instanceof NextResponse) return auth

        const body = await request.json()
        const { targetUserId, newRole } = body

        if (!targetUserId || !newRole) {
            return new NextResponse("Missing targetUserId or newRole", { status: 400 })
        }

        // Set Custom Claims — preserve existing claims (like soundEngineer)
        const fbAuth = getAuth()
        const existingUser = await fbAuth.getUser(targetUserId)
        const existingClaims = existingUser.customClaims || {}
        await fbAuth.setCustomUserClaims(targetUserId, { ...existingClaims, role: newRole })

        // Update Firestore for UI consistency
        // claimsUpdatedAt signals the client to force-refresh their ID token
        const { FieldValue } = await import('firebase-admin/firestore')
        await getFirestore().collection("users").doc(targetUserId).update({
            role: newRole,
            claimsUpdatedAt: FieldValue.serverTimestamp(),
        })

        return NextResponse.json({ success: true, role: newRole })

    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("Set Role Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
