import { NextRequest, NextResponse } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

const COOKIE_NAME = "__session"
// Session cookie lives for 14 days (Firebase maximum).
// The client refreshes it daily via visibilitychange (see auth-context).
const SESSION_MAX_AGE = 60 * 60 * 24 * 14 // 14 days in seconds

/**
 * POST /api/auth/session
 *
 * Mints a Firebase session cookie from a client-side ID token.
 * Called automatically by AuthProvider after sign-in.
 *
 * Body: { idToken: string }
 */
export async function POST(req: NextRequest) {
    try {
        const limited = await checkRateLimit(req, 'api')
        if (limited) return limited

        const body = await req.json()
        const idToken = body.idToken

        if (!idToken || typeof idToken !== "string") {
            return NextResponse.json({ error: "Missing idToken" }, { status: 400 })
        }

        initAdmin()
        const auth = getAuth()

        // Verify the ID token first — reject expired or invalid tokens
        const decoded = await auth.verifyIdToken(idToken)
        // Only allow tokens issued in the last 5 minutes to prevent replay
        const issuedAt = decoded.iat * 1000
        if (Date.now() - issuedAt > 5 * 60 * 1000) {
            return NextResponse.json({ error: "Token too old" }, { status: 401 })
        }

        // Mint a session cookie
        const sessionCookie = await auth.createSessionCookie(idToken, {
            expiresIn: SESSION_MAX_AGE * 1000, // API expects milliseconds
        })

        const response = NextResponse.json({ status: "ok" })
        response.cookies.set(COOKIE_NAME, sessionCookie, {
            maxAge: SESSION_MAX_AGE,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })

        return response
    } catch (error) {
        logger.error("Session cookie creation failed:", error)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
}

/**
 * DELETE /api/auth/session
 *
 * Clears the session cookie. Called on sign-out.
 */
export async function DELETE() {
    const response = NextResponse.json({ status: "ok" })
    response.cookies.set(COOKIE_NAME, "", {
        maxAge: 0,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
    })
    return response
}
