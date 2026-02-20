import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        initAdmin()
        const token = authHeader.split('Bearer ')[1]
        const decodedToken = await getAuth().verifyIdToken(token)

        const db = getFirestore()
        const userRef = db.collection('users').doc(decodedToken.uid)

        await userRef.update({
            lastNudgeAt: new Date().toISOString(),
            nudgedAdmin: true
        })

        return NextResponse.json({ success: true, message: "Admin notified" })
    } catch (error) {
        console.error("Nudge admin error:", error)
        return new NextResponse("Internal Server Error", { status: 500 })
    }
}
