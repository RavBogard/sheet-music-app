import { NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"

// This route allows you to promote a user to admin WITHOUT running local scripts.
// It is protected by a secret Environment Variable.

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const secret = searchParams.get('secret')
    const role = searchParams.get('role') || 'admin'

    // 1. Security Check
    const envSecret = process.env.ADMIN_BOOTSTRAP_SECRET
    if (!envSecret || secret !== envSecret) {
        return new NextResponse("Unauthorized: Invalid Secret", { status: 403 })
    }

    if (!email) {
        return new NextResponse("Missing 'email' parameter", { status: 400 })
    }

    try {
        initAdmin()

        // 2. Find User
        const auth = getAuth()
        const user = await auth.getUserByEmail(email)

        // 3. Set Custom Claim (for Security Rules)
        await auth.setCustomUserClaims(user.uid, { role })

        // 4. Update Firestore Profile (for Frontend UI)
        const db = getFirestore()
        await db.collection('users').doc(user.uid).set({
            role,
            updatedAt: new Date().toISOString()
        }, { merge: true })

        return NextResponse.json({
            success: true,
            message: `User ${email} promoted to ${role}`,
            uid: user.uid
        })

    } catch (error: any) {
        console.error("Bootstrap Error:", error)
        return new NextResponse(`Error: ${error.message}`, { status: 500 })
    }
}
