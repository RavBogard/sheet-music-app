import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// These are public routes that don't require authentication
const publicRoutes = ['/login', '/']

export function middleware(request: NextRequest) {
    const session = request.cookies.get('__session')?.value

    const isPublicRoute = publicRoutes.includes(request.nextUrl.pathname)
    const isApiRoute = request.nextUrl.pathname.startsWith('/api')

    // We do not want to block API routes here; let them handle their own auth
    if (isApiRoute) {
        return NextResponse.next()
    }

    if (!session && !isPublicRoute) {
        // User is not logged in but trying to access a secure page (like /setlists)
        const redirectUrl = new URL('/login', request.url)
        return NextResponse.redirect(redirectUrl)
    }

    if (session && request.nextUrl.pathname === '/login') {
        // User is logged in but going to the login page -> send to dashboard
        const redirectUrl = new URL('/setlists', request.url)
        return NextResponse.redirect(redirectUrl)
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
         */
        '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|logo.jpg|.*\\.png$).*)',
    ],
}
