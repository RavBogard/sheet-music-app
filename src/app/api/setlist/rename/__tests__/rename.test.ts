/**
 * v4.4 Phase 2 — /api/setlist/rename fan-out regression suite (DL-010 setlist side).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

const mockSetlistUpdate = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchCommit = vi.fn(async () => undefined)

type SetlistShape = { exists: boolean; data: () => Record<string, unknown> | undefined }
let setlistDoc: SetlistShape = { exists: false, data: () => undefined }
let assignmentDocs: Array<{ ref: unknown; data: () => Record<string, unknown> }> = []

type Ref = { __kind: 'assignmentRef'; id: string }
const makeRef = (id: string): Ref => ({ __kind: 'assignmentRef', id })

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'setlists') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => setlistDoc),
                    update: mockSetlistUpdate,
                })),
            }
        }
        if (name === 'scheduling_assignments') {
            return {
                where: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        empty: assignmentDocs.length === 0,
                        docs: assignmentDocs,
                    })),
                })),
            }
        }
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) }
    }),
    batch: vi.fn(() => ({
        update: mockBatchUpdate,
        commit: mockBatchCommit,
    })),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP') },
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { verifyIdToken } from '@/lib/firebase-admin'
import type { NextRequest } from 'next/server'

function mockAuth(role: string, uid = 'leader-1') {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: `${uid}@example.com`,
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: true,
    } as never)
}

let POST: (req: NextRequest) => Promise<Response>
beforeAll(async () => {
    POST = (await import('@/app/api/setlist/rename/route')).POST
})

beforeEach(() => {
    vi.clearAllMocks()
    mockBatchCommit.mockResolvedValue(undefined)
    setlistDoc = { exists: false, data: () => undefined }
    assignmentDocs = []
})

describe('POST /api/setlist/rename', () => {
    it('rename_updates_setlist_and_fans_out', async () => {
        mockAuth('band_leader', 'leader-1')
        setlistDoc = {
            exists: true,
            data: () => ({ name: 'Old', ownerId: 'leader-1' }),
        }
        assignmentDocs = [
            { ref: makeRef('a1'), data: () => ({}) },
            { ref: makeRef('a2'), data: () => ({}) },
            { ref: makeRef('a3'), data: () => ({}) },
        ]

        const res = await POST(makeReq('/api/setlist/rename', {
            method: 'POST', token: 'v', body: { setlistId: 's1', name: 'New' },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.updated.assignments).toBe(3)
        expect(mockSetlistUpdate).toHaveBeenCalledWith({
            name: 'New',
            updatedAt: 'SERVER_TIMESTAMP',
        })
        for (const call of mockBatchUpdate.mock.calls as unknown[][]) {
            expect(call[1]).toEqual({ setlistName: 'New' })
        }
    })

    it('rename_noop_when_name_unchanged', async () => {
        mockAuth('band_leader', 'leader-1')
        setlistDoc = {
            exists: true,
            data: () => ({ name: 'Same', ownerId: 'leader-1' }),
        }
        assignmentDocs = [{ ref: makeRef('a1'), data: () => ({}) }]

        const res = await POST(makeReq('/api/setlist/rename', {
            method: 'POST', token: 'v', body: { setlistId: 's1', name: 'Same' },
        }))
        const json = await res.json()

        expect(json.updated.assignments).toBe(0)
        expect(mockSetlistUpdate).not.toHaveBeenCalled()
        expect(mockBatchUpdate).not.toHaveBeenCalled()
    })

    it('rename_403_for_non_owner_non_leader', async () => {
        mockAuth('musician', 'musician-1')
        setlistDoc = {
            exists: true,
            data: () => ({ name: 'Old', ownerId: 'someone-else' }),
        }
        // Musician role would normally be blocked by createApiHandler's role:'band_leader'
        // gate before reaching the handler. That upstream block returns 403 too.
        const res = await POST(makeReq('/api/setlist/rename', {
            method: 'POST', token: 'v', body: { setlistId: 's1', name: 'Hack' },
        }))
        expect(res.status).toBe(403)
        expect(mockSetlistUpdate).not.toHaveBeenCalled()
    })

    it('rename_band_leader_can_rename_others_setlist', async () => {
        mockAuth('band_leader', 'leader-2')
        setlistDoc = {
            exists: true,
            data: () => ({ name: 'Old', ownerId: 'leader-1' }),
        }
        assignmentDocs = [{ ref: makeRef('a1'), data: () => ({}) }]

        const res = await POST(makeReq('/api/setlist/rename', {
            method: 'POST', token: 'v', body: { setlistId: 's1', name: 'New' },
        }))
        expect(res.status).toBe(200)
        expect(mockSetlistUpdate).toHaveBeenCalled()
    })

    it('rename_404_for_missing_setlist', async () => {
        mockAuth('band_leader', 'leader-1')
        setlistDoc = { exists: false, data: () => undefined }

        const res = await POST(makeReq('/api/setlist/rename', {
            method: 'POST', token: 'v', body: { setlistId: 'missing', name: 'N' },
        }))
        expect(res.status).toBe(404)
    })
})
