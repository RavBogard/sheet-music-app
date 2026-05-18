/**
 * API Route Authorization Tests
 *
 * Tests that each API route enforces correct auth and role requirements.
 * These tests mock Firebase Admin and test route handlers directly.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

import { makeReq } from '@/__tests__/api-test-helpers'
import { firebaseAdminMock, mockAuth, mockDoc, mockFirestore, mockWhere, mockUsersSnap } from '@/__tests__/mock-firebase-admin'

// ── Mocks ──

vi.mock('@/lib/firebase-admin', () => firebaseAdminMock)

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

// ── Tests ──

describe('Rate limit key extraction', () => {
    it('extracts unique keys per user from JWT payload', async () => {
        const header = Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')
        const payload1 = Buffer.from('{"sub":"user-aaa"}').toString('base64url')
        const payload2 = Buffer.from('{"sub":"user-bbb"}').toString('base64url')
        const sig = 'fakesig'

        const jwt1 = `${header}.${payload1}.${sig}`
        const jwt2 = `${header}.${payload2}.${sig}`

        expect(jwt1.substring(0, 16)).toBe(jwt2.substring(0, 16))

        const decoded1 = JSON.parse(Buffer.from(payload1, 'base64url').toString())
        const decoded2 = JSON.parse(Buffer.from(payload2, 'base64url').toString())
        expect(decoded1.sub).toBe('user-aaa')
        expect(decoded2.sub).toBe('user-bbb')
        expect(decoded1.sub).not.toBe(decoded2.sub)
    })
})

describe('POST /api/setlist/publish', () => {
    let POST: (req: import('next/server').NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/setlist/publish/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // Restore mockDoc defaults for publish tests
        mockDoc.exists = true
        mockDoc.data = () => ({
            ownerId: 'user123',
            name: 'Test Setlist',
            tracks: [{ fileId: 'f1', title: 'Adon Olam', type: 'song' }],
        })
    })

    it('rejects unauthenticated requests with 401', async () => {
        firebaseAdminMock.verifyIdToken.mockResolvedValue(null as never)

        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            body: { setlistId: 'test' },
        }))

        expect(res.status).toBe(401)
    })

    it('allows band leaders to publish (uses token claims, not Firestore fetch)', async () => {
        mockAuth('band_leader')

        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            token: 'valid-token',
            body: {
                setlistId: 'test',
                musicians: [{ name: 'Alice', uid: 'u1', email: 'alice@test.com' }],
                emailRecipients: [],
            },
        }))

        expect(res.status).not.toBe(401)
        expect(res.status).not.toBe(403)
    })

    it('rejects musicians (non-owner, non-leader)', async () => {
        firebaseAdminMock.verifyIdToken.mockResolvedValue({
            uid: 'other-user',
            email: 'other@test.com',
            role: 'musician',
            isAdmin: false,
            isBandLeader: false,
            isMusician: true,
            isMember: true,
        } as never)

        const res = await POST(makeReq('/api/setlist/publish', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 'test', musicians: [{ name: 'Alice', uid: 'u1', email: 'alice@test.com' }], emailRecipients: [] },
        }))

        expect(res.status).toBe(403)
    })
})

describe('POST /api/admin/set-role', () => {
    let POST: (req: import('next/server').NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/admin/set-role/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects non-admin users', async () => {
        mockAuth('band_leader')

        const res = await POST(makeReq('/api/admin/set-role', {
            method: 'POST',
            token: 'valid-token',
            body: { targetUid: 'u1', newRole: 'musician' },
        }))

        expect(res.status).toBe(403)
    })
})

describe('GET /api/drive/file/[fileId]', () => {
    let GET: (req: import('next/server').NextRequest, ctx: { params: Promise<{ fileId: string }> }) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/drive/file/[fileId]/route')
        GET = mod.GET
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 404 on bogus fileId BEFORE the auth gate (cycle-1 F-021)', async () => {
        // Pre-F-021, this returned 401 ("Authentication required") which
        // misled agents — they re-tried with credentials when the real
        // problem was a wrong id. F-021 reorders the existence check
        // ahead of the auth gate so unauth + bogus id = 404 not 401.
        // SEC-002 (cycle-2) also pins the rich envelope shape on the
        // 404 body.
        const res = await GET(
            makeReq('/api/drive/file/test-id'),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        expect(res.status).toBe(404)
        const body = (await res.json()) as Record<string, unknown>
        expect(body.ok).toBe(false)
        // Cycle-3 REG-002 rich-object envelope: error is a body object,
        // not a flat slug. Pre-cycle-3 callers asserted `body.error ===
        // 'file_not_found'` + `body.message`; post-cycle-3 the slug lives
        // at `body.error.machine_code` and the prose at `body.error.message`.
        const errObj = body.error as { machine_code: string; message: string }
        expect(errObj.machine_code).toBe('file_not_found')
        expect(typeof errObj.message).toBe('string')
        expect(typeof body.hint).toBe('string')
    })

    it('allows same-origin browser requests', async () => {
        const res = await GET(
            makeReq('/api/drive/file/test-id', {
                headers: { 'sec-fetch-site': 'same-origin' },
            }),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        expect(res.status).not.toBe(401)
    })

    it('allows authenticated API requests', async () => {
        mockAuth('musician')

        const res = await GET(
            makeReq('/api/drive/file/test-id', { token: 'valid-token' }),
            { params: Promise.resolve({ fileId: 'test-id' }) }
        )

        expect(res.status).not.toBe(401)
    })
})

describe('POST /api/setlist/email-packets', () => {
    let POST: (req: import('next/server').NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/setlist/email-packets/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // Set up users snap for email-packets query
        mockUsersSnap.docs = [
            {
                id: 'u1',
                data: () => ({ uid: 'u1', email: 'a@test.com', displayName: 'Alice', role: 'musician' }),
            },
            {
                id: 'u2',
                data: () => ({ uid: 'u2', email: 'b@test.com', displayName: 'Bob', role: 'member' }),
            },
        ]
        mockDoc.exists = true
        mockDoc.data = () => ({
            ownerId: 'user123',
            name: 'Test Setlist',
            tracks: [{ fileId: 'f1', title: 'Adon Olam', type: 'song' }],
        })
    })

    it('excludes community members from recipient query', async () => {
        mockAuth('band_leader')

        await POST(makeReq('/api/setlist/email-packets', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 'test' },
        }))

        const roleCall = mockWhere.mock.calls.find(
            (c: unknown[]) => c[0] === 'role' && c[1] === 'in'
        ) as unknown[] | undefined
        expect(roleCall).toBeTruthy()
        expect(roleCall![2]).not.toContain('member')
    })
})
