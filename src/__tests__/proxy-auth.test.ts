import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy, config } from '@/proxy'

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
        '/accessibility',
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

    // BUG-9 (run-2 §BUG-9) — /test-login is the headless test-account sign-in
    // harness; it must be reachable unauth so the page can consume its ?code.
    // Before the fix the proxy 307'd it to /login before code consumption.
    it('allows unauthenticated /test-login (so the page can consume ?code)', async () => {
        const req = makeReq('/test-login')
        const res = await proxy(req)
        expect(res.headers.get('location')).toBeNull()
    })

    it('allows unauthenticated /test-login?code=… (query does not change pathname)', async () => {
        const req = makeReq('/test-login?code=ABC123')
        const res = await proxy(req)
        expect(res.headers.get('location')).toBeNull()
    })

    // Negative — the allow-list entry is an EXACT match, not a prefix, so a
    // `/test-login-*` sibling stays gated (no over-broadening of public access).
    it('still gates a /test-login-* sibling (exact match, not prefix)', async () => {
        const req = makeReq('/test-login-elsewhere')
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

    // C5B-004 + C5D-010 — vestigial paths (`/v2/*`, `/account`,
    // `/manage/users`) must short-circuit to a clean 404 BEFORE the
    // unauth-redirect fires. Without this, an unauth probe to `/account`
    // 307s to `/login` and curl-follow lands on a 200 login-shell —
    // making a missing route look like a real page. Restores the cycle-3
    // b3 ratification (decisions.md 2026-05-18T00:20Z).
    it.each([
        '/account',
        '/manage/users',
        '/v2/library',
        '/v2/setlists',
        '/v2/random-junk',
    ])('does NOT redirect unauth vestigial path %s to /login', async (path) => {
        const req = makeReq(path)
        const res = await proxy(req)
        // Falls through to Next routing → 404 at not-found.tsx. We
        // assert by absence of a redirect; the 404 status comes from
        // the page resolver in the actual app, not the proxy.
        expect(res.headers.get('location')).toBeNull()
    })

    it.each([
        '/account',
        '/manage/users',
        '/v2/library',
    ])('does NOT redirect authed vestigial path %s either', async (path) => {
        const token = createSessionToken({ role: 'member', uid: 'u1' })
        const req = makeReq(path, { __session: token })
        const res = await proxy(req)
        // Authed users used to hit a Next 404 (working-as-intended per
        // b3); this stays the same. No leader-route rewrite to
        // /unauthorized for /manage/users (which lives under `/manage/`
        // prefix and would otherwise route through `isLeaderRoute`).
        expect(res.headers.get('location')).toBeNull()
        expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    })

    // Bare `/v2` is the shipped beta landing — NOT vestigial — and stays
    // on the standard auth-gated track (unauth → /login). This guards
    // against the matcher accidentally treating the real page as
    // vestigial. If the v2 landing is ever made public, this expectation
    // changes here AND `/v2` needs adding to `publicExactRoutes`.
    it('does redirect unauth /v2 (real beta landing) to /login', async () => {
        const req = makeReq('/v2')
        const res = await proxy(req)
        expect(res.headers.get('location')).toBe('http://localhost/login')
    })

    // Negative: a real `/manage` child (e.g. `/manage/templates`) is
    // NOT vestigial — the leader-route gate should still apply.
    it('preserves leader-route gating for non-vestigial /manage/* children', async () => {
        const token = createSessionToken({ role: 'member', uid: 'u1' })
        const req = makeReq('/manage/templates', { __session: token })
        const res = await proxy(req)
        expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/unauthorized')
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

    // BUG-6 (run-2 §BUG-6) — the broslaz PWA manifest (/manifest-brotherslazaroff.json,
    // emitted per-org by layout.tsx) was being served the HTML app shell: the
    // proxy `config.matcher` excluded only `manifest.json`, so the org-suffixed
    // variant ran the proxy → unauth landing 307'd to /login → PWA install broke.
    // The fix widens the matcher token to `manifest(?:-[a-z0-9-]+)?\.json`. These
    // tests assert on the matcher REGEX directly (not proxy() behavior): the
    // matcher is what decides whether the proxy runs on a path at all, and a path
    // that does NOT match is served as a static public/ file, bypassing proxy().
    describe('PWA manifest matcher exclusion (BUG-6)', () => {
        const matchRe = new RegExp(`^${config.matcher[0]}$`)

        it('excludes /manifest.json (CRC — unchanged) from the proxy matcher', () => {
            expect(matchRe.test('/manifest.json')).toBe(false)
        })

        it('excludes /manifest-brotherslazaroff.json (org-suffixed) — the BUG-6 fix', () => {
            expect(matchRe.test('/manifest-brotherslazaroff.json')).toBe(false)
        })

        it('excludes a generic future /manifest-<org>.json variant', () => {
            expect(matchRe.test('/manifest-someotherorg.json')).toBe(false)
        })

        it.each([
            '/perform',
            '/perform/setlist/abc123',
            '/setlists',
            '/login',
        ])('still MATCHES the app route %s (proxy must run)', (path) => {
            expect(matchRe.test(path)).toBe(true)
        })
    })
})
