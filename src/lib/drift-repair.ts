import type { User } from "firebase/auth"
import { logger } from "@/lib/logger"
import { apiFetch } from "@/lib/api-client"
import { syncSessionCookie } from "@/lib/session-cookie"

// v4.3 P10-03 — Firestore↔claim↔cookie drift repair.
//
// Four sequential steps, each retried up to 3 times with exponential backoff
// (0ms / 200ms / 800ms). Every attempt logs with a consistent prefix so the
// whole chain is greppable in Vercel function logs: `[drift] step=<name>
// attempt=<n> outcome=<ok|failed|skipped>`.
//
// Short-circuit rule: if an earlier step terminally fails, dependent later
// steps are marked 'skipped' rather than running with a known-stale
// prerequisite. sessionCookie and refreshSession are independent (both mint
// cookies server-side from Firestore), so a cookie failure does not skip the
// companion refresh.

export type StepOutcome = "ok" | "failed" | "skipped"

export interface DriftSummary {
    syncClaims: StepOutcome
    idTokenRefresh: StepOutcome
    sessionCookie: StepOutcome
    refreshSession: StepOutcome
}

const BACKOFFS_MS = [0, 200, 800]

async function delay(ms: number): Promise<void> {
    if (ms <= 0) return
    await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run a drift step up to 3 times. `fn` returns true on success, false on
 * recoverable failure, or throws for an unexpected failure. Logs one line
 * per attempt; returns 'ok' on any success, 'failed' after all retries
 * are exhausted.
 */
async function withRetry(
    step: string,
    fn: () => Promise<boolean>,
): Promise<StepOutcome> {
    const start = Date.now()
    for (let i = 0; i < BACKOFFS_MS.length; i++) {
        await delay(BACKOFFS_MS[i])
        const attempt = i + 1
        try {
            const ok = await fn()
            if (ok) {
                const elapsed = Date.now() - start
                if (attempt > 1) {
                    logger.info(
                        `[drift] step=${step} attempt=${attempt} outcome=ok recovered-after=${elapsed}ms`,
                    )
                } else {
                    logger.info(`[drift] step=${step} attempt=${attempt} outcome=ok`)
                }
                return "ok"
            }
            logger.warn(
                `[drift] step=${step} attempt=${attempt} outcome=failed reason=non-ok-response`,
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            logger.warn(
                `[drift] step=${step} attempt=${attempt} outcome=failed error="${msg.slice(0, 200)}"`,
            )
        }
    }
    logger.error(`[drift] step=${step} attempt=all outcome=failed (3 retries exhausted)`)
    return "failed"
}

function logSkipped(step: string, reason: string): StepOutcome {
    logger.warn(`[drift] step=${step} outcome=skipped reason=${reason}`)
    return "skipped"
}

export async function repairDrift(user: User): Promise<DriftSummary> {
    // Step 1: server-side claim repair.
    const syncClaims = await withRetry("syncClaims", async () => {
        const res = await apiFetch("/api/auth/sync-claims", { method: "POST" })
        return res.ok
    })

    // Step 2: force-refresh the client ID token so it carries the new claim.
    // If step 1 terminally failed, the token won't carry fresh claims regardless;
    // skip to avoid wasting retries on known-stale state.
    let idTokenRefresh: StepOutcome
    if (syncClaims === "failed") {
        idTokenRefresh = logSkipped("idTokenRefresh", "skipped-prereq")
    } else {
        idTokenRefresh = await withRetry("idTokenRefresh", async () => {
            const token = await user.getIdToken(true)
            return typeof token === "string" && token.length > 0
        })
    }

    // Step 3: re-mint __session + __session_role from the refreshed token.
    // Depends on a fresh token to carry accurate claims.
    let sessionCookie: StepOutcome
    if (idTokenRefresh !== "ok") {
        sessionCookie = logSkipped("sessionCookie", "skipped-prereq")
    } else {
        sessionCookie = await withRetry("sessionCookie", async () => {
            return await syncSessionCookie(user)
        })
    }

    // Step 4: refresh the server-signed companion role cookie independently.
    // Not gated on sessionCookie — the server reads Firestore directly for this
    // path, so a cookie-mint hiccup doesn't invalidate the role refresh.
    // It IS gated on idTokenRefresh (the endpoint requires a valid auth token).
    let refreshSession: StepOutcome
    if (idTokenRefresh !== "ok") {
        refreshSession = logSkipped("refreshSession", "skipped-prereq")
    } else {
        refreshSession = await withRetry("refreshSession", async () => {
            const res = await apiFetch("/api/auth/refresh-session", { method: "POST" })
            return res.ok
        })
    }

    return { syncClaims, idTokenRefresh, sessionCookie, refreshSession }
}
