import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

// Mock base64 encoding since we can't easily mock the internal btoa/atob edge functions
// vitest runs in jsdom which has atob
const createSessionToken = (payload: any) => {
    const base64Payload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `header.${base64Payload}.signature`
}

describe('Edge Middleware (proxy.ts) Auth Routing', () => {

    beforeEach(() => {
        vi.clearAllMocks()
    })

    const makeReq = (path: string, cookies: Record<string, string> = {}) => {
        const req = new NextRequest(new URL(`http://localhost${path}`))
        for (const [k, v] of Object.entries(cookies)) {
            req.cookies.set(k, v)
        }
        return req
    }

    it('allows public routes without authentication', async () => {
        const req = makeReq('/perform/setlist/123')
        const res = await proxy(req)

        // A "NextResponse.next()" has no headers by default and a 200 status in edge mock
        expect(res.headers.get('location')).toBeNull()
    })

    // F-022 — legal/marketing pages must be reachable without a session.
    // A2P SMS compliance specifically requires /sms-consent to be public so
    // carriers can audit the opt-in disclosure.
    it.each([
        '/privacy',
        '/terms',
        '/sms-consent',
        '/changelog',
    ])('allows legal/marketing page %s without authentication', async (path) => {
        const req = makeReq(path)
        const res = await proxy(req)

        expect(res.headers.get('location')).toBeNull()
    })

    it('redirects unauthenticated users to /login for secure routes', async () => {
        const req = makeReq('/setlists')
        const res = await proxy(req)

        expect(res.headers.get('location')).toBe('http://localhost/login')
    })

    // UNAUTH-001 — unauthenticated visitors to `/` land on /perform
    // (public gig-discovery surface) instead of the personalized
    // dashboard. Authed users keep landing on `/` as the dashboard.
    it('redirects unauthenticated visitors from / to /perform', async () => {
        const req = makeReq('/')
        const res = await proxy(req)

        expect(res.headers.get('location')).toBe('http://localhost/perform')
        // No-cache headers so a stale CDN copy can't re-trap the user
        expect(res.headers.get('cache-control')).toBe('no-store, must-revalidate, max-age=0')
    })

    it('does NOT redirect authenticated users from / — / remains the dashboard for signed-in users', async () => {
        const token = createSessionToken({ role: 'member', uid: 'u1' })
        const req = makeReq('/', { __session: token })
        const res = await proxy(req)

        expect(res.headers.get('location')).toBeNull()
    })

    it('does NOT block "pending" users without a verified companion cookie (relaxed gate)', async () => {
        // v4.3 P9-02 hotfix: without __session_role we can't trust the role
        // claim, so the middleware admits the request and lets page-level UX
        // handle truly-pending users. Prevents the newly-approved-musician
        // redirect loop (945478b rationale).
        const token = createSessionToken({ role: 'pending' })
        const req = makeReq('/setlists', { __session: token })
        const res = await proxy(req)

        expect(res.headers.get('location')).toBeNull()
    })

    it('does NOT block role-less users without a verified companion cookie (relaxed gate)', async () => {
        // A brand new user with no claims — still admitted; page-level UX
        // must show the waiting-for-approval state.
        const token = createSessionToken({ email: 'new@test.com' })
        const req = makeReq('/setlists', { __session: token })
        const res = await proxy(req)

        expect(res.headers.get('location')).toBeNull()
    })

    it('allows "member" users to access /library but blocks them from /admin', async () => {
        const token = createSessionToken({ role: 'member' })

        const reqLibrary = makeReq('/library', { __session: token })
        const resLibrary = await proxy(reqLibrary)
        expect(resLibrary.headers.get('location')).toBeNull() // Allowed

        // Use a leader route other than exactly '/admin' to avoid the redirect to '/manage' first
        const reqAdmin = makeReq('/manage/settings', { __session: token })
        const resAdmin = await proxy(reqAdmin)
        
        // The middleware rewrites to /unauthorized for leader routes.
        expect(resAdmin).toBeDefined()
        expect(resAdmin.headers.get('location')).toBeNull() 

        // In jsdom environment with Next.js polyfills, a NextResponse.rewrite() adds an x-middleware-rewrite header
        expect(resAdmin.headers.get('x-middleware-rewrite')).toBe('http://localhost/unauthorized')
    })

    // v4.3 P10-01 — the bounce-count cookie must use path:'/' so the
    // counter accumulates across different target paths. Without it,
    // the >3-bounce → /auth-error escape hatch never fires.
    // C5D-003 — per-request CSP nonce + strict-dynamic, no unsafe-eval.
    describe('CSP nonce + strict-dynamic (C5D-003)', () => {
        it('emits Content-Security-Policy on a public route', async () => {
            const req = makeReq('/perform/setlist/abc')
            const res = await proxy(req)
            const csp = res.headers.get('content-security-policy')
            expect(csp).toBeTruthy()
            expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/)
            expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/)
            expect(csp).not.toMatch(/'unsafe-eval'/)
        })

        it('emits CSP on unauthenticated-redirect responses', async () => {
            const req = makeReq('/setlists')
            const res = await proxy(req)
            // It's a redirect to /login
            expect(res.headers.get('location')).toBe('http://localhost/login')
            expect(res.headers.get('content-security-policy')).toBeTruthy()
        })

        it('emits a unique nonce on each request', async () => {
            const a = await proxy(makeReq('/perform/x'))
            const b = await proxy(makeReq('/perform/y'))
            const nonceA = (a.headers.get('content-security-policy') || '').match(/'nonce-([^']+)'/)?.[1]
            const nonceB = (b.headers.get('content-security-policy') || '').match(/'nonce-([^']+)'/)?.[1]
            expect(nonceA).toBeTruthy()
            expect(nonceB).toBeTruthy()
            expect(nonceA).not.toBe(nonceB)
        })

        it('emits CSP on rewrite responses (leader-route deny)', async () => {
            const token = createSessionToken({ role: 'member' })
            const req = makeReq('/manage/settings', { __session: token })
            const res = await proxy(req)
            expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/unauthorized')
            expect(res.headers.get('content-security-policy')).toBeTruthy()
        })
    })

    it('bounce counter accumulates across paths and trips /auth-error once >3', async () => {
        // Simulate a loop: unauthenticated user keeps getting bounced to /login.
        // Carry the cookie forward manually to mimic the browser. Threshold is
        // `bounceCount > 3`, so the 5th request (arriving with cookie=4) lands on /auth-error.
        let bounce = '0'
        const paths = ['/setlists', '/library', '/manage', '/setlists', '/library']
        let lastLocation: string | null = null
        for (let i = 0; i < paths.length; i++) {
            const req = makeReq(paths[i], { auth_bounce_count: bounce })
            const res = await proxy(req)
            lastLocation = res.headers.get('location')
            const setCookie = res.headers.get('set-cookie') || ''
            const match = setCookie.match(/auth_bounce_count=([^;]+)/)
            if (match) {
                bounce = match[1]
                // Every set-cookie must include Path=/ so the counter accumulates across paths
                expect(setCookie).toMatch(/Path=\//)
            }
        }
        expect(lastLocation).toBe('http://localhost/auth-error')
    })
})
