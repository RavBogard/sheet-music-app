import { timingSafeEqual } from "crypto"

/**
 * The one shared-secret bearer check for server-to-server routes: Vercel cron
 * (`Authorization: Bearer ${CRON_SECRET}`), the intake run route and the
 * render route.
 *
 * It compares BYTE lengths, not string lengths: `timingSafeEqual` throws on
 * unequal-length buffers, and two strings of equal length can encode to
 * different byte counts once either holds a non-ASCII character. The old
 * per-route copies compared string lengths, so a header such as
 * `Bearer é…` turned a wrong secret into a 500. This never throws.
 */
export function safeCompare(a: string, b: string): boolean {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    if (left.byteLength !== right.byteLength) return false
    return timingSafeEqual(left, right)
}

/**
 * True only when `secret` is configured (non-empty) and `authHeader` is
 * exactly `Bearer ${secret}`. A missing header or a missing secret is false.
 */
export function bearerSecretMatches(
    authHeader: string | null | undefined,
    secret: string | null | undefined,
): boolean {
    if (!secret || !authHeader) return false
    return safeCompare(authHeader, `Bearer ${secret}`)
}
