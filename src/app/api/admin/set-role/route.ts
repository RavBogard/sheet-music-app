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

        // Set Custom Claims
        await getAuth().setCustomUserClaims(targetUserId, { role: newRole })

        // Update Firestore for UI consistency
        await getFirestore().collection("users").doc(targetUserId).update({
            role: newRole
        })

        return NextResponse.json({ success: true, role: newRole })

    } catch (error: unknown) {
        if (error instanceof NextResponse) return error
        logger.error("Set Role Error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
