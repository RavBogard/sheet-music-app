/**
 * Drive file-proxy auth helpers — extracted from
 * `src/app/api/drive/file/[fileId]/route.ts` because Next.js App Router
 * route files may only export HTTP method handlers.
 *
 * S03 (v4.3 P2-02).
 */
import { initAdmin } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"

/**
 * Minimal shape we need — lets tests fake a request without constructing
 * a full NextRequest + Headers object.
 */
export interface HeaderReader {
    headers: { get(name: string): string | null }
}

/** Minimal cookie-reader shape — NextRequest.cookies satisfies it. */
export interface CookieReader {
    cookies: { get(name: string): { value: string } | undefined }
}

const SESSION_COOKIE_NAME = "__session"

/**
 * Verify the Firebase session cookie (`__session`) on a request.
 *
 * Unlike `hasBrowserFetchMetadata`, this IS a real cryptographic auth boundary:
 * `__session` is HttpOnly + server-minted (see /api/auth/session) and cannot be
 * forged. Browser fetches (`<audio>`, `<img>`, `<embed>`, prefetches) send it
 * automatically without needing a Bearer header — the gap that the
 * `Sec-Fetch-*` heuristic was a (forgeable) stand-in for.
 *
 * Returns the verified uid, or null for any failure (no cookie, expired,
 * revoked, Admin SDK unavailable). Never throws.
 */
export async function verifySessionCookieRequest(
    req: CookieReader,
): Promise<string | null> {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value
    if (!cookie) return null
    try {
        if (!initAdmin()) return null
        const decoded = await getAuth().verifySessionCookie(cookie, true)
        return decoded.uid
    } catch {
        // Expired / revoked / malformed cookie — treat as unauthenticated.
        return null
    }
}

/**
 * Defense-in-depth check — NOT a cryptographic auth boundary.
 *
 * Real browsers set `Sec-Fetch-*` on user-origin fetches and the browser
 * (not page JS) controls those headers, so curl/scripts typically don't
 * send them. A dedicated attacker CAN forge them, so this is not a real
 * security gate on its own.
 *
 * S03 follow-up: replace with a Firebase Auth session cookie check so
 * browser fetches (`<img>`, `<audio>`, `<embed>`, prefetches) authenticate
 * without needing to attach a Bearer header.
 *
 * S03 (v4.3 P2-02): dropped the Referer + Accept-header fallbacks since
 * both are trivially client-controlled.
 */
export function hasBrowserFetchMetadata(req: HeaderReader): boolean {
    const site = req.headers.get('sec-fetch-site')
    if (site === 'same-origin' || site === 'same-site') return true
    const dest = req.headers.get('sec-fetch-dest')
    if (dest && dest !== 'empty') return true
    return false
}
