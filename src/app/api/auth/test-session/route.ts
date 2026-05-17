import { NextRequest, NextResponse } from "next/server"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { verifyBearer } from "@/lib/mcp/auth"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    SESSION_ROLE_COOKIE,
    SESSION_ROLE_MAX_AGE,
    signRoleCookie,
} from "@/lib/session-role"
import { logger } from "@/lib/logger"

/**
 * POST /api/auth/test-session
 *
 * Trades a verified MCP bearer (Authorization: Bearer crl_live_…) for a
 * Firebase session cookie scoped to a `test-*` uid. Two minting paths:
 *
 *  1. **Self-mint** (legacy, default): no body, OR body lacks `uid`. The
 *     bearer's own resolved uid IS the mint target. Refused unless that
 *     uid starts with `test-`.
 *  2. **Admin-bearer mint-on-behalf** (UX-001, Daniel-ratified
 *     2026-05-18T18:45Z): body `{uid: "test-..."}`, caller's `users/{uid}.role`
 *     === `'admin'`. Mints a session cookie for the body target uid
 *     PROVIDED the target uid (a) starts with `test-` AND (b) exists in
 *     `mcpTestUsers/{targetUid}`. Lets the supervisor + Playwright
 *     drive-from-one-admin-bearer pattern bootstrap multi-role test
 *     contexts without juggling per-role bearers.
 *
 * Hard rules:
 *  - Bearer MUST resolve through `verifyBearer` (same hashed-token store
 *    used by every other MCP route). Revoked / expired / unknown → 401
 *    `invalid_bearer`.
 *  - Mint target uid MUST start with `test-` regardless of branch.
 *  - Admin branch refuses if target uid isn't registered in `mcpTestUsers`.
 *
 * Why we re-enable the user: test accounts are minted with
 * `disabled: true` so the UI can't sign them in. Identity Toolkit's
 * `signInWithCustomToken` honors that flag and rejects with USER_DISABLED.
 * We flip `disabled: false` so the exchange succeeds, and we DO NOT
 * re-disable post-mint — `verifySessionCookie(cookie, true)` would fail
 * on a disabled user and brick the just-minted cookie. The substitute
 * safety surface is this endpoint's hard `^test-` uid gate + the
 * unchanged MCP-bearer requirement on top.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COOKIE_NAME = "__session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 14 // 14 days (Firebase max)
const TEST_UID_PREFIX = "test-"

function envelopeResponse(envelope: RichErrorEnvelope, status: number): NextResponse {
    const res = NextResponse.json(envelope, { status })
    res.headers.set("Cache-Control", "no-store")
    return res
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, "api")
    if (limited) return limited

    if (!initAdmin()) {
        return envelopeResponse(
            richError(
                "server_not_ready",
                "Firebase Admin SDK not initialized.",
                {},
                "Server is missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.",
            ),
            503,
        )
    }

    const verified = await verifyBearer(req)
    if (verified instanceof Response) {
        return envelopeResponse(
            richError(
                "invalid_bearer",
                "Bearer token missing, malformed, revoked, or expired.",
                {},
                "Mint a fresh test bearer via /api/mcp/oauth/mint-test-token or the MCP create_test_account tool.",
            ),
            401,
        )
    }

    const { uid: bearerUid } = verified

    // UX-001 — optional `uid` body param routes to the admin-bearer
    // mint-on-behalf branch. Empty body / non-JSON / missing field falls
    // through to self-mint with the bearer's own uid.
    let bodyTargetUid: string | undefined
    try {
        const body = (await req.json()) as { uid?: unknown }
        if (
            body &&
            typeof body === "object" &&
            typeof body.uid === "string" &&
            body.uid.trim()
        ) {
            bodyTargetUid = body.uid.trim()
        }
    } catch {
        // Empty body, non-JSON body, or already-consumed stream — all
        // fall through to self-mint, which is the pre-UX-001 behavior.
    }

    let uid: string
    if (bodyTargetUid && bodyTargetUid !== bearerUid) {
        // ── Admin-bearer mint-on-behalf branch (UX-001) ─────────────────
        // Read caller's role off users/{bearerUid}. The bearer doc itself
        // doesn't carry role; the auth gate is the user doc.
        const db = getFirestore()
        let callerRole: string | null = null
        try {
            const callerSnap = await db.collection("users").doc(bearerUid).get()
            const r = callerSnap.exists ? callerSnap.data()?.role : undefined
            if (typeof r === "string") callerRole = r
        } catch (err) {
            logger.warn("[test-session] caller-role read failed", {
                bearerUid,
                err,
            })
        }
        if (callerRole !== "admin") {
            // SEC-001 piggyback — do NOT echo bearerUid or targetUid in
            // the refusal body; envelope agent's sweep wants every
            // refusal scrubbed of identity.
            return envelopeResponse(
                richError(
                    "forbidden_role",
                    "Only admin bearers may mint sessions for a target uid.",
                    {
                        callerRole,
                        requiredRoles: ["admin"],
                    },
                    "Drop the `uid` body param to self-mint with the bearer's own uid, or call with an admin bearer.",
                ),
                403,
            )
        }
        if (!bodyTargetUid.startsWith(TEST_UID_PREFIX)) {
            return envelopeResponse(
                richError(
                    "invalid_argument",
                    "Admin-bearer minting requires the target uid to be in the test-* namespace.",
                    { field: "uid" },
                    "This endpoint exists only to bootstrap autonomous browser audits; real-user sessions must use /login.",
                ),
                400,
            )
        }
        const testUserSnap = await db
            .collection("mcpTestUsers")
            .doc(bodyTargetUid)
            .get()
        if (!testUserSnap.exists) {
            return envelopeResponse(
                richError(
                    "invalid_argument",
                    "Target uid is not registered in mcpTestUsers — mint a test account first.",
                    { field: "uid" },
                    "Call create_test_account first; the returned uid will be registered in mcpTestUsers.",
                ),
                400,
            )
        }
        uid = bodyTargetUid
    } else if (!bearerUid.startsWith(TEST_UID_PREFIX)) {
        // ── Self-mint branch (legacy) ───────────────────────────────────
        // SEC-001 piggyback — refusal body no longer echoes the bearerUid.
        return envelopeResponse(
            richError(
                "not_a_test_uid",
                "Session-cookie minting is restricted to test-* uids. Pass an admin bearer with a `uid` body param to mint for a target.",
                {},
                "This endpoint exists only to bootstrap autonomous browser audits. Real users must sign in via /login.",
            ),
            403,
        )
    } else {
        uid = bearerUid
    }

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
    if (!apiKey) {
        return envelopeResponse(
            richError(
                "server_misconfigured",
                "NEXT_PUBLIC_FIREBASE_API_KEY is not set; cannot exchange custom token.",
            ),
            500,
        )
    }

    const auth = getAuth()

    try {
        await auth.updateUser(uid, { disabled: false })
    } catch (err) {
        logger.error("[test-session] updateUser(disabled:false) failed", { uid, err })
        return envelopeResponse(
            richError(
                "user_enable_failed",
                "Could not re-enable the test user for sign-in.",
                { uid },
            ),
            500,
        )
    }

    let idToken: string
    try {
        const customToken = await auth.createCustomToken(uid)
        const exchange = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: customToken, returnSecureToken: true }),
            },
        )
        if (!exchange.ok) {
            const text = await exchange.text().catch(() => "")
            logger.warn("[test-session] custom-token exchange failed", {
                uid,
                status: exchange.status,
                text,
            })
            return envelopeResponse(
                richError(
                    "custom_token_exchange_failed",
                    "Identity Toolkit rejected the custom token.",
                    { uid, upstreamStatus: exchange.status },
                ),
                502,
            )
        }
        const data = (await exchange.json()) as { idToken?: string }
        if (!data.idToken) {
            return envelopeResponse(
                richError(
                    "custom_token_exchange_failed",
                    "Identity Toolkit returned no idToken.",
                    { uid },
                ),
                502,
            )
        }
        idToken = data.idToken
    } catch (err) {
        logger.error("[test-session] custom-token mint+exchange threw", { uid, err })
        return envelopeResponse(
            richError(
                "custom_token_exchange_failed",
                "Failed to mint or exchange the custom token.",
                { uid },
            ),
            500,
        )
    }

    let sessionCookie: string
    try {
        sessionCookie = await auth.createSessionCookie(idToken, {
            expiresIn: SESSION_MAX_AGE * 1000,
        })
    } catch (err) {
        logger.error("[test-session] createSessionCookie failed", { uid, err })
        return envelopeResponse(
            richError(
                "session_cookie_mint_failed",
                "Failed to mint Firebase session cookie from the exchanged idToken.",
                { uid },
            ),
            500,
        )
    }

    let role: string | null = null
    try {
        const db = getFirestore()
        const snap = await db.collection("users").doc(uid).get()
        const r = snap.data()?.role
        if (typeof r === "string") role = r
    } catch (err) {
        logger.warn("[test-session] users/{uid} role read failed", { uid, err })
    }

    const sessionMintedAt = new Date().toISOString()
    const response = NextResponse.json({
        ok: true,
        uid,
        role,
        sessionMintedAt,
        expiresInSec: SESSION_MAX_AGE,
    })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set(COOKIE_NAME, sessionCookie, {
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
    })
    const signed = await signRoleCookie(uid, role)
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
}
