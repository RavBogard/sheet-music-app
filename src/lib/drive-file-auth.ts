/**
 * Drive file-proxy auth helpers — extracted from
 * `src/app/api/drive/file/[fileId]/route.ts` because Next.js App Router
 * route files may only export HTTP method handlers.
 *
 * S03 (v4.3 P2-02).
 */
/**
 * Minimal shape we need — lets tests fake a request without constructing
 * a full NextRequest + Headers object.
 */
export interface HeaderReader {
    headers: { get(name: string): string | null }
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
