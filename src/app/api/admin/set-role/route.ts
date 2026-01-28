import { NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { targetUserId, newRole } = body
        const authHeader = request.headers.get("Authorization")
        const token = authHeader?.split("Bearer ")[1]

        if (!token) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        if (!targetUserId || !newRole) {
            return new NextResponse("Missing targetUserId or newRole", { status: 400 })
        }

        // 1. Verify Caller
        const decodedToken = await getAuth().verifyIdToken(token)
        const callerUid = decodedToken.uid
        const callerEmail = decodedToken.email

        // 2. Check Permissions (Bootstrap Logic)
        // We allow if:
        // - Caller is the Hardcoded Super Admin (UID or Email)
        // - OR Caller already has 'admin' claim
        const isSuperAdmin = callerUid === '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3' || callerEmail === 'daniel@centralreform.org'
        const isAdminClaim = decodedToken.role === 'admin'

        if (!isSuperAdmin && !isAdminClaim) {
            return new NextResponse("Forbidden: You must be an Admin", { status: 403 })
        }

        // 3. Set Custom Claims
        await getAuth().setCustomUserClaims(targetUserId, { role: newRole })

        // 4. Update Firestore for UI consistency
        await getFirestore().collection("users").doc(targetUserId).update({
            role: newRole
        })

        return NextResponse.json({ success: true, role: newRole })

    } catch (error: any) {
        console.error("Set Role Error:", error)
        return new NextResponse(error.message || "Internal Server Error", { status: 500 })
    }
}
