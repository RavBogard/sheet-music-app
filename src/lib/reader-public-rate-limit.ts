import { isIP } from "node:net"

import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { upstashRestCredentials } from "@/lib/upstash-env"

export type PublicReaderLimitTier = "selection" | "chart"

export type PublicReaderLimitDecision =
    | { allowed: true }
    | { allowed: false; status: 429 | 503; retryAfterSec?: number }

const CONFIG = {
    selection: { max: 30, windowSec: 60 },
    chart: { max: 120, windowSec: 60 },
} as const

type LimitResult = { success: boolean; reset: number }
type Limiter = { limit(key: string): Promise<LimitResult> }

/**
 * Development/test fallback only.  It is capacity-bounded, cleans expired
 * buckets synchronously, and denies new identities when full.  Production
 * requires Upstash: one serverless instance is not a distributed rate limit.
 */
export class BoundedPublicReaderLimiter implements Limiter {
    private readonly buckets = new Map<string, { count: number; reset: number }>()

    constructor(
        private readonly maxRequests: number,
        private readonly windowMs: number,
        private readonly maxKeys = 512,
        private readonly now: () => number = Date.now,
    ) {}

    async limit(key: string): Promise<LimitResult> {
        const now = this.now()
        const existing = this.buckets.get(key)
        if (!existing || existing.reset <= now) {
            if (!existing && this.buckets.size >= this.maxKeys) {
                for (const [candidate, bucket] of this.buckets) {
                    if (bucket.reset <= now) this.buckets.delete(candidate)
                }
            }
            if (!existing && this.buckets.size >= this.maxKeys) {
                return { success: false, reset: now + this.windowMs }
            }
            const reset = now + this.windowMs
            this.buckets.set(key, { count: 1, reset })
            return { success: true, reset }
        }
        if (existing.count >= this.maxRequests) {
            return { success: false, reset: existing.reset }
        }
        existing.count += 1
        return { success: true, reset: existing.reset }
    }
}

const localLimiters: Record<PublicReaderLimitTier, Limiter> = {
    selection: new BoundedPublicReaderLimiter(
        CONFIG.selection.max,
        CONFIG.selection.windowSec * 1000,
    ),
    chart: new BoundedPublicReaderLimiter(
        CONFIG.chart.max,
        CONFIG.chart.windowSec * 1000,
    ),
}

let distributed:
    | { selection: Limiter; chart: Limiter; url: string; token: string }
    | null = null

function distributedLimiters(): { selection: Limiter; chart: Limiter } | null {
    const creds = upstashRestCredentials()
    if (!creds) return null
    const { url, token } = creds
    if (distributed?.url === url && distributed.token === token) return distributed
    const redis = new Redis({ url, token })
    distributed = {
        url,
        token,
        selection: new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(
                CONFIG.selection.max,
                `${CONFIG.selection.windowSec} s`,
            ),
            prefix: "@rl/public-reader/selection",
            analytics: true,
        }),
        chart: new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(
                CONFIG.chart.max,
                `${CONFIG.chart.windowSec} s`,
            ),
            prefix: "@rl/public-reader/chart",
            analytics: true,
        }),
    }
    return distributed
}

function trustedClientIp(request: Request): string | null {
    if (process.env.NODE_ENV === "production") {
        // Vercel sets/overwrites this header.  Never fall back to a caller-set
        // Authorization token or a generic proxy header in production.
        if (process.env.VERCEL !== "1") return null
        const raw = request.headers.get("x-vercel-forwarded-for")?.trim() ?? ""
        return !raw.includes(",") && isIP(raw) !== 0 ? raw : null
    }
    const raw =
        request.headers.get("x-vercel-forwarded-for")?.trim() ||
        request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
        request.headers.get("x-real-ip")?.trim() ||
        "development-unknown"
    return raw
}

export async function checkPublicReaderRateLimit(
    request: Request,
    tier: PublicReaderLimitTier,
): Promise<PublicReaderLimitDecision> {
    const ip = trustedClientIp(request)
    if (!ip) return { allowed: false, status: 503 }

    const remote = distributedLimiters()
    if (process.env.NODE_ENV === "production" && !remote) {
        return { allowed: false, status: 503 }
    }
    const limiter = remote?.[tier] ?? localLimiters[tier]
    try {
        const result = await limiter.limit(`${tier}:ip:${ip}`)
        if (result.success) return { allowed: true }
        const retryAfterSec = Math.max(
            1,
            Math.ceil((result.reset - Date.now()) / 1000),
        )
        return { allowed: false, status: 429, retryAfterSec }
    } catch {
        // A failed distributed decision is not permission to serve public
        // chart bytes.  Production denies rather than using per-instance state.
        return { allowed: false, status: 503 }
    }
}
