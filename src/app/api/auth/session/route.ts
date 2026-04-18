import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    SESSION_ROLE_COOKIE,
    SESSION_ROLE_MAX_AGE,
    signRoleCookie,
} from "@/lib/session-role"

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

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
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

        // v4.3 P9-02: read Firestore role and sign a companion cookie so
        // the proxy has an authoritative role source independent of
        // whatever claim the client's ID token happened to carry.
        let firestoreRole: string | null = null
        try {
            const db = getFirestore()
            const snap = await db.collection("users").doc(decoded.uid).get()
            const r = snap.data()?.role
            if (typeof r === "string") firestoreRole = r
        } catch (err) {
            logger.warn("[session] Firestore role read failed:", err)
        }

        const response = NextResponse.json({ status: "ok" })
        response.cookies.set(COOKIE_NAME, sessionCookie, {
            maxAge: SESSION_MAX_AGE,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })

        const signed = await signRoleCookie(decoded.uid, firestoreRole)
        if (signed) {
            response.cookies.set(SESSION_ROLE_COOKIE, signed, {
                maxAge: SESSION_ROLE_MAX_AGE,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                path: "/",
                sameSite: "lax",
            })
        }

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
 * Requires a valid session cookie to prevent unauthenticated cookie clearing.
 */
export async function DELETE(req: NextRequest) {
    try {
        const sessionCookie = req.cookies.get(COOKIE_NAME)?.value
        if (!sessionCookie) {
            return NextResponse.json({ error: "No session" }, { status: 401 })
        }

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const auth = getAuth()
        await auth.verifySessionCookie(sessionCookie)

        const response = NextResponse.json({ status: "ok" })
        response.cookies.set(COOKIE_NAME, "", {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })
        response.cookies.set(SESSION_ROLE_COOKIE, "", {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })
        return response
    } catch {
        // Invalid/expired session — clear cookie anyway since it's useless
        const response = NextResponse.json({ status: "ok" })
        response.cookies.set(COOKIE_NAME, "", {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })
        response.cookies.set(SESSION_ROLE_COOKIE, "", {
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            path: "/",
            sameSite: "lax",
        })
        return response
    }
}
