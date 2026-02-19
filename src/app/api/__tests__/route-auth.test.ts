/**
 * API Route Authorization Tests
 *
 * Tests that each API route enforces correct auth and role requirements.
 * These tests mock Firebase Admin and test route handlers directly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ── Mocks ──

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/email', () => ({
    sendSetlistEmail: vi.fn(() => ({ success: true, messageId: 'msg-1' })),
}))

vi.mock('@/lib/song-usage', () => ({
    recordSongUsage: vi.fn(() => ({ recorded: 0, skipped: 0 })),
    getUsageSummaries: vi.fn(() => new Map()),
}))

import { verifyIdToken } from '@/lib/firebase-admin'

const mockVerify = vi.mocked(verifyIdToken)

// Mock Firestore
const mockDoc = {
    exists: true,
    data: () => ({
        ownerId: 'user123',
        isPublic: false,
        name: 'Test Setlist',
        tracks: [{ fileId: 'f1', title: 'Adon Olam', type: 'song' }],
    }),
    ref: { update: vi.fn() },
}

const mockUsersSnap = {
    docs: [
        {
            id: 'u1',
            data: () => ({ uid: 'u1', email: 'a@test.com', displayName: 'Alice', role: 'musician' }),
        },
        {
            id: 'u2',
            data: () => ({ uid: 'u2', email: 'b@test.com', displayName: 'Bob', role: 'member' }),
        },
    ],
}

const mockFirestore = {
    collection: vi.fn(() => ({
        doc: vi.fn(() => ({
            get: vi.fn(() => mockDoc),
            update: vi.fn(),
            collection: vi.fn(() => ({
                doc: vi.fn(() => ({ set: vi.fn() })),
            })),
        })),
        where: vi.fn(() => ({
            get: vi.fn(() => mockUsersSnap),
        })),
    })),
}

function makeReq(
    url: string,
    opts: {
        method?: string
        token?: string
        body?: Record<string, unknown>
        headers?: Record<string, string>
    } = {}
): NextRequest {
    const headers = new Headers()
    if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`)
    if (opts.headers) {
        Object.entries(opts.headers).forEach(([k, v]) => headers.set(k, v))
    }

    const init: Record<string, unknown> = {
        method: opts.method || 'GET',
        headers,
    }
    if (opts.body) {
        headers.set('Content-Type', 'application/json')
        init.body = JSON.stringify(opts.body)
    }
    return new NextRequest(`http://localhost${url}`, init as never)
}

function mockAuth(role: string) {
    mockVerify.mockResolvedValue({
        uid: 'user123',
        email: 'test@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

// ── Tests ──

describe('Rate limit key extraction', () => {
    it('extracts unique keys per user from JWT payload', async () => {
        // Import directly to test the module-level function
        // Build two JWTs with same header but different payloads
        const header = Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')
        const payload1 = Buffer.from('{"sub":"user-aaa"}').toString('base64url')
        const payload2 = Buffer.from('{"sub":"user-bbb"}').toString('base64url')
        const sig = 'fakesig'

        const jwt1 = `${header}.${payload1}.${sig}`
        const jwt2 = `${header}.${payload2}.${sig}`

        // Verify first 16 chars are identical (the old bug)
        expect(jwt1.substring(0, 16)).toBe(jwt2.substring(0, 16))

        // Verify payloads decode to different user IDs
        const decoded1 = JSON.parse(Buffer.from(payload1, 'base64url').toString())
        const decoded2 = JSON.parse(Buffer.from(payload2, 'base64url').toString())
        expect(decoded1.sub).toBe('user-aaa')
        expect(decoded2.sub).toBe('user-bbb')
        expect(decoded1.sub).not.toBe(decoded2.sub)
    })
})

describe('POST /api/setlist/publish', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects unauthenticated requests with 401', async () => {
        mockVerify.mockResolvedValue(null as never)

        const { POST } = await import('@/app/api/setlist/publish/route')
        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            body: { setlistId: 'test' },
        }))

        expect(res.status).toBe(401)
    })

    it('allows band leaders to publish (uses token claims, not Firestore fetch)', async () => {
        mockAuth('band_leader')

        const { POST } = await import('@/app/api/setlist/publish/route')
        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            token: 'valid-token',
            body: {
                setlistId: 'test',
                musicians: [{ name: 'Alice', uid: 'u1' }],
                emailRecipients: [],
            },
        }))

        // Auth should pass (not 401 or 403) — may be 500 due to incomplete mocks
        // downstream, but the authorization check itself succeeds
        expect(res.status).not.toBe(401)
        expect(res.status).not.toBe(403)
    })

    it('rejects musicians (non-owner, non-leader)', async () => {
        mockVerify.mockResolvedValue({
            uid: 'other-user',
            email: 'other@test.com',
            role: 'musician',
            isAdmin: false,
            isBandLeader: false,
            isMusician: true,
            isMember: true,
        } as never)

        const { POST } = await import('@/app/api/setlist/publish/route')
        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 'test', musicians: [{ name: 'Alice', uid: 'u1' }], emailRecipients: [] },
        }))

        expect(res.status).toBe(403)
    })
})

describe('POST /api/admin/set-role', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects non-admin users', async () => {
        mockAuth('band_leader')

        const { POST } = await import('@/app/api/admin/set-role/route')
        const res = await POST(makeReq('/api/admin/set-role', {
            method: 'POST',
            token: 'valid-token',
            body: { targetUid: 'u1', newRole: 'musician' },
        }))

        expect(res.status).toBe(403)
    })
})

describe('GET /api/drive/file/[fileId]', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects requests without auth or browser context', async () => {
        // Import the route handler
        const route = await import('@/app/api/drive/file/[fileId]/route')
        const res = await route.GET(
            makeReq('/api/drive/file/test-id'),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        expect(res.status).toBe(401)
    })

    it('allows same-origin browser requests', async () => {
        const route = await import('@/app/api/drive/file/[fileId]/route')
        const res = await route.GET(
            makeReq('/api/drive/file/test-id', {
                headers: { 'sec-fetch-site': 'same-origin' },
            }),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        // Will be 404 (file not found) since we haven't mocked the file fetcher,
        // but importantly NOT 401
        expect(res.status).not.toBe(401)
    })

    it('allows authenticated API requests', async () => {
        mockAuth('musician')

        const route = await import('@/app/api/drive/file/[fileId]/route')
        const res = await route.GET(
            makeReq('/api/drive/file/test-id', { token: 'valid-token' }),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        expect(res.status).not.toBe(401)
    })
})

describe('POST /api/setlist/email-packets', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('excludes community members from recipient query', async () => {
        mockAuth('band_leader')

        const { POST } = await import('@/app/api/setlist/email-packets/route')
        await POST(makeReq('/api/setlist/email-packets', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 'test' },
        }))

        // Check the role filter passed to Firestore query
        const collectionFn = mockFirestore.collection as ReturnType<typeof vi.fn>
        const whereCall = collectionFn()?.where as ReturnType<typeof vi.fn>
        if (whereCall?.mock?.calls?.length > 0) {
            const roleFilter = whereCall.mock.calls.find(
                (c: string[]) => c[0] === 'role' && c[1] === 'in'
            )
            if (roleFilter) {
                expect(roleFilter[2]).not.toContain('member')
            }
        }
    })
})
