import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Mock state ──

let docExists = true
const mockUpdate = vi.fn()
const mockSongsSet = vi.fn()

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => ({
        doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: docExists })),
            update: mockUpdate,
            // v60-09-01: songs/{fileId} mirror writes go through .set() with merge.
            set: name === 'songs' ? mockSongsSet : vi.fn(),
        })),
    })),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}))

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'user-1',
        email: 'user@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

let PATCH: typeof import('@/app/api/library/archive/route').PATCH

beforeAll(async () => {
    const mod = await import('@/app/api/library/archive/route')
    PATCH = mod.PATCH
})

describe('PATCH /api/library/archive', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        docExists = true
    })

    it('archives file with correct fields', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', archive: true },
        })
        const res = await PATCH(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.archived).toBe(true)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'archived',
                archivedBy: 'user-1',
            })
        )
    })

    it('restores file with null archive fields', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', archive: false },
        })
        const res = await PATCH(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.archived).toBe(false)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'active',
                archivedBy: null,
                archivedAt: null,
            })
        )
    })

    it('returns 404 for missing file', async () => {
        mockAuth('band_leader')
        docExists = false
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'nonexistent', archive: true },
        })
        const res = await PATCH(req)

        expect(res.status).toBe(404)
    })

    it('v60-09-01: mirrors archive status to songs/{fileId} with merge:true', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', archive: true },
        })
        await PATCH(req)

        expect(mockSongsSet).toHaveBeenCalledTimes(1)
        expect(mockSongsSet).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'archived',
                updatedAt: expect.any(Number),
            }),
            { merge: true },
        )
    })

    it('v60-09-01: mirrors restore status to songs/{fileId}', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', archive: false },
        })
        await PATCH(req)

        expect(mockSongsSet).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'active' }),
            { merge: true },
        )
    })

    it('returns correct response shape', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/archive', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', archive: true },
        })
        const res = await PATCH(req)
        const json = await res.json()

        expect(json).toEqual({ success: true, archived: true })
    })
})
