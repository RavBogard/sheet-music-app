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
import { revalidatePath } from 'next/cache'

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

let PATCH: typeof import('@/app/api/library/rename/route').PATCH

beforeAll(async () => {
    const mod = await import('@/app/api/library/rename/route')
    PATCH = mod.PATCH
})

describe('PATCH /api/library/rename', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        docExists = true
    })

    it('updates displayName and returns success', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: 'New Name' },
        })
        const res = await PATCH(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.displayName).toBe('New Name')
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ displayName: 'New Name' })
        )
    })

    it('trims whitespace from displayName', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: '  Trimmed Name  ' },
        })
        const res = await PATCH(req)
        const json = await res.json()

        expect(json.displayName).toBe('Trimmed Name')
    })

    it('returns 404 for missing file', async () => {
        mockAuth('band_leader')
        docExists = false
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'nonexistent', displayName: 'Name' },
        })
        const res = await PATCH(req)

        expect(res.status).toBe(404)
    })

    it('v60-09-01: mirrors title + normalizedTitle to songs/{fileId} with merge:true', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: 'New Title' },
        })
        await PATCH(req)

        expect(mockSongsSet).toHaveBeenCalledTimes(1)
        expect(mockSongsSet).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'New Title',
                normalizedTitle: 'new title',
                updatedAt: expect.any(Number),
            }),
            { merge: true },
        )
    })

    it('calls revalidatePath after rename', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: 'New Name' },
        })
        await PATCH(req)

        expect(revalidatePath).toHaveBeenCalled()
    })
})
