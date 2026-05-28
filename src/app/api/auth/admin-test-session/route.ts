import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { initAdmin, getAuth } from "@/lib/firebase-admin"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    SESSION_ROLE_COOKIE,
    SESSION_ROLE_MAX_AGE,
    signRoleCookie,
} from "@/lib/session-role"
import { logger } from "@/lib/logger"
import {
    provisionAdminTestSession,
    ADMIN_TEST_CLAIM,
} from "@/lib/mcp/tools/admin-test-session"

/**
 * POST /api/auth/admin-test-session
 *
 * Strongly-gated admin test-session mint (Daniel-ratified 2026-05-27,
 * decisions.md item 2). Closes the `as('admin')` hole in the harness
 * role-gate matrix WITHOUT weakening the `create_test_account` `TEST_ROLE`
 * priv-esc guard — admin can't be minted by ANY bearer through the MCP tool
 * surface; this distinct endpoint is the only path, and it's gated by a
 * separate secret (`MCP_ADMIN_TEST_SESSION_SECRET`), not a bearer.
 *
 * Auth model (constraint 1): the SECRET *is* the authorization. The caller
 * presents it in the `x-admin-test-secret` header; we `timingSafeEqual` it
 * against the env var (mirrors the cron `safeCompare` pattern). There is no
 * bearer, no MCP tool, nothing in the registry surface that mints admin.
 *
 *   - Env var unset           → 503 `admin_test_session_disabled` (dormant
 *                               until Daniel sets it in Vercel prod).
 *   - Missing / wrong secret  → 403 `forbidden`.
 *   - OK                      → mint a fresh `test-admin-<hex>` user
 *                               (claims role:admin + admin_test:true, ~1h
 *                               TTL, audit row, MCP bearer) + a session
 *                               cookie, and return the bearer + customToken.
 *
 * The minted session carries the `admin_test:true` custom claim (constraint
 * 4) so downstream REAL surfaces can refuse it if they choose
 * (defense-in-depth — a leaked admin_test session should not be able to do
 * destructive prod ops if a surface gates on the flag).
 *
 * Why we re-enable the user: same as `/api/auth/test-session` — the user is
 * created `disabled:true` so it can't sign in via the UI; we flip it to
 * `disabled:false` for the Identity Toolkit exchange and don't re-disable
 * (verifySessionCookie(cookie,true) would brick the just-minted cookie). The
 * substitute safety surface is the secret gate + the 1h TTL + the audit row.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COOKIE_NAME = "__session"
const SECRET_HEADER = "x-admin-test-secret"
/** Admin session cookie lifetime — short by design (matches the bearer TTL). */
const SESSION_MAX_AGE = 60 * 60 // 1 hour
const CUSTOM_TOKEN_TTL_SEC = 60 * 60

function envelopeResponse(envelope: RichErrorEnvelope, status: number): NextResponse {
    const res = NextResponse.json(envelope, { status })
    res.headers.set("Cache-Control", "no-store")
    return res
}

/** Constant-time secret compare; length-mismatch short-circuits safely. */
function secretMatches(provided: string, expected: string): boolean {
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
    const limited = await checkRateLimit(req, "api")
    if (limited) return limited

    // ── Secret gate (constraint 1) ──────────────────────────────────────
    const expectedSecret = process.env.MCP_ADMIN_TEST_SESSION_SECRET
    if (!expectedSecret) {
        return envelopeResponse(
            richError(
                "admin_test_session_disabled",
                "Admin test-session minting is disabled: MCP_ADMIN_TEST_SESSION_SECRET is not configured on this deployment.",
                {},
                "This surface is dormant until Daniel sets the secret in Vercel prod. It is intentionally NOT enabled by default.",
            ),
            503,
        )
    }
    const provided = req.headers.get(SECRET_HEADER) ?? ""
    if (!provided || !secretMatches(provided, expectedSecret)) {
        // Never echo the provided value or any uid — a wrong-secret probe
        // gets a generic refusal.
        return envelopeResponse(
            richError(
                "forbidden",
                "Admin test-session minting requires a valid admin-test secret.",
                {},
                `Present the secret in the ${SECRET_HEADER} header. This endpoint is harness-only and not part of the MCP tool surface.`,
            ),
            403,
        )
    }

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

    // Optional TTL override (clamped in the core); default 1h.
    let ttlSec: number | undefined
    try {
        const body = (await req.json()) as { ttlSec?: unknown }
        if (body && typeof body === "object" && typeof body.ttlSec === "number") {
            ttlSec = body.ttlSec
        }
    } catch {
        // empty/non-JSON body → default TTL.
    }

    // ── Mint the admin-test user + bearer + audit row ───────────────────
    let minted: Awaited<ReturnType<typeof provisionAdminTestSession>>
    try {
        minted = await provisionAdminTestSession({
            ttlSec,
            callerContext:
                req.headers.get("x-forwarded-for") ??
                req.headers.get("x-real-ip") ??
                undefined,
        })
    } catch (err) {
        logger.error("[admin-test-session] provision failed", { err })
        return envelopeResponse(
            richError(
                "provision_failed",
                "Failed to provision the admin test user.",
                {},
            ),
            500,
        )
    }

    const { uid } = minted
    const auth = getAuth()

    // Flip disabled:false so signInWithCustomToken succeeds (test-session
    // pattern — not re-disabled afterward; the 1h TTL is the bound).
    try {
        await auth.updateUser(uid, { disabled: false })
    } catch (err) {
        logger.error("[admin-test-session] updateUser(disabled:false) failed", { uid, err })
        return envelopeResponse(
            richError("user_enable_failed", "Could not enable the admin test user for sign-in.", {}),
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
            logger.warn("[admin-test-session] custom-token exchange failed", {
                uid,
                status: exchange.status,
                text,
            })
            return envelopeResponse(
                richError(
                    "custom_token_exchange_failed",
                    "Identity Toolkit rejected the custom token.",
                    { upstreamStatus: exchange.status },
                ),
                502,
            )
        }
        const data = (await exchange.json()) as { idToken?: string }
        if (!data.idToken) {
            return envelopeResponse(
                richError("custom_token_exchange_failed", "Identity Toolkit returned no idToken.", {}),
                502,
            )
        }
        idToken = data.idToken
    } catch (err) {
        logger.error("[admin-test-session] custom-token mint+exchange threw", { uid, err })
        return envelopeResponse(
            richError("custom_token_exchange_failed", "Failed to mint or exchange the custom token.", {}),
            500,
        )
    }

    let sessionCookie: string
    try {
        sessionCookie = await auth.createSessionCookie(idToken, {
            expiresIn: SESSION_MAX_AGE * 1000,
        })
    } catch (err) {
        logger.error("[admin-test-session] createSessionCookie failed", { uid, err })
        return envelopeResponse(
            richError(
                "session_cookie_mint_failed",
                "Failed to mint Firebase session cookie from the exchanged idToken.",
                {},
            ),
            500,
        )
    }

    // Fresh customToken for the response body (META-003 parity) — lets the
    // harness drive `signInWithCustomToken` client-side. Short-lived secret;
    // NEVER logged, NEVER in a refusal body.
    let responseCustomToken: string
    try {
        responseCustomToken = await auth.createCustomToken(uid)
    } catch (err) {
        logger.error("[admin-test-session] response customToken mint failed", { uid, err })
        return envelopeResponse(
            richError("custom_token_mint_failed", "Failed to mint custom token for response body.", {}),
            500,
        )
    }

    const sessionMintedAt = new Date().toISOString()
    const response = NextResponse.json({
        ok: true,
        uid,
        role: "admin",
        [ADMIN_TEST_CLAIM]: true,
        token: minted.token,
        tokenId: minted.tokenId,
        customToken: responseCustomToken,
        sessionMintedAt,
        expiresInSec: SESSION_MAX_AGE,
        customTokenExpiresInSec: CUSTOM_TOKEN_TTL_SEC,
    })
    response.headers.set("Cache-Control", "no-store")
    response.cookies.set(COOKIE_NAME, sessionCookie, {
        maxAge: SESSION_MAX_AGE,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
    })
    const signed = await signRoleCookie(uid, "admin")
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
