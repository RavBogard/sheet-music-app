import { afterEach, describe, expect, it, vi } from "vitest"

import {
    BoundedPublicReaderLimiter,
    checkPublicReaderRateLimit,
} from "@/lib/reader-public-rate-limit"

describe("dedicated public-reader limiter", () => {
    afterEach(() => vi.unstubAllEnvs())

    it("has bounded fallback state and denies a new identity when capacity is full", async () => {
        let now = 1_000
        const limiter = new BoundedPublicReaderLimiter(2, 60_000, 2, () => now)
        await expect(limiter.limit("a")).resolves.toMatchObject({ success: true })
        await expect(limiter.limit("b")).resolves.toMatchObject({ success: true })
        await expect(limiter.limit("c")).resolves.toMatchObject({ success: false })
        await expect(limiter.limit("a")).resolves.toMatchObject({ success: true })
        await expect(limiter.limit("a")).resolves.toMatchObject({ success: false })

        now += 60_001
        await expect(limiter.limit("c")).resolves.toMatchObject({ success: true })
    })

    it("requires both a distributed store and Vercel-set IP in production", async () => {
        vi.stubEnv("NODE_ENV", "production")
        vi.stubEnv("VERCEL", "1")
        vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
        vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")

        await expect(
            checkPublicReaderRateLimit(
                new Request("https://example.test", {
                    headers: { "x-vercel-forwarded-for": "203.0.113.7" },
                }),
                "chart",
            ),
        ).resolves.toEqual({ allowed: false, status: 503 })

        await expect(
            checkPublicReaderRateLimit(
                new Request("https://example.test", {
                    headers: { "x-forwarded-for": "203.0.113.7" },
                }),
                "chart",
            ),
        ).resolves.toEqual({ allowed: false, status: 503 })
    })
})
