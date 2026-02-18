import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { withAuth } from "@/lib/api-auth"
import { logger } from "@/lib/logger"

/**
 * Bridge Setup Code API
 *
 * Eliminates the need to visit Firebase Console for service account keys.
 * The admin panel generates a short-lived code; the bridge exe redeems it
 * for credentials.
 *
 * POST /api/bridge/setup-code  — Admin-only: generate a new setup code
 * GET  /api/bridge/setup-code?code=ABC123  — Bridge: redeem code for credentials
 */

function generateCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0/O/1/I confusion
    let code = ""
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
}

// POST: Admin generates a setup code
export async function POST(req: NextRequest) {
    try {
        const auth = await withAuth(req)
        if (auth instanceof NextResponse) return auth

        initAdmin()
        const db = getFirestore()

        // Verify the user is an admin
        const userDoc = await db.collection("users").doc(auth.uid).get()
        const userData = userDoc.data()
        if (!userData?.role || !["admin", "leader"].includes(userData.role)) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 })
        }

        // Invalidate any existing unused codes from this user
        const existing = await db.collection("bridge-setup-codes")
            .where("createdBy", "==", auth.uid)
            .where("used", "==", false)
            .get()
        const batch = db.batch()
        existing.docs.forEach(doc => batch.update(doc.ref, { used: true }))
        if (!existing.empty) await batch.commit()

        // Generate a new code
        const code = generateCode()
        const now = Date.now()
        const expiresAt = now + 10 * 60 * 1000 // 10 minutes

        await db.collection("bridge-setup-codes").doc(code).set({
            createdBy: auth.uid,
            createdAt: now,
            expiresAt,
            used: false,
        })

        return NextResponse.json({ code, expiresAt })
    } catch (error) {
        logger.error("Setup code generation error:", error)
        return NextResponse.json({ error: "Failed to generate code" }, { status: 500 })
    }
}

// GET: Bridge redeems a setup code for credentials
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url)
        const code = url.searchParams.get("code")?.toUpperCase().trim()

        if (!code || code.length !== 6) {
            return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
        }

        initAdmin()
        const db = getFirestore()

        // Look up the code
        const codeDoc = await db.collection("bridge-setup-codes").doc(code).get()
        if (!codeDoc.exists) {
            return NextResponse.json({ error: "Invalid code" }, { status: 404 })
        }

        const data = codeDoc.data()!
        if (data.used) {
            return NextResponse.json({ error: "Code already used" }, { status: 410 })
        }
        if (Date.now() > data.expiresAt) {
            return NextResponse.json({ error: "Code expired" }, { status: 410 })
        }

        // Mark as used immediately (single-use)
        await db.collection("bridge-setup-codes").doc(code).update({ used: true, usedAt: Date.now() })

        // Build a minimal service account key from environment variables
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")

        if (!projectId || !clientEmail || !privateKey) {
            return NextResponse.json({ error: "Server credentials not configured" }, { status: 500 })
        }

        const serviceAccountKey = {
            type: "service_account",
            project_id: projectId,
            private_key: privateKey,
            client_email: clientEmail,
            // These fields are required by cert() for full compatibility
            private_key_id: "bridge-generated",
            client_id: "",
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
        }

        return NextResponse.json({ credentials: serviceAccountKey })
    } catch (error) {
        logger.error("Setup code activation error:", error)
        return NextResponse.json({ error: "Activation failed" }, { status: 500 })
    }
}
