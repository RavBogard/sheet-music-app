import { NextResponse } from "next/server"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import {
    SESSION_ROLE_COOKIE,
    SESSION_ROLE_MAX_AGE,
    signRoleCookie,
} from "@/lib/session-role"

/**
 * v4.3 P9-02 — POST /api/auth/refresh-session
 *
 * Re-mints the __session_role companion cookie from the current
 * Firestore users/{uid}.role. Called by the client drift handler
 * after sync-claims + getIdToken(true) + syncSessionCookie, so the
 * edge proxy's next evaluation sees a role that matches Firestore.
 *
 * Does NOT refresh Firebase's __session cookie — that's the
 * existing /api/auth/session endpoint's job and the Firebase SDK
 * already owns the token lifecycle.
 */
export const POST = createApiHandler(
    async (ctx): Promise<NextResponse> => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        if (!initAdmin()) {
            return NextResponse.json(
                { error: "Server not ready", code: "FIREBASE_NOT_INITIALIZED" },
                { status: 500 },
            )
        }
        const uid = ctx.auth!.uid
        const db = getFirestore()

        let role: string | null = null
        try {
            const snap = await db.collection("users").doc(uid).get()
            const r = snap.data()?.role
            if (typeof r === "string") role = r
        } catch (err) {
            logger.warn("[refresh-session] Firestore read failed:", err)
        }

        const signed = await signRoleCookie(uid, role)
        const response = NextResponse.json({ ok: true, role })
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
    },
    { requireAuth: true },
)
