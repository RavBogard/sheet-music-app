/**
 * Tests for POST /api/setlists/notify-updated
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

import { makeReq } from '@/__tests__/api-test-helpers'
import { firebaseAdminMock, mockAuth, mockUsersSnap } from '@/__tests__/mock-firebase-admin'

// ── Mocks ──

// Extend the shared firestore mock with batch() support (route uses db.batch()).
const batchSet = vi.fn()
const batchCommit = vi.fn(async () => undefined)
const firestoreWithBatch = {
    collection: vi.fn((name: string) => {
        if (name === 'users') {
            return {
                where: vi.fn(() => ({ get: vi.fn(async () => mockUsersSnap) })),
                doc: vi.fn(() => ({
                    collection: vi.fn(() => ({ doc: vi.fn(() => ({})) })),
                })),
            }
        }
        return { doc: vi.fn(() => ({})) }
    }),
    batch: vi.fn(() => ({
        set: batchSet,
        commit: batchCommit,
    })),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => firestoreWithBatch),
    verifyIdToken: firebaseAdminMock.verifyIdToken,
}))

const checkRateLimit = vi.fn<(req: unknown, tier: unknown) => unknown>(() => null)
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: (req: unknown, tier: unknown) => checkRateLimit(req, tier),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Tests ──

describe('POST /api/setlists/notify-updated', () => {
    let POST: (req: import('next/server').NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('./route')
        POST = mod.POST as typeof POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        checkRateLimit.mockReturnValue(null)
        mockUsersSnap.docs = [
            { id: 'user123', data: () => ({ role: 'admin' }) },
            { id: 'u-musician-1', data: () => ({ role: 'musician' }) },
            { id: 'u-musician-2', data: () => ({ role: 'musician' }) },
        ]
    })

    it('rejects unauthenticated requests with 401', async () => {
        firebaseAdminMock.verifyIdToken.mockResolvedValue(null as never)

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            body: { setlistId: 's1', setlistName: 'Test', trackCount: 5 },
        }))

        expect(res.status).toBe(401)
    })

    it('rejects musicians (non-privileged role) with 403', async () => {
        mockAuth('musician')

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 's1', setlistName: 'Test', trackCount: 5 },
        }))

        expect(res.status).toBe(403)
    })

    it('returns 429 when rate limited', async () => {
        mockAuth('band_leader')
        checkRateLimit.mockReturnValueOnce(
            NextResponse.json({ error: 'rate limited' }, { status: 429 })
        )

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 's1', setlistName: 'Test', trackCount: 5 },
        }))

        expect(res.status).toBe(429)
    })

    it('validates body shape and returns 400 for invalid input', async () => {
        mockAuth('band_leader')

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: '', setlistName: 'x', trackCount: -1 },
        }))

        expect(res.status).toBe(400)
    })

    it('broadcasts to all members except the caller on happy path', async () => {
        mockAuth('band_leader')
        // Make the caller one of the users so we can prove self-exclusion.
        mockUsersSnap.docs = [
            { id: 'user123', data: () => ({ role: 'band_leader' }) },
            { id: 'u-musician-1', data: () => ({ role: 'musician' }) },
            { id: 'u-musician-2', data: () => ({ role: 'musician' }) },
            { id: 'u-member-3', data: () => ({ role: 'member' }) },
        ]

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 's1', setlistName: 'Rosh Hashanah', trackCount: 12 },
        }))

        expect(res.status).toBe(200)
        const body = await res.json()
        // 4 users in snap, caller excluded -> 3 recipients
        expect(body).toEqual({ ok: true, count: 3 })
        expect(batchSet).toHaveBeenCalledTimes(3)
        expect(batchCommit).toHaveBeenCalledTimes(1)

        // Verify notification shape on one of the set calls
        const [, payload] = batchSet.mock.calls[0]
        expect(payload).toMatchObject({
            type: 'setlist_updated',
            title: 'Setlist updated',
            body: '"Rosh Hashanah" was updated (12 tracks)',
            link: '/setlist/s1',
            entityId: 's1',
            read: false,
        })
    })

    it('returns count 0 and skips batch when no recipients', async () => {
        mockAuth('band_leader')
        mockUsersSnap.docs = [
            { id: 'user123', data: () => ({ role: 'band_leader' }) },
        ]

        const res = await POST(makeReq('/api/setlists/notify-updated', {
            method: 'POST',
            token: 'valid-token',
            body: { setlistId: 's1', setlistName: 'Solo', trackCount: 1 },
        }))

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({ ok: true, count: 0 })
        expect(batchSet).not.toHaveBeenCalled()
        expect(batchCommit).not.toHaveBeenCalled()
    })
})
