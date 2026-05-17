import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SESSION_ROLE_COOKIE, verifyRoleCookie } from '@/lib/session-role'

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
]

// Prefix-match public routes — these serve public/unauthenticated content
// /perform/*     — musicians view shared setlists (may not be signed in)
// /qr/*          — QR code sign-in flow (used *before* having a session)
// /.well-known/* — OAuth discovery metadata; Claude Desktop/web fetch these
//                  unauthenticated to find the MCP authorization server
const publicPrefixes = ['/perform', '/qr', '/.well-known']

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('__session')?.value
    const decodedSession = session ? decodeJwtPayload(session) : null
    const roleCookie = request.cookies.get(SESSION_ROLE_COOKIE)?.value
    const ua = request.headers.get('user-agent') || ''

    const isPublicRoute =
        publicExactRoutes.includes(pathname) ||
        publicPrefixes.some(p => pathname.startsWith(p))
    const isApiRoute = pathname.startsWith('/api')
    const isLeaderRoute = pathname.startsWith('/admin') || pathname.startsWith('/manage')

    // Allow social media crawlers through so they can read OG meta tags.
    // These bots only fetch HTML <head> for link previews — no security risk.
    const isSocialCrawler = /facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot/i.test(ua)
    if (isSocialCrawler) {
        return NextResponse.next()
    }

    // We do not want to block API routes here; let them handle their own auth
    if (isApiRoute) {
        return NextResponse.next()
    }

    // Helper to create a redirect with cache-busting headers
    const createNoCacheRedirect = (url: URL) => {
        const response = NextResponse.redirect(url)
        response.headers.set('Cache-Control', 'no-store, must-revalidate, max-age=0')
        return response
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
                return NextResponse.rewrite(new URL('/unauthorized', request.url))
            }
        }
    }

    // Clear the bounce cookie on successful load of any non-redirected page
    const response = NextResponse.next()
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
