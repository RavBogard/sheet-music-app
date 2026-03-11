import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

const mockAssignmentUpdate = vi.fn()
const mockNotifAdd = vi.fn()
const mockSetlistUpdate = vi.fn()
let assignmentDoc: { exists: boolean; data: () => Record<string, unknown> | undefined }
let setlistDoc: { exists: boolean; data: () => Record<string, unknown> | undefined }

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'scheduling_assignments') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => assignmentDoc),
                    update: mockAssignmentUpdate,
                })),
            }
        }
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    collection: vi.fn(() => ({
                        add: mockNotifAdd,
                    })),
                })),
            }
        }
        if (name === 'setlists') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => setlistDoc),
                    update: mockSetlistUpdate,
                })),
            }
        }
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) }
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: { serverTimestamp: vi.fn(() => 'mock-timestamp') },
}))

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string, uid = 'user123') {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: 'test@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

// ── Tests ──

describe('POST /api/scheduling/respond', () => {
    let POST: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/respond/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockAuth('musician', 'musician-1')
        mockAssignmentUpdate.mockResolvedValue(undefined)
        mockNotifAdd.mockResolvedValue(undefined)
        mockSetlistUpdate.mockResolvedValue(undefined)

        assignmentDoc = {
            exists: true,
            data: () => ({
                musicianUid: 'musician-1',
                status: 'pending',
                assignedBy: 'leader-1',
                musicianName: 'Test Musician',
                setlistName: 'Shabbat Service',
                setlistId: 'sl-1',
            }),
        }

        setlistDoc = {
            exists: true,
            data: () => ({
                musicians: [{ uid: 'musician-1' }, { uid: 'musician-2' }],
            }),
        }
    })

    it('accepts an assignment and updates status to confirmed', async () => {
        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1', action: 'accept' },
        })

        const res = await POST(req)
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(json.status).toBe('confirmed')
        expect(mockAssignmentUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'confirmed', respondedAt: 'mock-timestamp' })
        )
    })

    it('declines an assignment and removes musician from setlist', async () => {
        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1', action: 'decline', declineReason: 'Out of town' },
        })

        const res = await POST(req)
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.status).toBe('declined')
        expect(mockAssignmentUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'declined',
                declineReason: 'Out of town',
            })
        )
        // Should remove musician from setlist
        expect(mockSetlistUpdate).toHaveBeenCalledWith({
            musicians: [{ uid: 'musician-2' }],
        })
    })

    it('creates notification for assigner on respond', async () => {
        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1', action: 'accept' },
        })

        await POST(req)

        expect(mockNotifAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'scheduling_confirmed',
                title: 'Assignment confirmed',
            })
        )
    })

    it('returns 404 for missing assignments', async () => {
        assignmentDoc = { exists: false, data: () => undefined }

        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'missing', action: 'accept' },
        })

        const res = await POST(req)
        expect(res.status).toBe(404)
    })

    it('returns 403 when responding to another user\'s assignment', async () => {
        assignmentDoc = {
            exists: true,
            data: () => ({
                musicianUid: 'other-user',
                status: 'pending',
            }),
        }

        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1', action: 'accept' },
        })

        const res = await POST(req)
        expect(res.status).toBe(403)
    })

    it('returns 400 when assignment is not pending', async () => {
        assignmentDoc = {
            exists: true,
            data: () => ({
                musicianUid: 'musician-1',
                status: 'confirmed',
            }),
        }

        const req = makeReq('/api/scheduling/respond', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1', action: 'accept' },
        })

        const res = await POST(req)
        expect(res.status).toBe(400)
    })
})
