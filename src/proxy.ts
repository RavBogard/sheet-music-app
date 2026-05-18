import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_ROLE_COOKIE, verifyRoleCookie } from '@/lib/session-role'
import { httpError } from '@/lib/http/error-envelope'

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
        `img-src 'self' data: blob: https://*.googleapis.com https://*.firebasestorage.app https://*.googleusercontent.com`,
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
]

// Prefix-match public routes — these serve public/unauthenticated content
// /perform/*     — musicians view shared setlists (may not be signed in)
// /qr/*          — QR code sign-in flow (used *before* having a session)
// /.well-known/* — OAuth discovery metadata; Claude Desktop/web fetch these
//                  unauthenticated to find the MCP authorization server
const publicPrefixes = ['/perform', '/qr', '/.well-known']

// Vestigial paths — these used to be the catch-all defaults the proxy
// matcher couldn't avoid, and Next.js answered them with either a 307→/login
// (unauth) or a 404 (authed). Cycle-3 b3 ratified that the right answer
// for both is a clean 404 (decisions.md 2026-05-18T00:20Z): nothing in
// src/** links to them, and bouncing unauth probes to /login is misleading.
//
// We short-circuit them here BEFORE the auth-redirect so unauth visits
// don't get sent to /login. Note `/v2` itself has a shipped beta landing
// (src/app/(v2)/v2/page.tsx) — kept on the auth-gated track so unauth
// visitors still redirect to /login; only `/v2/<child>` paths are
// vestigial-until-built. When a future v2-migration phase ships
// e.g. `/v2/library`, the new page handler exists and the explicit
// allow-list above (or here) needs to remove that child.
const vestigialExactRoutes = ['/account', '/manage/users']

function isVestigialPath(pathname: string): boolean {
    if (vestigialExactRoutes.includes(pathname)) return true
    // `/v2/<child>` — matches `/v2/library` etc. but NOT the bare `/v2`
    // landing page that's already shipped.
    if (pathname.startsWith('/v2/')) return true
    return false
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('__session')?.value
    const decodedSession = session ? decodeJwtPayload(session) : null
    const roleCookie = request.cookies.get(SESSION_ROLE_COOKIE)?.value
    const ua = request.headers.get('user-agent') || ''

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

    // Redirect /admin to /manage
    if (session && pathname === '/admin') {
        return createNoCacheRedirect(new URL('/manage', request.url))
    }

    // Role Verification — prefer the server-signed companion cookie
    // (__session_role) when present and matching the Firebase session
    // uid; otherwise fall back to whatever role claim the Firebase
    // session carries. See v4.3 P9-02.
    if (session && !isPublicRoute) {
        let role: string | undefined = decodedSession?.role as string | undefined
        let hasVerifiedCompanion = false
        if (roleCookie) {
            const verified = await verifyRoleCookie(roleCookie)
            if (verified && verified.uid === decodedSession?.uid) {
                role = verified.role ?? undefined
                hasVerifiedCompanion = true
            }
            // tampered, expired, or uid mismatch → ignore companion, fall through
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
         * - manifest.json, sw.js, workbox-* (PWA configurations)
         */
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|logo.jpg|manifest.json|sw.js|workbox-.*|pdf\\.worker\\..*\\.mjs|.*\\.png$).*)',
    ],
}
