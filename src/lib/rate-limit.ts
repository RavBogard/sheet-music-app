import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"
import { NextRequest, NextResponse } from "next/server"

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
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (url && token) {
        const redis = new Redis({ url, token })
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

const limiters = {
    /** General API: 60 req/min */
    api: createLimiter(60, 60),
    /** Upload: 10/min */
    upload: createLimiter(10, 60),
    /** Admin sync: 3/min */
    sync: createLimiter(3, 60),
    /** AI/expensive: 20/min */
    ai: createLimiter(20, 60),
}

export type LimiterName = keyof typeof limiters

/**
 * Extract a per-user rate limit key from the request.
 * Decodes the JWT payload to get the user's `sub` claim (Firebase UID).
 * Falls back to IP for unauthenticated requests.
 *
 * NOTE: The old implementation used the first 16 chars of the Bearer token,
 * which is the JWT header — identical for all Firebase tokens from the same
 * project. That made the rate limit global instead of per-user.
 */
function getKey(req: NextRequest): string {
    const auth = req.headers.get('Authorization')
    if (auth?.startsWith('Bearer ')) {
        try {
            // JWT = header.payload.signature — decode the payload segment
            const payload = auth.split('.')[1]
            if (payload) {
                const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
                const uid = decoded.sub || decoded.user_id
                if (uid) return `u:${uid}`
            }
        } catch { /* malformed token — fall through to IP */ }
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
    return `ip:${ip}`
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
    try {
        const key = `${tier}:${getKey(req)}`
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
        // Rate limit failure should not block requests
        logger.warn("[RateLimit] Check failed, allowing request:", err)
        return null
    }
}


