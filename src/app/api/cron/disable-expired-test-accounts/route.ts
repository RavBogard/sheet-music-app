import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { disableExpiredLoginableAccounts } from "@/lib/mcp/tools/test-tokens"
import { logger } from "@/lib/logger"
import { captureException } from "@/lib/error-reporting"
import { env } from "@/env.mjs"
import { httpError } from "@/lib/http/error-envelope"

function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * GET /api/cron/disable-expired-test-accounts
 *
 * Hourly TTL cutoff for browser-loginable test accounts. A `loginable` test
 * account signs in via the browser (Firebase session + ID token), which never
 * touches `verifyBearer`'s MCP-bearer TTL check — so without this, an expired
 * loginable credential could keep authorizing client-side Firestore reads (the
 * ID token, not the app session cookie, is what Firestore checks) until manual
 * revoke/cleanup. This disables the Auth user AND revokes its refresh tokens so
 * outstanding ID tokens die within ≤1h and `verifySessionCookie(cookie, true)`
 * rejects any live session. NOT a data sweep — hard-delete stays with
 * revoke_test_account / cleanup_all_test_data.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (same shape as the sibling
 * crons; Vercel cron sets it automatically when `crons` is in vercel.json).
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization")
        const cronSecret = env.CRON_SECRET
        if (
            !cronSecret ||
            !authHeader ||
            !safeCompare(authHeader, `Bearer ${cronSecret}`)
        ) {
            return httpError(
                401,
                "unauthenticated",
                "Cron route requires Vercel CRON_SECRET bearer auth.",
                {},
                "Invoked by Vercel cron; manual probes will 401 unless you pass the CRON_SECRET bearer.",
            )
        }

        const result = await disableExpiredLoginableAccounts()
        return NextResponse.json({ ok: true, ...result })
    } catch (err) {
        logger.error("[disable-expired-test-accounts] cron failed:", err)
        captureException(err, {
            source: "cron",
            location: "disable-expired-test-accounts",
        })
        return httpError(
            500,
            "server_error",
            "disable-expired-test-accounts cron failed.",
            { debug: err instanceof Error ? err.message : String(err) },
        )
    }
}
