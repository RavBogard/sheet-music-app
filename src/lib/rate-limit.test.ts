import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Mock Upstash so it uses the in-memory fallback
vi.mock('@upstash/ratelimit', () => ({
    Ratelimit: vi.fn()
}))
vi.mock('@upstash/redis', () => ({
    Redis: vi.fn()
}))
vi.mock('@/lib/env', () => ({
    env: {}
}))

// Clear process.env to force in-memory fallback
const originalEnv = { ...process.env }

describe('rate-limit', () => {
    beforeEach(() => {
        delete process.env.UPSTASH_REDIS_REST_URL
        delete process.env.UPSTASH_REDIS_REST_TOKEN
        vi.resetModules()
    })

    afterAll(() => {
        Object.assign(process.env, originalEnv)
    })

    it('allows requests under the limit', async () => {
        const { globalLimiter } = await import('./rate-limit')
        const result = await globalLimiter.check('test-user-1')
        expect(result).toBe(true)
    })

    it('allows multiple requests from different identifiers', async () => {
        const { globalLimiter } = await import('./rate-limit')
        for (let i = 0; i < 10; i++) {
            const result = await globalLimiter.check(`user-${i}`)
            expect(result).toBe(true)
        }
    })

    it('allows up to 50 requests from same identifier', async () => {
        const { globalLimiter } = await import('./rate-limit')
        const id = 'burst-test-user'
        let allowed = 0
        for (let i = 0; i < 55; i++) {
            const result = await globalLimiter.check(id)
            if (result) allowed++
        }
        // Should allow exactly 50 (the configured limit)
        expect(allowed).toBe(50)
    })

    it('blocks requests after limit is exceeded', async () => {
        const { globalLimiter } = await import('./rate-limit')
        const id = 'limit-test-user'
        // Exhaust the limit
        for (let i = 0; i < 50; i++) {
            await globalLimiter.check(id)
        }
        // Next should be blocked
        const result = await globalLimiter.check(id)
        expect(result).toBe(false)
    })
})
