import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Upstash so it uses the in-memory fallback
vi.mock('@upstash/ratelimit', () => ({
    Ratelimit: vi.fn()
}))
vi.mock('@upstash/redis', () => ({
    Redis: vi.fn()
}))

const originalEnv = { ...process.env }

function mockReq(userId: string): NextRequest {
    return new NextRequest('http://localhost:3000/api/test', {
        headers: { 'x-forwarded-for': userId }
    })
}

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
        const { checkRateLimit } = await import('./rate-limit')
        const result = await checkRateLimit(mockReq('test-user-1'), 'api')
        expect(result).toBeNull() // null = not limited
    })

    it('allows multiple requests from different IPs', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 10; i++) {
            const result = await checkRateLimit(mockReq(`192.168.1.${i}`), 'api')
            expect(result).toBeNull()
        }
    })

    it('blocks requests after api tier limit (60/min)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.99'
        for (let i = 0; i < 60; i++) {
            await checkRateLimit(mockReq(ip), 'api')
        }
        const result = await checkRateLimit(mockReq(ip), 'api')
        expect(result).not.toBeNull()
        expect(result?.status).toBe(429)
    })

    it('blocks requests after bridgeSetup tier limit (5/min)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.77'
        for (let i = 0; i < 5; i++) {
            const ok = await checkRateLimit(mockReq(ip), 'bridgeSetup')
            expect(ok).toBeNull()
        }
        const result = await checkRateLimit(mockReq(ip), 'bridgeSetup')
        expect(result).not.toBeNull()
        expect(result?.status).toBe(429)
    })

    it('returns proper 429 response with headers', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.100'
        for (let i = 0; i < 60; i++) {
            await checkRateLimit(mockReq(ip), 'api')
        }
        const result = await checkRateLimit(mockReq(ip), 'api')
        expect(result?.headers.get('Retry-After')).toBe('60')
        expect(result?.headers.get('X-RateLimit-Remaining')).toBe('0')
    })

    it('checkUserRateLimit bypasses limit entirely when opts.bypass=true (admin)', async () => {
        const { checkUserRateLimit } = await import('./rate-limit')
        // 10/min upload — sail past it as a trusted leader.
        for (let i = 0; i < 50; i++) {
            const result = await checkUserRateLimit('admin-uid', 'upload', {
                bypass: true,
            })
            expect(result).toBeNull()
        }
    })

    it('checkUserRateLimit bypass applies equally to band_leaders', async () => {
        // Caller (e.g. library-upload.ts) computes bypass = admin || band_leader.
        // The fn doesn't know who you are; it just sees `bypass: true`. This
        // test documents the band_leader use case is covered by the same opt.
        const { checkUserRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 50; i++) {
            const result = await checkUserRateLimit('band-leader-uid', 'upload', {
                bypass: true,
            })
            expect(result).toBeNull()
        }
    })

    it('checkUserRateLimit still limits callers without bypass', async () => {
        const { checkUserRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 10; i++) {
            const ok = await checkUserRateLimit('non-leader-uid', 'upload')
            expect(ok).toBeNull()
        }
        const limited = await checkUserRateLimit('non-leader-uid', 'upload')
        expect(limited).not.toBeNull()
        expect(limited?.error).toContain('Too many requests')
    })
})
