/**
 * v4.4 Phase 2 — /api/profile/update fan-out regression suite (DL-010 musician side).
 *
 * Covers: displayName + phone source write, fan-out to scheduling_assignments
 * where musicianUid == uid, fan-out to assigner docs, partial updates, no-op
 * short-circuit, chunked batch fan-out for large accounts.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

const mockUserUpdate = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchCommit = vi.fn(async () => undefined)

let userData: Record<string, unknown> | undefined = {
    displayName: 'Old Name',
    musicianProfile: { phone: '+10000000000' },
}
let musicianAssignmentDocs: Array<{ ref: unknown; data: () => Record<string, unknown> }> = []
let assignerAssignmentDocs: Array<{ ref: unknown; data: () => Record<string, unknown> }> = []

type Ref = { __kind: 'assignmentRef'; id: string }
const makeRef = (id: string): Ref => ({ __kind: 'assignmentRef', id })

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({ exists: userData !== undefined, data: () => userData })),
                    update: mockUserUpdate,
                })),
            }
        }
        if (name === 'scheduling_assignments') {
            return {
                where: vi.fn((field: string, _op: unknown, value: unknown) => ({
                    get: vi.fn(async () => {
                        if (field === 'musicianUid' && value === 'u1') {
                            return { empty: musicianAssignmentDocs.length === 0, docs: musicianAssignmentDocs }
                        }
                        if (field === 'assignedBy' && value === 'u1') {
                            return { empty: assignerAssignmentDocs.length === 0, docs: assignerAssignmentDocs }
                        }
                        return { empty: true, docs: [] }
                    }),
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
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
        delete: vi.fn(() => '__DELETE__'),
    },
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { verifyIdToken } from '@/lib/firebase-admin'
import type { NextRequest } from 'next/server'

function mockAuth(uid = 'u1') {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: `${uid}@example.com`,
        role: 'musician',
        isAdmin: false,
        isBandLeader: false,
        isMusician: true,
        isMember: true,
    } as never)
}

let POST: (req: NextRequest) => Promise<Response>
beforeAll(async () => {
    POST = (await import('@/app/api/profile/update/route')).POST
})

beforeEach(() => {
    vi.clearAllMocks()
    mockBatchCommit.mockResolvedValue(undefined)
    userData = { displayName: 'Old Name', musicianProfile: { phone: '+10000000000' } }
    musicianAssignmentDocs = []
    assignerAssignmentDocs = []
    mockAuth('u1')
})

describe('POST /api/profile/update', () => {
    it('fans_out_displayName_to_musician_assignments', async () => {
        musicianAssignmentDocs = [
            { ref: makeRef('a1'), data: () => ({ status: 'pending' }) },
            { ref: makeRef('a2'), data: () => ({ status: 'confirmed' }) },
            { ref: makeRef('a3'), data: () => ({ status: 'declined' }) },
        ]

        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'New Name' },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(mockUserUpdate).toHaveBeenCalledWith({ displayName: 'New Name' })
        expect(json.updated.assignments).toBe(3)

        // Every assignment ref was updated with musicianName="New Name"
        const refs = (mockBatchUpdate.mock.calls as unknown[][]).map(c => (c[0] as Ref).id).sort()
        expect(refs).toEqual(['a1', 'a2', 'a3'])
        for (const call of mockBatchUpdate.mock.calls as unknown[][]) {
            expect(call[1]).toMatchObject({ musicianName: 'New Name' })
        }
    })

    it('fans_out_displayName_to_assigner_assignments', async () => {
        assignerAssignmentDocs = [
            { ref: makeRef('b1'), data: () => ({}) },
            { ref: makeRef('b2'), data: () => ({}) },
        ]

        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'Rabbi New' },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.updated.assigner).toBe(2)
        const assignerCalls = (mockBatchUpdate.mock.calls as unknown[][])
            .filter(c => (c[1] as Record<string, unknown>).assignedByName === 'Rabbi New')
        expect(assignerCalls).toHaveLength(2)
    })

    it('fans_out_phone_independently_no_musicianName_writes', async () => {
        musicianAssignmentDocs = [{ ref: makeRef('a1'), data: () => ({}) }]

        await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { phone: '+15559999999' },
        }))

        expect(mockUserUpdate).toHaveBeenCalledWith({ 'musicianProfile.phone': '+15559999999' })
        const call = (mockBatchUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(call).toMatchObject({ musicianPhone: '+15559999999' })
        expect(call.musicianName).toBeUndefined()
    })

    it('fans_out_both_fields_single_batch_payload', async () => {
        musicianAssignmentDocs = [{ ref: makeRef('a1'), data: () => ({}) }]

        await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'N', phone: '+15551111111' },
        }))

        const call = (mockBatchUpdate.mock.calls[0] as unknown[])[1] as Record<string, unknown>
        expect(call).toMatchObject({ musicianName: 'N', musicianPhone: '+15551111111' })
    })

    it('partial_no_change_is_noop', async () => {
        // displayName already matches current
        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'Old Name' },
        }))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.updated.assignments).toBe(0)
        expect(json.updated.assigner).toBe(0)
        expect(mockUserUpdate).not.toHaveBeenCalled()
        expect(mockBatchUpdate).not.toHaveBeenCalled()
    })

    it('chunks_large_fan_out', async () => {
        // 900 assignments → 3 chunks (400 + 400 + 100)
        musicianAssignmentDocs = Array.from({ length: 900 }, (_, i) => ({
            ref: makeRef(`a${i}`),
            data: () => ({}),
        }))

        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: { displayName: 'Big' },
        }))
        const json = await res.json()

        expect(json.updated.assignments).toBe(900)
        // mockFirestoreLocal.batch() should have been called 3 times
        expect(mockFirestoreLocal.batch).toHaveBeenCalledTimes(3)
        expect(mockBatchUpdate).toHaveBeenCalledTimes(900)
    })

    it('rejects_empty_body', async () => {
        const res = await POST(makeReq('/api/profile/update', {
            method: 'POST', token: 'v', body: {},
        }))
        expect(res.status).toBe(400)
    })
})
