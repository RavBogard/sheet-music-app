import type { User } from "firebase/auth"
import { logger } from "@/lib/logger"

/**
 * Sync the Firebase session cookie + __session_role companion cookie
 * by POSTing the current ID token to /api/auth/session. Retries once
 * on failure with a force-refreshed token.
 *
 * Returns true on success, false if both attempts failed. Never throws.
 *
 * Extracted from auth-context.tsx in v4.3 P10-03 so the drift-repair
 * module can import it without a circular dep.
 *
 * OPS-003 (2026-05-17): attempt-1 401 is the documented stale-cached
 * idToken race. /api/auth/session rejects idTokens issued more than
 * five minutes ago (replay window); on returning users with cached
 * Firebase sessions, `user.getIdToken(false)` hands back a token that
 * may be older than that. Attempt 2 calls `getIdToken(true)` to force
 * a fresh mint and normally succeeds. The attempt-1 401 is therefore
 * EXPECTED, not an error — log it at debug level (dev-only) and only
 * escalate to warn if either (a) attempt 1 fails with something other
 * than 401 (genuine surprise) or (b) the retry also fails. Emit an
 * info-level recovery log when attempt 2 saves us so the dance is
 * still visible without flooding prod with false-alarm warnings.
 */
export async function syncSessionCookie(user: User): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8000)
            const idToken = await user.getIdToken(attempt > 0) // force refresh on retry
            const res = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken }),
                signal: controller.signal,
            })
            clearTimeout(timeout)
            if (res.ok) {
                if (attempt > 0) {
                    logger.info(
                        `Session cookie sync recovered on attempt ${attempt + 1} after stale-token retry`,
                    )
                }
                return true
            }
            if (attempt === 0 && res.status === 401) {
                logger.debug(
                    "Session cookie sync attempt 1 returned 401 (expected: stale cached idToken; retrying with force-refresh)",
                )
                continue
            }
            logger.warn(`Session cookie sync attempt ${attempt + 1} failed: ${res.status}`)
        } catch (err) {
            logger.warn(`Session cookie sync attempt ${attempt + 1} error:`, err)
        }
    }
    logger.warn("Session cookie sync failed after retry — SSR auth may not work")
    return false
}
