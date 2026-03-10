/**
 * QR Code Sign-In API
 *
 * Enables shared iPad sign-in: iPad shows QR → phone scans →
 * phone approves → iPad signs in as that user.
 *
 * POST   /api/auth/qr          Create a pending session (no auth)
 * GET    /api/auth/qr?code=X   Poll session status (no auth)
 * PUT    /api/auth/qr          Approve session (requires auth)
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { verifyIdToken } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { randomBytes } from "crypto"
import { logger } from "@/lib/logger"

const COLLECTION = "qr-sessions"
const EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

function generateCode(): string {
    // 6-char alphanumeric, uppercase — easy to read, easy to type as fallback
    return randomBytes(4)
        .toString("base64url")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 6)
        .toUpperCase()
}

/**
 * POST — Create/register a new QR session.
 * Called by the iPad (not signed in). No auth required.
 * Accepts an optional client-generated code for instant QR display.
 */
export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        if (!initAdmin()) {
            return NextResponse.json({ error: "unavailable" }, { status: 503 })
        }
        const db = getFirestore()

        // Accept client-provided code or generate server-side
        let code: string
        try {
            const body = await req.json()
            code = typeof body.code === "string" && /^[A-Z0-9]{6}$/.test(body.code)
                ? body.code
                : generateCode()
        } catch {
            // No body or invalid JSON — generate server-side
            code = generateCode()
        }

        const now = Date.now()

        await db.collection(COLLECTION).doc(code).set({
            status: "pending",
            createdAt: now,
            expiresAt: now + EXPIRY_MS,
        })

        return NextResponse.json({ code, expiresAt: now + EXPIRY_MS })
    } catch (err) {
        logger.error("[QR] Create error:", err)
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 })
    }
}

/**
 * GET — Poll session status.
 * Called by the iPad. No auth required.
 * Returns { status: 'pending' } or { status: 'approved', token: '...' }
 */
export async function GET(req: NextRequest) {
    const limited = await checkRateLimit(req, 'api')
    if (limited) return limited

    const code = req.nextUrl.searchParams.get("code")
    if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
    }

    try {
        if (!initAdmin()) {
            return NextResponse.json({ error: "unavailable" }, { status: 503 })
        }
        const db = getFirestore()
        const doc = await db.collection(COLLECTION).doc(code).get()

        if (!doc.exists) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 })
        }

        const data = doc.data()!

        // Expired
        if (Date.now() > data.expiresAt) {
            // Clean up expired doc
            await db.collection(COLLECTION).doc(code).delete().catch(() => {})
            return NextResponse.json({ error: "Session expired" }, { status: 410 })
        }

        if (data.status === "approved" && data.customToken) {
            // Consume: delete session after delivering token
            await db.collection(COLLECTION).doc(code).delete().catch(() => {})
            const response = NextResponse.json({
                status: "approved",
                token: data.customToken,
                userName: data.userName,
                userPhoto: data.userPhoto,
            })
            // Prevent proxy/CDN caching of sensitive token response
            response.headers.set("Cache-Control", "no-store")
            return response
        }

        return NextResponse.json({ status: data.status })
    } catch (err) {
        logger.error("[QR] Poll error:", err)
        return NextResponse.json({ error: "Failed to check session" }, { status: 500 })
    }
}

/**
 * PUT — Approve a session.
 * Called by the phone (signed in). Requires auth.
 * Mints a custom token for the iPad to sign in as this user.
 */
export async function PUT(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        // Verify phone user's auth
        const authHeader = req.headers.get("Authorization")
        const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null
        if (!rawToken) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json({ error: "unavailable" }, { status: 503 })
        }
        const decoded = await verifyIdToken(rawToken)
        if (!decoded) {
            return NextResponse.json({ error: "Invalid token" }, { status: 403 })
        }

        const body = await req.json()
        const { code } = body
        if (!code || typeof code !== "string" || !/^[A-Z0-9]{6}$/.test(code)) {
            return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
        }

        const db = getFirestore()
        const docRef = db.collection(COLLECTION).doc(code)
        const doc = await docRef.get()

        if (!doc.exists) {
            return NextResponse.json({ error: "Session not found" }, { status: 404 })
        }

        const data = doc.data()!

        if (Date.now() > data.expiresAt) {
            await docRef.delete().catch(() => {})
            return NextResponse.json({ error: "Session expired" }, { status: 410 })
        }

        if (data.status !== "pending") {
            return NextResponse.json({ error: "Session already used" }, { status: 409 })
        }

        // Mint a custom token for this user
        const customToken = await getAuth().createCustomToken(decoded.uid)

        // Update session with approval
        await docRef.update({
            status: "approved",
            customToken,
            approvedBy: decoded.uid,
            userName: decoded.name || decoded.email || "Unknown",
            userPhoto: decoded.picture || null,
            approvedAt: Date.now(),
        })

        return NextResponse.json({
            success: true,
            userName: decoded.name || decoded.email,
        })
    } catch (err) {
        logger.error("[QR] Approve error:", err)
        return NextResponse.json({ error: "Failed to approve session" }, { status: 500 })
    }
}
