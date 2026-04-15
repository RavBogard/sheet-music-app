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
            if (res.ok) return true
            logger.warn(`Session cookie sync attempt ${attempt + 1} failed: ${res.status}`)
        } catch (err) {
            logger.warn(`Session cookie sync attempt ${attempt + 1} error:`, err)
        }
    }
    return false
}
