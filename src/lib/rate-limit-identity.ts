/**
 * Who the rate limiter may treat a request as.
 *
 * The limiter keys a bucket on the caller's uid only when something has
 * VERIFIED that uid. A route that has already verified its caller (a Firebase
 * ID token through `requireAuth`, an MCP bearer through `verifyBearer`) notes
 * the result here against the request object, so `checkRateLimit` reuses it
 * and never verifies the same token twice. `null` means "a token was checked
 * and it did not verify": the limiter then keys on the client IP.
 *
 * Deliberately free of imports so the auth modules can depend on it cheaply.
 */

const noted = new WeakMap<object, string | null>()

/** Record the verified uid for this request, or `null` for a token that failed. */
export function noteRateLimitIdentity(req: object, uid: string | null): void {
    noted.set(req, uid)
}

/**
 * The noted identity: a uid, `null` (checked, not valid), or `undefined`
 * (nothing has checked this request yet).
 */
export function notedRateLimitIdentity(req: object): string | null | undefined {
    return noted.has(req) ? (noted.get(req) ?? null) : undefined
}
