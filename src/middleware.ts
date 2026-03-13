import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't require Firebase Bearer token authentication
const PUBLIC_API_ROUTES = [
  '/api/cron',       // Secured via CRON_SECRET
  '/api/webhooks',   // Secured via webhook signatures
  '/api/inngest',    // Secured via INNGEST_SIGNING_KEY
  '/api/auth',       // Auth endpoints
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Only apply to /api routes
  if (pathname.startsWith('/api/')) {
    // Check if it's a public route
    const isPublic = PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))
    
    if (!isPublic) {
      // Basic check for Authorization header.
      // Note: Full Firebase token verification happens in the route handlers
      // via `withAuth` because firebase-admin is not supported in Edge Runtime.
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
