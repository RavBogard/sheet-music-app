import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

// Exact-match public routes
const publicExactRoutes = ['/login', '/', '/auth-error']

// Prefix-match public routes — these serve public/unauthenticated content
// /perform/* — musicians view shared setlists (may not be signed in)
// /qr/*     — QR code sign-in flow (used *before* having a session)
// /live/*   — public live display view for screens and lobby
const publicPrefixes = ['/perform', '/qr', '/live']

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const session = request.cookies.get('__session')?.value
    const decodedSession = session ? decodeJwtPayload(session) : null
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
            response.cookies.delete('auth_bounce_count')
            return response
        }

        // Increment bounce count and set a short expiry (10 seconds)
        const response = createNoCacheRedirect(new URL(targetPath, request.url))
        response.cookies.set('auth_bounce_count', (bounceCount + 1).toString(), { maxAge: 10 })
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

    // Role Verification via Claims
    if (session && !isPublicRoute) {
        const role = decodedSession?.role

        // Do NOT redirect role-less users from non-leader routes.
        // The session cookie can lag behind Firestore role promotion (e.g.,
        // a just-approved musician whose cookie was minted before the admin
        // set the role claim). Firestore rules remain authoritative for data
        // reads; page-level UX can render a degraded state if truly pending.
        // Previously redirected to '/' here — that created a loop for newly
        // approved users whose cookie/claim hadn't caught up yet.
        void role

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
        response.cookies.delete('auth_bounce_count')
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
