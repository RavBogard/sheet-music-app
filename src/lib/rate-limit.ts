export class RateLimiter {
    private tokens: Map<string, number>
    private timestamps: Map<string, number>
    private readonly limit: number
    private readonly interval: number

    constructor(limit: number, interval: number) {
        this.tokens = new Map()
        this.timestamps = new Map()
        this.limit = limit
        this.interval = interval
    }

    check(key: string): boolean {
        const now = Date.now()
        const lastRefill = this.timestamps.get(key) || 0
        const tokens = this.tokens.get(key) ?? this.limit

        // Calculate refill
        const timePassed = now - lastRefill
        const refill = Math.floor(timePassed / this.interval) * this.limit

        const newTokens = Math.min(this.limit, tokens + refill)

        if (newTokens > 0) {
            this.tokens.set(key, newTokens - 1)
            this.timestamps.set(key, now)
            return true
        }

        return false
    }
}

// Global instance for simple in-memory limiting
export const globalLimiter = new RateLimiter(50, 60 * 1000) // 50 requests per minute per IP
