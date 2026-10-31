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
        delete process.env.KV_REST_API_URL
        delete process.env.KV_REST_API_TOKEN
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

    it('chart tier does NOT block a NATed fleet past 60 from one IP', async () => {
        // The /api/drive/file route uses the `chart` tier (600/min) so the ~6
        // band iPads behind ONE synagogue NAT (one shared IP) don't starve on
        // the 60/min `api` budget — the launch finding this lane fixes. 100
        // chart fetches from a single IP must all pass (the `api` tier would
        // have 429'd at 61).
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.42'
        for (let i = 0; i < 100; i++) {
            const result = await checkRateLimit(mockReq(ip), 'chart')
            expect(result).toBeNull()
        }
    })

    it('chart tier ceiling is a real 1000/min (not unlimited)', async () => {
        // Generous but bounded so a scraper can't hammer origin past the CDN.
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.43'
        for (let i = 0; i < 1000; i++) {
            const ok = await checkRateLimit(mockReq(ip), 'chart')
            expect(ok).toBeNull()
        }
        const result = await checkRateLimit(mockReq(ip), 'chart')
        expect(result).not.toBeNull()
        expect(result?.status).toBe(429)
        expect(result?.headers.get('X-RateLimit-Limit')).toBe('1000')
    })

    // F-6 (run-2 §F-6) — `/api/auth/qr` (POST/GET/PUT) + `/api/web-vitals` moved
    // from the 60/min `api` tier to the generous `telemetry` tier (300/min). A
    // venue's ~6 iPads behind ONE NAT IP fire QR polls (~30/min/device) + ≤5
    // web-vitals beacons/load → ~216/min combined cold peak on a single shared IP
    // bucket → 429 on the old `api` tier. Mirrors the `chart`-tier NAT rationale.
    it('telemetry tier does NOT block a NATed fleet past 60 from one IP (F-6)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.216'
        // 216 = the computed 6-iPad combined cold peak; the `api` tier would have
        // 429'd at 61. All must pass on the telemetry tier.
        for (let i = 0; i < 216; i++) {
            const result = await checkRateLimit(mockReq(ip), 'telemetry')
            expect(result).toBeNull()
        }
    })

    it('telemetry tier ceiling is a real 300/min (not unlimited) (F-6)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.217'
        for (let i = 0; i < 300; i++) {
            const ok = await checkRateLimit(mockReq(ip), 'telemetry')
            expect(ok).toBeNull()
        }
        const result = await checkRateLimit(mockReq(ip), 'telemetry')
        expect(result).not.toBeNull()
        expect(result?.status).toBe(429)
        expect(result?.headers.get('X-RateLimit-Limit')).toBe('300')
    })

    it('telemetry and api tiers are independent buckets — exhausting one does not 429 the other (F-6 / no-regress)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.0.0.218'
        // Exhaust the api tier (60/min) from this IP.
        for (let i = 0; i < 60; i++) await checkRateLimit(mockReq(ip), 'api')
        const apiLimited = await checkRateLimit(mockReq(ip), 'api')
        expect(apiLimited?.status).toBe(429)
        // Same IP on the telemetry tier is a distinct bucket — still allowed.
        const telemetryOk = await checkRateLimit(mockReq(ip), 'telemetry')
        expect(telemetryOk).toBeNull()
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


// ── Keying: only a VERIFIED identity gets its own bucket ──
//
// The Admin SDK and the MCP bearer check are mocked: a token verifies iff it
// is in `validIdTokens` / `validBearers`.
const h = vi.hoisted(() => {
    const validIdTokens = new Map<string, { uid: string; exp: number }>()
    const validBearers = new Map<string, string>()
    return {
        validIdTokens,
        validBearers,
        verifyIdToken: vi.fn(async (t: string): Promise<
            { status: 'valid'; uid: string; exp: number } | { status: 'invalid' } | { status: 'error' }
        > => {
            const hit = validIdTokens.get(t)
            return hit ? { status: 'valid', ...hit } : { status: 'invalid' }
        }),
        verifyBearer: vi.fn(async (req: Request) => {
            const uid = validBearers.get(req.headers.get('authorization')?.slice(7) ?? '')
            return uid
                ? { uid, tokenId: 't', parentTokenId: null, orgId: 'crc', kind: null, allowedTools: null }
                : new Response('Unauthorized', { status: 401 })
        }),
    }
})
vi.mock('@/lib/firebase-admin', () => ({ verifyIdTokenVerdict: h.verifyIdToken }))
vi.mock('@/lib/mcp/auth', () => ({ verifyBearer: h.verifyBearer }))

describe('rate-limit: keyed on verified identity only', () => {
    beforeEach(() => {
        delete process.env.UPSTASH_REDIS_REST_URL
        delete process.env.UPSTASH_REDIS_REST_TOKEN
        delete process.env.KV_REST_API_URL
        delete process.env.KV_REST_API_TOKEN
        vi.resetModules()
        h.validIdTokens.clear()
        h.validBearers.clear()
        h.verifyIdToken.mockClear()
        h.verifyBearer.mockClear()
    })

    const inAnHour = () => Math.floor(Date.now() / 1000) + 3600
    const jwtWithSub = (sub: string) =>
        `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`
    const req = (ip: string, bearer?: string, path = '/api/test') =>
        new NextRequest(`http://localhost:3000${path}`, {
            headers: bearer
                ? { 'x-forwarded-for': ip, Authorization: `Bearer ${bearer}` }
                : { 'x-forwarded-for': ip },
        })
    const TIERS = {
        api: 60, upload: 10, sync: 3, ai: 20, bridgeSetup: 5,
        chart: 1000, telemetry: 300, printAnon: 15, perform: 300,
    } as const

    for (const [tier, max] of Object.entries(TIERS)) {
        it(`a forged token cannot get a fresh ${tier} bucket per request`, async () => {
            const { checkRateLimit } = await import('./rate-limit')
            const ip = `9.9.${tier.length}.${max % 250}`
            let limited = false
            for (let i = 0; i <= max; i++) {
                const r = await checkRateLimit(req(ip, jwtWithSub(`fake-${i}`)), tier as never)
                if (r) limited = true
            }
            expect(limited).toBe(true)
        })
    }

    it('a forged MCP bearer cannot get a fresh bucket per request', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        let limited = false
        for (let i = 0; i <= 60; i++) {
            if (await checkRateLimit(req('9.8.7.6', `crl_live_forged${i}`), 'api')) limited = true
        }
        expect(limited).toBe(true)
    })

    it('a verified Firebase user is keyed by uid, not by the shared IP', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '10.1.1.1'
        for (let i = 0; i < 60; i++) await checkRateLimit(req(ip), 'api')
        expect((await checkRateLimit(req(ip), 'api'))?.status).toBe(429)
        // A verified user on the same IP has their own bucket...
        h.validIdTokens.set('a.b.c', { uid: 'musician-1', exp: inAnHour() })
        expect(await checkRateLimit(req(ip, 'a.b.c'), 'api')).toBeNull()
        // ...and it follows the uid across IPs.
        for (let i = 0; i < 59; i++) await checkRateLimit(req(`10.2.0.${i}`, 'a.b.c'), 'api')
        expect((await checkRateLimit(req('10.3.3.3', 'a.b.c'), 'api'))?.status).toBe(429)
        // Verified once, then cached by token hash.
        expect(h.verifyIdToken).toHaveBeenCalledTimes(1)
    })

    it('reuses the uid a route already verified, with no second verification', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const { noteRateLimitIdentity } = await import('./rate-limit-identity')
        const r = req('10.4.4.4', 'x.y.z')
        noteRateLimitIdentity(r, 'leader-1')
        for (let i = 0; i < 10; i++) await checkRateLimit(r, 'upload')
        expect((await checkRateLimit(r, 'upload'))?.status).toBe(429)
        // Another caller on the same IP is unaffected.
        expect(await checkRateLimit(req('10.4.4.4'), 'upload')).toBeNull()
        expect(h.verifyIdToken).not.toHaveBeenCalled()
    })

    it('a token the route found invalid falls back to the IP key', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        const { noteRateLimitIdentity } = await import('./rate-limit-identity')
        const ip = '10.5.5.5'
        for (let i = 0; i < 5; i++) {
            const r = req(ip, jwtWithSub(`fake-${i}`))
            noteRateLimitIdentity(r, null)
            expect(await checkRateLimit(r, 'bridgeSetup')).toBeNull()
        }
        expect((await checkRateLimit(req(ip), 'bridgeSetup'))?.status).toBe(429)
        expect(h.verifyIdToken).not.toHaveBeenCalled()
    })

    it('a verified MCP bearer is keyed by its uid', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        h.validBearers.set('crl_live_good', 'daniel')
        const ip = '10.6.6.6'
        for (let i = 0; i < 60; i++) await checkRateLimit(req(ip), 'api')
        expect(await checkRateLimit(req(ip, 'crl_live_good'), 'api')).toBeNull()
    })

    it('telemetry stays IP-keyed even for a verified user', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        h.validIdTokens.set('t.o.k', { uid: 'u-tel', exp: inAnHour() })
        const ip = '10.7.7.7'
        for (let i = 0; i < 300; i++) await checkRateLimit(req(ip), 'telemetry')
        expect((await checkRateLimit(req(ip, 't.o.k'), 'telemetry'))?.status).toBe(429)
        expect(h.verifyIdToken).not.toHaveBeenCalled()
    })

    it('a flood of garbage JWTs from one IP stops being verified after the pre-limit (3x tier)', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 400; i++) await checkRateLimit(req('9.7.7.7', jwtWithSub(`junk-${i}`)), 'api')
        expect(h.verifyIdToken).toHaveBeenCalledTimes(180)
        // Another IP is unaffected.
        await checkRateLimit(req('9.7.7.8', jwtWithSub('other')), 'api')
        expect(h.verifyIdToken).toHaveBeenCalledTimes(181)
    })

    it('a flood of random MCP bearers from one IP stops costing lookups after the pre-limit', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 100; i++) await checkRateLimit(req('9.6.6.6', `crl_live_rand${i}`), 'upload')
        expect(h.verifyBearer).toHaveBeenCalledTimes(30)
    })

    it('a transient verification error is not cached; the request keys on IP', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        h.validIdTokens.set('g.o.d', { uid: 'flaky-user', exp: inAnHour() })
        h.verifyIdToken.mockResolvedValueOnce({ status: 'error' })
        const ip = '10.9.9.9'
        for (let i = 0; i < 59; i++) await checkRateLimit(req(ip), 'api')
        // Transient failure: counted on the IP bucket (60th).
        expect(await checkRateLimit(req(ip, 'g.o.d'), 'api')).toBeNull()
        expect((await checkRateLimit(req(ip), 'api'))?.status).toBe(429)
        // Next request verifies again (not cached as invalid) and gets the uid bucket.
        expect(await checkRateLimit(req(ip, 'g.o.d'), 'api')).toBeNull()
        expect(h.verifyIdToken).toHaveBeenCalledTimes(2)
    })

    it('anonymous callers are keyed by IP', async () => {
        const { checkRateLimit } = await import('./rate-limit')
        for (let i = 0; i < 60; i++) await checkRateLimit(req('10.8.8.8'), 'api')
        expect((await checkRateLimit(req('10.8.8.8'), 'api'))?.status).toBe(429)
        expect(await checkRateLimit(req('10.8.8.9'), 'api')).toBeNull()
    })

    it('a service on one shul IP: 10 anonymous iPads stay under the Perform tiers', async () => {
        // Worst minute modelled: every iPad opens Perform at once (one tracks
        // read), then a WiFi blip fires `online` + `visibilitychange` retries
        // (two more each), while pre-caching a 40-row setlist with one retry
        // per chart. One IP bucket, all anonymous.
        const { checkRateLimit } = await import('./rate-limit')
        const ip = '203.0.113.10'
        for (let pad = 0; pad < 10; pad++) {
            for (let k = 0; k < 3; k++) {
                expect(await checkRateLimit(req(ip, undefined, '/api/setlists/s1/tracks'), 'perform')).toBeNull()
            }
            for (let c = 0; c < 40 * 2; c++) {
                expect(await checkRateLimit(req(ip, undefined, `/api/drive/file/f${c}`), 'chart')).toBeNull()
            }
        }
    })
})
