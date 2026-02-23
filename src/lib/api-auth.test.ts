import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock firebase-admin before importing
vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn(),
    verifyIdToken: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { requireAuth, withAuth } from './api-auth'
import { verifyIdToken } from '@/lib/firebase-admin'

const mockVerify = vi.mocked(verifyIdToken)

function makeReq(token?: string): NextRequest {
    const headers = new Headers()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return new NextRequest('http://localhost/api/test', { headers })
}

describe('requireAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('throws 401 when no Authorization header', async () => {
        try {
            await requireAuth(makeReq())
            expect.unreachable('Should have thrown')
        } catch (err: unknown) {
            const res = err as Response
            expect(res.status).toBe(401)
            const body = await res.json()
            expect(body.error).toContain('Authentication required')
        }
    })

    it('throws 403 when token is invalid', async () => {
        mockVerify.mockResolvedValue(null as never)
        try {
            await requireAuth(makeReq('bad-token'))
            expect.unreachable('Should have thrown')
        } catch (err: unknown) {
            const res = err as Response
            expect(res.status).toBe(403)
            const body = await res.json()
            expect(body.error).toContain('Invalid or expired token')
        }
    })

    it('returns AuthResult for valid token (no role required)', async () => {
        mockVerify.mockResolvedValue({
            uid: 'user123',
            email: 'user@test.com',
            role: 'member',
        } as never)

        const result = await requireAuth(makeReq('good-token'))
        expect(result.uid).toBe('user123')
        expect(result.email).toBe('user@test.com')
        expect(result.role).toBe('member')
        expect(result.isAdmin).toBe(false)
    })

    it('grants admin to super admin UID regardless of role', async () => {
        const originalUid = process.env.SUPER_ADMIN_UID
        process.env.SUPER_ADMIN_UID = '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3'

        mockVerify.mockResolvedValue({
            uid: '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3',
            email: 'admin@test.com',
        } as never)

        const result = await requireAuth(makeReq('admin-token'), 'admin')
        expect(result.isAdmin).toBe(true)

        // Cleanup
        if (originalUid) process.env.SUPER_ADMIN_UID = originalUid
        else delete process.env.SUPER_ADMIN_UID
    })

    it('grants admin to user with admin role', async () => {
        mockVerify.mockResolvedValue({
            uid: 'other-uid',
            email: 'a@test.com',
            role: 'admin',
        } as never)

        const result = await requireAuth(makeReq('tok'), 'admin')
        expect(result.isAdmin).toBe(true)
    })

    it('throws 403 when member requests admin route', async () => {
        mockVerify.mockResolvedValue({
            uid: 'user1',
            email: 'u@test.com',
            role: 'member',
        } as never)

        try {
            await requireAuth(makeReq('tok'), 'admin')
            expect.unreachable('Should have thrown')
        } catch (err: unknown) {
            const res = err as Response
            expect(res.status).toBe(403)
            const body = await res.json()
            expect(body.error).toContain('Requires admin role')
        }
    })

    it('allows band_leader to access member routes', async () => {
        mockVerify.mockResolvedValue({
            uid: 'user2',
            email: 'l@test.com',
            role: 'band_leader',
        } as never)

        const result = await requireAuth(makeReq('tok'), 'member')
        expect(result.role).toBe('band_leader')
    })

    it('blocks member from band_leader routes', async () => {
        mockVerify.mockResolvedValue({
            uid: 'user3',
            email: 'm@test.com',
            role: 'member',
        } as never)

        try {
            await requireAuth(makeReq('tok'), 'band_leader')
            expect.unreachable('Should have thrown')
        } catch (err: unknown) {
            const res = err as Response
            expect(res.status).toBe(403)
        }
    })
})

describe('withAuth', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns AuthResult on success', async () => {
        mockVerify.mockResolvedValue({
            uid: 'u1',
            email: 'e@t.com',
            role: 'member',
        } as never)

        const result = await withAuth(makeReq('tok'))
        expect('uid' in result).toBe(true)
        if ('uid' in result) {
            expect(result.uid).toBe('u1')
        }
    })

    it('returns NextResponse on auth failure', async () => {
        const result = await withAuth(makeReq())
        expect('status' in result).toBe(true)
        if ('status' in result) {
            expect(result.status).toBe(401)
        }
    })

    it('returns 500 on unexpected errors', async () => {
        mockVerify.mockRejectedValue(new Error('Firebase down'))

        const result = await withAuth(makeReq('tok'))
        expect('status' in result).toBe(true)
        if ('status' in result) {
            expect(result.status).toBe(500)
        }
    })
})
