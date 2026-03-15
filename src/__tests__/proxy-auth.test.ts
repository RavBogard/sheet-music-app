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

    it('allows public routes without authentication', () => {
        const req = makeReq('/perform/setlist/123')
        const res = proxy(req)
        
        // A "NextResponse.next()" has no headers by default and a 200 status in edge mock
        expect(res.headers.get('location')).toBeNull()
    })

    it('redirects unauthenticated users to /login for secure routes', () => {
        const req = makeReq('/setlists')
        const res = proxy(req)
        
        expect(res.headers.get('location')).toBe('http://localhost/login')
    })

    it('blocks "pending" users from all secure routes except /', () => {
        const token = createSessionToken({ role: 'pending' })
        const req = makeReq('/setlists', { __session: token })
        const res = proxy(req)
        
        expect(res.headers.get('location')).toBe('http://localhost/')
    })

    it('blocks "undefined" role users from all secure routes except / (Ghost User Bug)', () => {
        // A brand new user with no claims
        const token = createSessionToken({ email: 'new@test.com' }) 
        const req = makeReq('/setlists', { __session: token })
        const res = proxy(req)
        
        expect(res.headers.get('location')).toBe('http://localhost/')
    })

    it('allows "member" users to access /library but blocks them from /admin', () => {
        const token = createSessionToken({ role: 'member' })
        
        const reqLibrary = makeReq('/library', { __session: token })
        const resLibrary = proxy(reqLibrary)
        expect(resLibrary.headers.get('location')).toBeNull() // Allowed

        // Use a leader route other than exactly '/admin' to avoid the redirect to '/manage' first
        const reqAdmin = makeReq('/manage/settings', { __session: token })
        const resAdmin = proxy(reqAdmin)
        
        // The middleware rewrites to /unauthorized for leader routes.
        expect(resAdmin).toBeDefined()
        expect(resAdmin.headers.get('location')).toBeNull() 

        // In jsdom environment with Next.js polyfills, a NextResponse.rewrite() adds an x-middleware-rewrite header
        expect(resAdmin.headers.get('x-middleware-rewrite')).toBe('http://localhost/unauthorized')
    })
})
