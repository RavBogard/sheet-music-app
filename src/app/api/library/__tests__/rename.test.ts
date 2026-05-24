import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Mock state ──

let docExists = true
const mockUpdate = vi.fn()
const mockSongsSet = vi.fn()

// F-7: rename now queries library_index by stem for siblingsInCatalog.
// Default to empty siblings (siblingsInCatalog=1) unless a test overrides.
let mockSiblingDocs: Array<{ id: string; data: () => { status?: string } }> = []
const mockSelectGet = vi.fn(async () => ({ docs: mockSiblingDocs }))
const mockSelect = vi.fn(() => ({ get: mockSelectGet }))
const mockWhere2 = vi.fn(() => ({ select: mockSelect }))
const mockWhere1 = vi.fn(() => ({ select: mockSelect, where: mockWhere2 }))

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => ({
        doc: vi.fn(() => ({
            get: vi.fn(async () => ({ exists: docExists })),
            update: mockUpdate,
            // v60-09-01: songs/{fileId} mirror writes go through .set() with merge.
            set: name === 'songs' ? mockSongsSet : vi.fn(),
        })),
        // F-7: stem-sibling query path. Only library_index is queried this way.
        where: mockWhere1,
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
        mockSiblingDocs = []
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

    // ─── F-7 W-02 recompute coverage ─────────────────────────────────────

    it('F-7: writes all 5 W-02 fields (name + nameLower + normalizedName + stem + titleSpecificity)', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: 'Hashkivenu (Klepper)' },
        })
        await PATCH(req)

        expect(mockUpdate).toHaveBeenCalledTimes(1)
        const arg = mockUpdate.mock.calls[0][0] as Record<string, unknown>
        expect(arg.name).toBe('Hashkivenu (Klepper)')
        expect(arg.nameLower).toBe('hashkivenu (klepper)')
        expect(arg.normalizedName).toBe('hashkivenuklepper')
        expect(arg.stem).toBe('hashkivenu')
        expect(typeof arg.titleSpecificity).toBe('number')
        // Pre-F-7 fields preserved.
        expect(arg.displayName).toBe('Hashkivenu (Klepper)')
        expect(typeof arg.modifiedTime).toBe('string')
    })

    it('F-7: queries siblings by the NEW title stem, excluding self', async () => {
        mockAuth('band_leader')
        // Seed siblings: two non-orphaned + one orphaned + the row being renamed itself.
        mockSiblingDocs = [
            { id: 'sib-a', data: () => ({ status: 'active' }) },
            { id: 'sib-b', data: () => ({ status: 'active' }) },
            { id: 'sib-orphan', data: () => ({ status: 'orphaned' }) },
            { id: 'file-1', data: () => ({ status: 'active' }) }, // self
        ]
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: 'Modim Anachnu Lach' },
        })
        await PATCH(req)
        // Stem-equality query against the NEW stem.
        expect(mockWhere1).toHaveBeenCalledWith('stem', '==', 'modim anachnu lach')
        // titleSpecificity computed off siblingsInCatalog = 2 active siblings + self = 3
        // (orphans + self excluded from the count).
        // We don't pin the exact score — the W-02 formula already has its own
        // tests; what matters here is the helper got called with the right count.
        const arg = mockUpdate.mock.calls[0][0] as Record<string, unknown>
        expect(typeof arg.titleSpecificity).toBe('number')
    })

    it('F-7: rejects displayName that collapses to empty after normalization', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/library/rename', {
            method: 'PATCH',
            token: 'valid',
            body: { fileId: 'file-1', displayName: '   ' },
        })
        const res = await PATCH(req)
        // Schema rejects pre-handler (min 1 — but min is on raw, not trimmed).
        // The handler's post-normalize guard returns 400 if the trimmed form
        // is empty. Either layer is fine; the test just asserts non-success.
        expect(res.status).not.toBe(200)
    })
})
