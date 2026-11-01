import { VIEW_AS_COOKIE, VIEW_AS_PARAM } from '@/lib/org/view-as'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_ROLE_COOKIE, verifyRoleCookie } from '@/lib/session-role'
import { httpError } from '@/lib/http/error-envelope'
import { resolveRequestOrg } from '@/lib/org/host-resolution'
import { getHostList } from '@/lib/org/host-list-client'
import { noSuchSiteResponse, startingUpResponse } from '@/lib/org/no-such-site'
import { tenantRoleFromClaims } from '@/lib/org/membership-types'

// Base64Url decode for Edge Runtime without Buffer
function decodeJwtPayload(token: string) {
    try {
        const payload = token.split('.')[1]
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        )
        return JSON.parse(jsonPayload)
    } catch (e) {
        return null
    }
}

// C5D-003: per-request nonce for script-src. 16 random bytes, base64.
// Edge-runtime safe (no Buffer); pairs with `'strict-dynamic'` in the CSP
// so nonced inline scripts are allowed to load any descendant scripts
// (e.g. Next.js bootstrap → Firebase / Sentry chunks).
function generateNonce(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
}

function buildCsp(nonce: string): string {
    // The fallback `'self' 'unsafe-inline' https://apis.google.com` is for
    // CSP1/2 browsers without strict-dynamic support — modern browsers
    // (CSP3) ignore these when a nonce is present. Per Next.js + MDN docs.
    // `'unsafe-eval'` is intentionally NOT in the policy: production Next.js
    // builds do not require it.
    return [
        `default-src 'self'`,
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https://apis.google.com`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        `font-src 'self' https://fonts.gstatic.com`,
        // `https://www.google.com` is required for Firestore's WebChannel
        // long-poll transport, which beacons a 1x1 `www.google.com/cleardot.gif`
        // <img>; blocking it surfaces on WebKit/Safari long-polling networks
        // (camp/flaky wifi) as Listen-channel errors and setlist rows that
        // never hydrate. Exact host (not a wildcard) to keep the policy tight. (WS-02)
        `img-src 'self' data: blob: https://*.googleapis.com https://*.firebasestorage.app https://*.googleusercontent.com https://www.google.com`,
        `connect-src 'self' blob: https://*.googleapis.com https://apis.google.com https://accounts.google.com https://*.googleusercontent.com https://*.firebaseio.com https://*.firebasestorage.app https://firestore.googleapis.com wss://*.firebaseio.com https://generativelanguage.googleapis.com https://*.ingest.sentry.io https://*.sentry.io https://www.hebcal.com`,
        `frame-src 'self' https://accounts.google.com https://*.firebaseapp.com`,
        `worker-src 'self' blob:`,
        `manifest-src 'self'`,
        `media-src 'self' blob: https://*.firebasestorage.app`,
        `base-uri 'self'`,
        `form-action 'self'`,
    ].join('; ')
}

// Exact-match public routes.
// Legal/marketing pages (privacy/terms/sms-consent/changelog) MUST stay
// public — A2P SMS carrier review needs to fetch /sms-consent without a
// session to audit the opt-in disclosure.
const publicExactRoutes = [
    '/login',
    '/',
    '/auth-error',
    '/privacy',
    '/terms',
    '/sms-consent',
    '/changelog',
    '/accessibility',
    // The in-app Help guides (CRC only: the route layout 404s other tenants). Nothing
    // secret is in them, and a musician on a signed-out iPad needs them. Exact
    // routes, not a prefix, so a sibling such as /helpdesk stays gated.
    '/help',
    '/help/michael',
    '/help/drew',
    '/help/before',
    '/help/after',
    // Per-tenant PWA manifest for tenants created through config (crc/BL use static files).
    '/site.webmanifest',
    // /test-login — headless test-account sign-in harness. Pre-auth like /login
    // and /qr: it consumes a single-use `?code` and signs in via Firebase custom
    // token; the capability is the code, not the path. EXACT match (not a prefix)
    // so `/test-login-*` siblings stay gated. Without this, an unauth visit 307s
    // to /login before the page can read ?code. (BUG-9, run-2 §BUG-9.)
    '/test-login',
    // The app icon, Apple touch icon and share cards (re-audit P3 #12). They
    // are generated per tenant from the x-org-id this proxy sets, so they stay
    // inside the matcher, but a signed-out browser must get the image, not a
    // 307 to /login (it fell back to favicon.ico).
    '/icon',
    '/apple-icon',
    '/opengraph-image',
    '/twitter-image',
]

// Prefix-match public routes — these serve public/unauthenticated content
// /perform/*     — musicians view shared setlists (may not be signed in)
// /qr/*          — QR code sign-in flow (used *before* having a session)
// /.well-known/* — OAuth discovery metadata; Claude Desktop/web fetch these
//                  unauthenticated to find the MCP authorization server
// /invite/*      — tenant invitation links (multi-tenant phase 4): the page
//                  signs the person in itself, like /qr
// /listen/*      — a setlist's recordings, read-only; recordings are public
//                  (Daniel 2026-11-01), so no sign-in. Never linked from Perform.
const publicPrefixes = ['/perform', '/qr', '/.well-known', '/invite', '/listen/']

// Vestigial paths — these used to be the catch-all defaults the proxy
// matcher couldn't avoid, and Next.js answered them with either a 307→/login
// (unauth) or a 404 (authed). Cycle-3 b3 ratified that the right answer
// for both is a clean 404 (decisions.md 2026-05-18T00:20Z): nothing in
// src/** links to them, and bouncing unauth probes to /login is misleading.
//
// We short-circuit them here BEFORE the auth-redirect so unauth visits
// don't get sent to /login.
const vestigialExactRoutes = ['/account', '/manage/users']

function isVestigialPath(pathname: string): boolean {
    if (vestigialExactRoutes.includes(pathname)) return true
    return false
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('__session')?.value
    const decodedSession = session ? decodeJwtPayload(session) : null
    const roleCookie = request.cookies.get(SESSION_ROLE_COOKIE)?.value
    const ua = request.headers.get('user-agent') || ''

    // Multi-tenant phase 3: resolve the request host to a tenant FIRST, before
    // any other short-circuit. Order (src/lib/org/host-resolution.ts): the
    // compiled CRC/BL map → the project's own Vercel URLs (crc) → the address
    // list (/api/org-hosts, memoised 60 s, ≤1.5 s wait, last good list kept on
    // failure) → not production (preview / localhost → crc) → "no such site".
    // An unknown or suspended production address never falls back to CRC;
    // only server-to-server paths with their own secret (cron, webhooks,
    // inngest, intake, bridge redemption) keep resolving to crc there.
    const resolution = await resolveRequestOrg(
        {
            host: request.headers.get('host') ?? request.nextUrl.hostname,
            pathname,
            vercelEnv: process.env.VERCEL_ENV,
        },
        () => getHostList(request.nextUrl.origin),
    )
    if (resolution.orgId === null) {
        return resolution.via === 'list-unavailable'
            ? startingUpResponse(pathname, request.method)
            : noSuchSiteResponse(pathname, request.method)
    }
    const orgId = resolution.orgId

    // Cycle-5 C5B-017 — `/login` is a Next.js page (GET-only). A POST
    // hits Next's default 405 with an empty body and no `Allow` header,
    // which is hostile to programmatic callers probing for a sign-in
    // endpoint. Intercept any non-GET (`POST/PUT/PATCH/DELETE`) to
    // `/login` here and return a rich JSON envelope pointing at the
    // actual programmatic-signin route (`/api/auth/test-session`).
    // `HEAD` falls through so health probes keep working unchanged.
    // Fires BEFORE the nonce/CSP machinery — the 405 body is JSON, not
    // HTML, so it never renders inline scripts that would need a CSP
    // nonce; sibling lane C5D-003's `Content-Security-Policy` header is
    // intentionally omitted on this short-circuit.
    if (pathname === '/login' && request.method !== 'GET' && request.method !== 'HEAD') {
        return httpError(
            405,
            'method_not_allowed',
            'Use POST /api/auth/test-session for programmatic sign-in.',
            { errorCode: 405, path: '/login', method: request.method },
            'GET /login renders the interactive sign-in page; non-GET methods are not supported.',
            { Allow: 'GET, HEAD' },
        )
    }

    // C5D-003: generate per-request nonce + CSP up front. The nonce is
    // forwarded as an `x-nonce` REQUEST header so RSC layouts can read it
    // via `headers().get('x-nonce')` and apply it to inline scripts
    // (next-themes, Sentry shim, etc.). The CSP itself is attached as a
    // RESPONSE header before every return.
    const nonce = generateNonce()
    const cspHeader = buildCsp(nonce)
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)

    // v11-03-01: forward the tenant resolved above as `x-org-id` (same
    // RSC-readable request-header seam as the nonce). The unconditional
    // `.set()` overwrites any client-supplied `x-org-id` copied by
    // `new Headers(request.headers)` — the proxy is the only setter.
    // Placed before every passthrough/rewrite return so all routes carry it.
    requestHeaders.set('x-org-id', orgId)

    const isPublicRoute =
        publicExactRoutes.includes(pathname) ||
        publicPrefixes.some(p => pathname.startsWith(p))
    const isApiRoute = pathname.startsWith('/api')
    const isLeaderRoute = pathname.startsWith('/admin') || pathname.startsWith('/manage')

    // Attach CSP + Permissions-Policy boundary headers to any response we
    // return. (HSTS / COOP / X-Frame-Options / Referrer-Policy /
    // X-Content-Type-Options are still set statically in next.config.ts.)
    const withSecurityHeaders = (response: NextResponse) => {
        response.headers.set('Content-Security-Policy', cspHeader)
        return response
    }

    const nextWithHeaders = () =>
        withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))

    const rewriteWithHeaders = (url: URL) =>
        withSecurityHeaders(NextResponse.rewrite(url, { request: { headers: requestHeaders } }))

    // The Help guides are CRC's (its studio PC, its people). Any other tenant gets a real 404
    // here: the (main) group streams behind loading.tsx, so the help layout's notFound() alone
    // answered 200 and still carried the guide's RSC payload.
    if (orgId !== 'crc' && (pathname === '/help' || pathname.startsWith('/help/'))) {
        return withSecurityHeaders(new NextResponse('Not found', {
            status: 404,
            headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
        }))
    }

    // Multi-tenant phase 4: ?viewAs=1 / ?viewAs=0 switch the platform owner's
    // read-only "View as this tenant" mode on this address (host-only cookie).
    const viewAsParam = request.nextUrl.searchParams.get(VIEW_AS_PARAM)
    if (viewAsParam === '1' || viewAsParam === '0') {
        const clean = request.nextUrl.clone()
        clean.searchParams.delete(VIEW_AS_PARAM)
        const res = withSecurityHeaders(NextResponse.redirect(clean))
        if (viewAsParam === '1') res.cookies.set(VIEW_AS_COOKIE, '1', { path: '/', sameSite: 'lax', secure: true })
        else res.cookies.set(VIEW_AS_COOKIE, '', { path: '/', maxAge: 0 })
        return res
    }

    // Allow social media crawlers through so they can read OG meta tags.
    // These bots only fetch HTML <head> for link previews — no security risk.
    const isSocialCrawler = /facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot/i.test(ua)
    if (isSocialCrawler) {
        return nextWithHeaders()
    }

    // We do not want to block API routes here; let them handle their own auth.
    // CSP still attached so any API route that renders HTML (none today)
    // inherits the policy.
    if (isApiRoute) {
        return nextWithHeaders()
    }

    // Vestigial paths → clean 404 BEFORE any auth-redirect fires. See the
    // `vestigialExactRoutes` / `vestigialPrefixes` lists above and the
    // cycle-3 b3 ratification at .coord/shared/decisions.md
    // (2026-05-18T00:20Z). Returning a passthrough lets Next's app-router
    // resolve the path — since no page exists, Next renders not-found.tsx
    // with HTTP 404. Without this short-circuit, the unauth-redirect
    // below would 307→/login (which then renders 200), making the
    // request look like a real login-shell page instead of a missing
    // route. `nextWithHeaders()` preserves the per-request CSP nonce so
    // the rendered not-found.tsx inherits the same security boundary as
    // any normal route.
    if (isVestigialPath(pathname)) {
        return nextWithHeaders()
    }

    // Helper to create a redirect with cache-busting headers
    const createNoCacheRedirect = (url: URL) => {
        const response = NextResponse.redirect(url)
        response.headers.set('Cache-Control', 'no-store, must-revalidate, max-age=0')
        return withSecurityHeaders(response)
    }

    // Redirect Loop Detection
    // Track how many auth-related redirects happen in a short time
    const detectRedirectLoop = (targetPath: string) => {
        const bounceCountValue = request.cookies.get('auth_bounce_count')?.value || '0'
        const bounceCount = parseInt(bounceCountValue, 10)

        if (bounceCount > 3) {
            // Loop detected! Send to fallback page and clear the bounce cookie
            const fallbackUrl = new URL('/auth-error', request.url)
            const response = createNoCacheRedirect(fallbackUrl)
            response.cookies.set('auth_bounce_count', '', { maxAge: 0, path: '/' })
            return response
        }

        // Increment bounce count and set a short expiry (10 seconds).
        // path:'/' is critical — without it the cookie defaults to the
        // current request path so the counter can't accumulate across
        // /setlists→/login→/manage bounces and the escape hatch never
        // fires. (v4.3 P10-01.)
        const response = createNoCacheRedirect(new URL(targetPath, request.url))
        response.cookies.set('auth_bounce_count', (bounceCount + 1).toString(), {
            maxAge: 10,
            path: '/',
        })
        return response
    }

    // UNAUTH-001: unauthenticated visits to `/` land on the public gig
    // discovery view (`/perform`) instead of the personalized dashboard.
    // The dashboard is authored for signed-in members; for a band member
    // tapping a setlist link, `/perform` is the discoverable surface.
    if (!session && pathname === '/') {
        return createNoCacheRedirect(new URL('/perform', request.url))
    }

    if (!session && !isPublicRoute) {
        // User is not logged in but trying to access a secure page -> send to login
        return detectRedirectLoop('/login')
    }

    if (session && pathname === '/login') {
        // User is logged in but going to the login page -> send to dashboard
        return detectRedirectLoop('/setlists')
    }

    // Role Verification — prefer the server-signed companion cookie
    // (__session_role) when present and matching the Firebase session
    // uid; otherwise fall back to whatever role claim the Firebase
    // session carries. See v4.3 P9-02.
    if (session && !isPublicRoute) {
        // Multi-tenant P2: the role is the one held in THIS host's tenant.
        // Session claims: po → admin; an `m` map → m[orgId]; no `m` (pre-P2
        // token) → the legacy role claim, unchanged. A companion cookie is
        // trusted only when it was signed for this host's org — a cookie
        // minted on another tenant's host (or a pre-P2 cookie with no org)
        // is ignored.
        let role: string | undefined = tenantRoleFromClaims(decodedSession as Record<string, unknown> | null, orgId)
        let hasVerifiedCompanion = false
        if (roleCookie) {
            const verified = await verifyRoleCookie(roleCookie)
            if (verified && verified.uid === decodedSession?.uid && verified.org === orgId) {
                role = verified.role ?? undefined
                hasVerifiedCompanion = true
            }
            // tampered, expired, uid mismatch or other tenant → ignore companion, fall through
        }

        // Only enforce the no-role / pending redirect when we have an
        // authoritative companion cookie. Without it, the Firebase
        // session cookie can legitimately lag Firestore role promotion
        // (newly-approved musicians, post-claim-drift window); bouncing
        // them to '/' creates the same loop 945478b hotfixed. Let
        // page-level UX render a degraded state for truly pending users.
        if (hasVerifiedCompanion && (!role || role === 'pending')) {
            if (pathname !== '/') return detectRedirectLoop('/')
        }

        if (isLeaderRoute) {
            if (role !== 'admin' && role !== 'band_leader') {
                // Unprivileged user trying to access leader/admin routes
                return rewriteWithHeaders(new URL('/unauthorized', request.url))
            }
        }
    }

    // Clear the bounce cookie on successful load of any non-redirected page
    const response = nextWithHeaders()
    if (request.cookies.has('auth_bounce_count')) {
        response.cookies.set('auth_bounce_count', '', { maxAge: 0, path: '/' })
    }
    return response
}

// See "Matching Paths" below to learn more
export const config = {
    // Only run middleware on paths that are actual app routes
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - manifest.json + org-suffixed variants (manifest-<org>.json), sw.js,
         *   workbox-* (PWA configurations). Per-org PWA manifests are emitted by
         *   `layout.tsx` (`manifest: b.manifestPath` → e.g. /manifest-brotherslazaroff.json);
         *   they are public static files with no secrets, so they must bypass the
         *   proxy exactly like /manifest.json — otherwise an unauth landing fetch
         *   307s to /login (the app shell) and PWA install breaks. (BUG-6.)
         * - today.json — the public, metadata-only service document the siddur
         *   reader and the stream overlays fetch anonymously and cross-origin.
         *   `vercel.json` rewrites it to /api/today, but that rewrite runs AFTER
         *   this proxy, so without the exclusion an unauth fetch 307s to /login
         *   and both consumers silently fall back to their calendars. Same
         *   reasoning as manifest.json: a public document with no secrets must
         *   not sit behind the session gate. (Caught against production
         *   2026-09-14, before this line existed.)
         * - logo-<size>.{avif,webp,jpg} — the pre-sized nav logos (perf audit
         *   P1-1). Public images like logo.jpg; inside the matcher an unauth
         *   request 307s to /login and the header logo breaks on Perform.
         */
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|logo.jpg|logo-\\d+\\.(?:avif|webp|jpg)$|today\\.json|manifest(?:-[a-z0-9-]+)?\\.json|sw.js|workbox-.*|pdf\\.worker\\..*\\.mjs|.*\\.png$).*)',
    ],
}
