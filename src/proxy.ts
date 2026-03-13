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
const publicExactRoutes = ['/login', '/']

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

    if (!session && !isPublicRoute) {
        // User is not logged in but trying to access a secure page
        const redirectUrl = new URL('/login', request.url)
        return NextResponse.redirect(redirectUrl)
    }

    if (session && pathname === '/login') {
        // User is logged in but going to the login page -> send to dashboard
        const redirectUrl = new URL('/setlists', request.url)
        return NextResponse.redirect(redirectUrl)
    }

    // Redirect /admin to /manage
    if (session && pathname === '/admin') {
        const redirectUrl = new URL('/manage', request.url)
        return NextResponse.redirect(redirectUrl)
    }

    // Role Verification via Claims
    if (session && !isPublicRoute) {
        const role = decodedSession?.role
        
        // Pending users are explicitly blocked from all secure routes except the home dashboard
        if (role === 'pending' && pathname !== '/') {
            const redirectUrl = new URL('/', request.url)
            return NextResponse.redirect(redirectUrl)
        }

        if (isLeaderRoute) {
            if (role !== 'admin' && role !== 'band_leader') {
                // Unprivileged user trying to access leader/admin routes
                const redirectUrl = new URL('/setlists', request.url)
                return NextResponse.redirect(redirectUrl)
            }
        }
    }

    return NextResponse.next()
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
