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

// The two legitimate code shapes that land in `qr-sessions` (one endpoint, two
// namespaces). The GET poll consumes BOTH; POST/PUT only ever handle the 6-char
// device-handoff shape.
//
// 6-char device-handoff QR code — `generateCode()` output (uppercase alnum).
const DEVICE_CODE_RE = /^[A-Z0-9]{6}$/
// 32-char base64url test-login code minted by create_test_account({loginable:true})
// (test-tokens.ts: `randomBytes(24).toString("base64url")` → exactly 32 chars).
// base64url's alphabet is A-Z a-z 0-9 - _ and NEVER contains '/', so admitting
// it does NOT re-open the BUG-7 '/'-in-doc-id path (the guard below stays intact).
const TEST_LOGIN_CODE_RE = /^[A-Za-z0-9_-]{32}$/

// Readable [A-Z0-9] subset (no I/O/0/1) — mirrors the client generator in
// QRSignIn.tsx so server-fallback codes have the same shape as client codes.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateCode(): string {
    // BUG-13 (run-3 §BUG-13): the old `randomBytes(4).toString("base64url")
    // .replace(/[^A-Za-z0-9]/g,"").slice(0,6)` STRIPPED any '-'/'_' from the draw,
    // so a draw containing them collapsed to a <6-char code (live repro "HEBFW")
    // that the ^[A-Z0-9]{6}$ validators (POST/GET/PUT) then 400. Looping a fixed
    // 6 times over CODE_CHARS guarantees exactly 6 chars, all in [A-Z0-9].
    const bytes = randomBytes(6)
    let code = ""
    for (let i = 0; i < 6; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length]
    return code
}

/**
 * POST — Create/register a new QR session.
 * Called by the iPad (not signed in). No auth required.
 * Accepts an optional client-generated code for instant QR display.
 */
export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'telemetry')
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
    const limited = await checkRateLimit(req, 'telemetry')
    if (limited) return limited

    const code = req.nextUrl.searchParams.get("code")
    if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 })
    }

    // BUG-7 (run-2 §BUG-7): reject malformed codes (e.g. containing '/') with a
    // 400 BEFORE touching Firestore. A code with '/' makes `.doc(code)` an
    // invalid (odd-segment) document reference that throws → caught below as a
    // 500. Caller-supplied bad input must be 4xx per the v11.2 error contract.
    //
    // BUG-12 (run-3 §BUG-12): this GET endpoint serves TWO code namespaces that
    // share `qr-sessions` — the 6-char device-handoff code AND the 32-char
    // base64url test-login code minted by create_test_account({loginable:true}).
    // Admit BOTH legitimate shapes; reject everything else. Both are anchored,
    // fixed-length, and exclude '/' and '.', so the BUG-7 guarantee holds — a
    // 31/33-char string, a '/'-bearing code, or `..%2Fetc` all still 400 here.
    if (!DEVICE_CODE_RE.test(code) && !TEST_LOGIN_CODE_RE.test(code)) {
        return NextResponse.json({ error: "Invalid code format" }, { status: 400 })
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
            await db.collection(COLLECTION).doc(code).delete().catch(e => logger.warn('[QR] Failed to clean up expired session:', e))
            return NextResponse.json({ error: "Session expired" }, { status: 410 })
        }

        if (data.status === "approved" && data.customToken) {
            // Consume: delete session after delivering token
            await db.collection(COLLECTION).doc(code).delete().catch(e => logger.warn('[QR] Failed to clean up consumed session:', e))
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
        const limited = await checkRateLimit(req, 'telemetry')
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

        // v4.3 P6-S04: QR approval is a session-mint operation. Gate to band
        // members only (musician/band_leader/admin) so non-band `member`
        // accounts can't device-approve and pending accounts can't participate
        // in device sign-in. Shared iPads are a band-only surface.
        const role = decoded.role as string | undefined
        const allowedRoles = new Set(["musician", "band_leader", "admin"])
        if (!role || !allowedRoles.has(role)) {
            return NextResponse.json(
                { error: "Approval requires an approved member account" },
                { status: 403 },
            )
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
            await docRef.delete().catch(e => logger.warn('[QR] Failed to clean up expired session:', e))
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
