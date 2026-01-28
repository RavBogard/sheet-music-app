import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { env } from "@/lib/env"

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
const createLimiter = () => {
    // Check if we have Upstash credentials
    // Note: We access process.env directly here to avoid crash if env validation fails initially 
    // but typically we should use `env` from t3-env. 
    // However, since we made them optional in env.mjs, we can check them.

    // We access direct generated env if possible or check process.env
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (url && token) {
        const redis = new Redis({
            url,
            token,
        })

        return new Ratelimit({
            redis: redis,
            limiter: Ratelimit.slidingWindow(50, "1 m"), // 50 requests per minute
            analytics: true,
            prefix: "@upstash/ratelimit",
        })
    }

    // Fallback
    console.warn("⚠️  Upstash Redis not configured. Using in-memory rate limiting.")
    return new InMemoryRateLimiter(50, 60 * 1000)
}


const limiter = createLimiter()

export const globalLimiter = {
    check: async (identifier: string) => {
        const { success } = await limiter.limit(identifier)
        return success
    }
}
