import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"
import { upstashRestCredentials } from "@/lib/upstash-env"
import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { noteRateLimitIdentity, notedRateLimitIdentity } from "@/lib/rate-limit-identity"

// In-memory fallback for development or if Redis is not configured
class InMemoryRateLimiter {
    private tokens: Map<string, number>
    private timestamps: Map<string, number>
    private readonly maxRequests: number
    private readonly interval: number

    constructor(limit: number, interval: number) {
        this.tokens = new Map()
        this.timestamps = new Map()
        this.maxRequests = limit
        this.interval = interval

        // Periodic cleanup
        if (typeof setInterval !== 'undefined') {
            setInterval(() => {
                const now = Date.now()
                for (const [key, ts] of this.timestamps) {
                    if (now - ts > this.interval * 3) {
                        this.tokens.delete(key)
                        this.timestamps.delete(key)
                    }
                }
            }, 5 * 60_000)
        }
    }

    async limit(key: string): Promise<{ success: boolean, limit: number, remaining: number, reset: number }> {
        const now = Date.now()
        const lastRefill = this.timestamps.get(key) || 0
        const tokens = this.tokens.get(key) ?? this.maxRequests

        // Calculate refill
        const timePassed = now - lastRefill
        const refill = Math.floor(timePassed / this.interval) * this.maxRequests
        const newTokens = Math.min(this.maxRequests, tokens + refill)

        if (newTokens > 0) {
            this.tokens.set(key, newTokens - 1)
            this.timestamps.set(key, now)
            return { success: true, limit: this.maxRequests, remaining: newTokens - 1, reset: now + this.interval }
        }

        return { success: false, limit: this.maxRequests, remaining: 0, reset: lastRefill + this.interval }
    }
}

// Create the limiter instance
type LimiterLike = { limit(key: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> }

function createLimiter(maxRequests: number, windowSec: number): LimiterLike {
    const creds = upstashRestCredentials()

    if (creds) {
        const redis = new Redis({ url: creds.url, token: creds.token })
        return new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(maxRequests, `${windowSec} s`),
            analytics: true,
            prefix: `@rl/${maxRequests}/${windowSec}`,
        })
    }

    return new InMemoryRateLimiter(maxRequests, windowSec * 1000)
}

// ── Pre-configured limiters ──

const limiterConfigs = {
    api: { max: 60, window: 60 },
    upload: { max: 10, window: 60 },
    sync: { max: 3, window: 60 },
    ai: { max: 20, window: 60 },
    bridgeSetup: { max: 5, window: 60 },
    chart: { max: 1000, window: 60 },
    perform: { max: 300, window: 60 },
    telemetry: { max: 300, window: 60 },
    printAnon: { max: 15, window: 60 },
} as const

const limiters = {
    /** General API: 60 req/min */
    api: createLimiter(60, 60),
    /** Upload: 10/min */
    upload: createLimiter(10, 60),
    /** Admin sync: 3/min */
    sync: createLimiter(3, 60),
    /** AI/expensive: 20/min */
    ai: createLimiter(20, 60),
    /** Bridge setup-code redemption: 5/min — credential-exchange endpoint */
    bridgeSetup: createLimiter(5, 60),
    /**
     * Chart bytes: 1000 req/min — `/api/drive/file/[fileId]` and
     * `/api/library/file/[id]`.
     * The limiter keys by client IP, and CRC's band runs ~6 iPads behind ONE
     * synagogue NAT, so the whole fleet shares a single IP bucket. The shared
     * `api` tier (60/min) starved them mid-service: 6 iPads each prefetching /
     * opening a ~20-chart setlist (plus retries) blow past 60/min → HTTP 429
     * "Failed to load PDF". Chart GETs are public, idempotent, and CDN-cached
     * (`public, s-maxage=604800`), so most repeat fetches never reach origin —
     * this generous ceiling only has to absorb the cold/first-fetch burst when
     * the fleet pre-caches a new setlist. Raised from 600 (2026-10-31, gap-sec):
     * the in-app chart fetch sends no Authorization header, so every iPad —
     * signed in or not — lands on the one shul IP bucket. Sized for ~10 iPads ×
     * a 40-row setlist × one retry each = 800 cold fetches in a minute, with
     * headroom, while staying a real ceiling (not unlimited) so a scraper can't
     * hammer origin.
     */
    chart: createLimiter(1000, 60),
    /**
     * Perform reads: 300 req/min — `/api/setlists/[setlistId]/tracks`, the
     * public endpoint a SIGNED-OUT Perform page reads its rows from. Those
     * callers are anonymous, so the bucket is the shul's one IP, shared by the
     * whole iPad fleet and by congregants opening /perform links on the same
     * WiFi. Kept off the shared `api` tier (60/min) so that other anonymous
     * traffic cannot starve the band mid-service: ~10 iPads × (an open plus an
     * `online`/`visibilitychange` retry or two) is ~30/min, and 300 leaves
     * room for a room full of phones. One Firestore read per call.
     */
    perform: createLimiter(300, 60),
    /**
     * Telemetry / public-poll burst: 300 req/min — `/api/auth/qr` (POST create
     * + GET poll + PUT approve) and `/api/web-vitals` (POST beacon). Like the
     * `chart` tier, the limiter keys by client IP, and a venue's ~6 iPads run
     * behind ONE NAT, so the whole fleet shares a single IP bucket. The shared
     * `api` tier (60/min) starved them on a cold landing: each iPad fires a QR
     * poll every ~2s (≈30/min) plus up to 5 web-vitals beacons (LCP/CLS/INP/
     * FCP/TTFB) per load → ~36/min/device × 6 ≈ 216/min combined cold peak →
     * HTTP 429 (F-6). These are cheap, idempotent, TTL-bounded single-doc
     * writes, so 300/min absorbs the fleet burst with headroom while staying a
     * real ceiling. Applies equally to CRC + broslaz (both run iPad fleets);
     * the QR poll also self-backs-off on 429 client-side, so steady state sits
     * well under the ceiling. Protects the cold-cohort web-vitals beacons the
     * v11.3-04 deferred TTFB RUM probe depends on.
     */
    telemetry: createLimiter(300, 60),
    /**
     * Anonymous printing: 15 req/min — `POST /api/setlist/print` when the
     * caller has no session (Daniel, 2026-09-10: anyone may print). Signed-in
     * callers stay on the shared `api` tier keyed by uid; this tier only
     * covers the unauthenticated path, which is IP-keyed and therefore open
     * to the internet.
     *
     * Deliberately far below `api`'s 60/min: a print is a 120s-maxDuration
     * serverless job that fetches every chart's bytes and can run OCR-backed
     * transposition, so an open 60/min bucket is a real cost lever. 15/min
     * still absorbs a handful of guests printing at once behind the shul's
     * single NAT (the sharing problem documented on the `chart` tier),
     * because printing is a deliberate one-off action, not a per-chart fetch.
     * Repeat identical requests mostly never reach the pipeline anyway —
     * print-pipeline.ts serves them from the content-hash result cache.
     */
    printAnon: createLimiter(15, 60),
}

// In-memory fallbacks used when Redis is unavailable (fail-closed)
const fallbackLimiters: Record<string, InMemoryRateLimiter> = {}
function getFallbackLimiter(tier: LimiterName): InMemoryRateLimiter {
    if (!fallbackLimiters[tier]) {
        const cfg = limiterConfigs[tier]
        fallbackLimiters[tier] = new InMemoryRateLimiter(cfg.max, cfg.window * 1000)
    }
    return fallbackLimiters[tier]
}

export type LimiterName = keyof typeof limiters

function clientIp(req: NextRequest): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
}

// Verified Firebase ID tokens, by SHA-256 of the token → uid (or null for a
// token that failed). Only consulted when the route has NOT already verified
// the caller (see rate-limit-identity.ts). Entries live 60 s, never past the
// token's own expiry; the map is cleared when it grows past its cap so a flood
// of random tokens cannot grow it without bound.
const ID_TOKEN_CACHE_MS = 60_000
const ID_TOKEN_CACHE_MAX = 5_000
const idTokenCache = new Map<string, { uid: string | null; until: number }>()

async function verifiedIdTokenUid(token: string): Promise<string | null> {
    const hash = createHash('sha256').update(token).digest('hex')
    const now = Date.now()
    const hit = idTokenCache.get(hash)
    if (hit && hit.until > now) return hit.uid
    let uid: string | null = null
    let until = now + ID_TOKEN_CACHE_MS
    try {
        const { verifyIdToken } = await import('@/lib/firebase-admin')
        const decoded = await verifyIdToken(token)
        if (decoded?.uid) {
            uid = decoded.uid
            if (typeof decoded.exp === 'number') until = Math.min(until, decoded.exp * 1000)
        }
    } catch {
        uid = null
    }
    if (idTokenCache.size >= ID_TOKEN_CACHE_MAX) idTokenCache.clear()
    idTokenCache.set(hash, { uid, until })
    return uid
}

/**
 * The bucket key for a request: `u:{uid}` only for a VERIFIED caller,
 * otherwise `ip:{client ip}`.
 *
 * History: this used to decode the `sub` of the Bearer JWT without verifying
 * it, so a forged token with a random `sub` got a fresh bucket on every
 * request. Now:
 *   1. `telemetry` is always IP-keyed (public beacon / QR poll).
 *   2. A route that already verified its caller (requireAuth, verifyBearer)
 *      left the answer on the request; we reuse it — no second verification.
 *   3. Otherwise a Firebase ID token is verified with the Admin SDK (cached by
 *      token hash), and an MCP bearer (`crl_…`) through verifyBearer, which is
 *      memoised per request so the route's own check reuses it.
 *   4. Anything unverified, invalid or anonymous falls back to the client IP.
 *      The band's iPads share one shul IP, so the Perform-path tiers
 *      (`chart`, `perform`) are sized for the whole fleet on one IP bucket.
 */
async function getKey(req: NextRequest, tier?: LimiterName): Promise<string> {
    if (tier === 'telemetry') return `ip:${clientIp(req)}`

    const noted = notedRateLimitIdentity(req)
    if (noted) return `u:${noted}`

    const auth = req.headers.get('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
    if (token.startsWith('crl_')) {
        // An MCP bearer. requireAuth may already have noted it as a failed
        // Firebase token; verifyBearer is the check that applies. It is
        // memoised per request, so the route's own call reuses this answer.
        try {
            const { verifyBearer } = await import('@/lib/mcp/auth')
            const verified = await verifyBearer(req)
            if (!(verified instanceof Response)) return `u:${verified.uid}`
        } catch { /* fall through to IP */ }
    } else if (noted === undefined && token.split('.').length === 3) {
        const uid = await verifiedIdTokenUid(token)
        noteRateLimitIdentity(req, uid)
        if (uid) return `u:${uid}`
    }
    return `ip:${clientIp(req)}`
}

/**
 * Per-user rate limit check (request-independent). Used by MCP tools where
 * the caller's IP is Claude's shared egress, not the user's — so the
 * request-IP fallback in checkRateLimit would lump all CRC users together
 * with every other claude.ai tenant. Keying on `u:{uid}` gives each MCP
 * user their own bucket.
 *
 * `opts.bypass: true` bypasses the limiter entirely. Callers compute this
 * from the caller's role — admins AND band_leaders are trusted MCP write
 * users (CRC has a tiny count of each, both already wield destructive
 * powers via the editor write tools, and capping their throughput just
 * gets in the way of legitimate batch work: bulk uploads, bulk cleanups,
 * cowork-driven stress tests, gig-packet generation). Non-leader callers
 * still get the per-tier limits.
 *
 * Returns `null` if OK, or `{ error, retryAfterSec }` if limited.
 */
export async function checkUserRateLimit(
    uid: string,
    tier: LimiterName = "api",
    opts?: { bypass?: boolean },
): Promise<{ error: string; retryAfterSec: number } | null> {
    if (opts?.bypass) return null
    const key = `${tier}:u:${uid}`
    try {
        const result = await limiters[tier].limit(key)
        if (!result.success) {
            return {
                error: "Too many requests. Please try again later.",
                retryAfterSec: 60,
            }
        }
        return null
    } catch (err) {
        logger.warn(
            "[RateLimit] Redis failed in checkUserRateLimit, using in-memory fallback:",
            err,
        )
        try {
            const fallback = getFallbackLimiter(tier)
            const result = await fallback.limit(key)
            if (!result.success) {
                return {
                    error: "Too many requests. Please try again later.",
                    retryAfterSec: 60,
                }
            }
            return null
        } catch {
            logger.error(
                "[RateLimit] Both Redis and fallback failed, allowing request",
            )
            return null
        }
    }
}

/**
 * Check rate limit for a request. Returns null if OK, 429 response if limited.
 *
 * Usage in route:
 *   const limited = await checkRateLimit(req, 'api')
 *   if (limited) return limited
 */
export async function checkRateLimit(
    req: NextRequest,
    tier: LimiterName = 'api'
): Promise<NextResponse | null> {
    const key = `${tier}:${await getKey(req, tier)}`
    try {
        const result = await limiters[tier].limit(key)

        if (!result.success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again later." },
                {
                    status: 429,
                    headers: {
                        'Retry-After': '60',
                        'X-RateLimit-Limit': String(result.limit),
                        'X-RateLimit-Remaining': '0',
                    }
                }
            )
        }
        return null
    } catch (err) {
        // Redis unavailable — fail closed with in-memory fallback
        logger.warn("[RateLimit] Redis failed, using in-memory fallback:", err)
        try {
            const fallback = getFallbackLimiter(tier)
            const result = await fallback.limit(key)
            if (!result.success) {
                return NextResponse.json(
                    { error: "Too many requests. Please try again later." },
                    { status: 429, headers: { 'Retry-After': '60' } }
                )
            }
            return null
        } catch {
            // Both Redis and in-memory failed — allow as last resort
            logger.error("[RateLimit] Both Redis and fallback failed, allowing request")
            return null
        }
    }
}


