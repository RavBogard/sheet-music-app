import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

const mockAssignmentUpdate = vi.fn()
const mockNotifAdd = vi.fn()
const mockSetlistUpdate = vi.fn()
let assignmentDoc: { exists: boolean; data: () => Record<string, unknown> | undefined }
let musicianPrefs: Record<string, unknown> | undefined
let setlistDoc: { exists: boolean; data: () => Record<string, unknown> | undefined }

// Ref-tagged docs so the transaction mock can route get() / update() by ref.
const ASSIGNMENT_REF = { __kind: 'assignment' as const }
const SETLIST_REF = { __kind: 'setlist' as const }

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'scheduling_assignments') {
            return {
                doc: vi.fn(() => ASSIGNMENT_REF),
            }
        }
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        exists: true,
                        data: () => ({
                            musicianProfile: { notificationPreferences: musicianPrefs },
                        }),
                    })),
                    collection: vi.fn(() => ({
                        add: mockNotifAdd,
                    })),
                })),
            }
        }
        if (name === 'setlists') {
            return {
                doc: vi.fn(() => SETLIST_REF),
            }
        }
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })) }
    }),
    runTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
        const transaction = {
            get: vi.fn(async (ref: { __kind: string }) => {
                if (ref.__kind === 'assignment') return assignmentDoc
                if (ref.__kind === 'setlist') return setlistDoc
                return { exists: false }
            }),
            update: vi.fn((ref: { __kind: string }, data: Record<string, unknown>) => {
                if (ref.__kind === 'assignment') mockAssignmentUpdate(ref, data)
                if (ref.__kind === 'setlist') mockSetlistUpdate(ref, data)
            }),
        }
        return fn(transaction)
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

vi.mock('@/lib/email-scheduling', () => ({
    sendSchedulingEmail: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/sms', () => ({
    sendSchedulingCancellationSMS: vi.fn(async () => ({ ok: true })),
}))

vi.mock('@/lib/constants', () => ({
    BASE_URL: 'https://centralreform.live',
}))

vi.mock('@/lib/push-send', () => ({
    sendPushToUsers: vi.fn(async () => ({})),
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'
import { sendSchedulingEmail } from '@/lib/email-scheduling'
import { sendSchedulingCancellationSMS } from '@/lib/sms'

function mockAuth(role: string, uid = 'leader-1') {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid,
        email: 'leader@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

// ── Tests ──

describe('POST /api/scheduling/unassign', () => {
    let POST: (req: NextRequest) => Promise<Response>

    beforeAll(async () => {
        const mod = await import('@/app/api/scheduling/unassign/route')
        POST = mod.POST
    })

    beforeEach(() => {
        vi.clearAllMocks()
        mockAuth('band_leader')
        mockAssignmentUpdate.mockResolvedValue(undefined)
        mockNotifAdd.mockResolvedValue(undefined)
        mockSetlistUpdate.mockResolvedValue(undefined)
        musicianPrefs = undefined // use defaults

        assignmentDoc = {
            exists: true,
            data: () => ({
                status: 'confirmed',
                musicianUid: 'musician-1',
                musicianEmail: 'musician@example.com',
                musicianName: 'Test Musician',
                musicianPhone: null,
                setlistName: 'Shabbat Service',
                setlistId: 'sl-1',
                eventDate: '2026-03-15',
            }),
        }

        setlistDoc = {
            exists: true,
            data: () => ({
                musicians: [{ uid: 'musician-1' }, { uid: 'musician-2' }],
            }),
        }
    })

    it('cancels assignment and updates status', async () => {
        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1' },
        })

        const res = await POST(req)
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json.success).toBe(true)
        expect(mockAssignmentUpdate).toHaveBeenCalledWith(
            expect.anything(), // assignmentRef (passed as first arg in transaction.update)
            {
                status: 'cancelled',
                respondedAt: 'mock-timestamp',
            }
        )
    })

    it('sends cancellation email by default', async () => {
        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1' },
        })

        await POST(req)

        // Email should be called (fire-and-forget)
        expect(sendSchedulingEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'musician@example.com',
                status: 'cancelled',
            })
        )
    })

    it('creates in-app notification for musician', async () => {
        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1' },
        })

        await POST(req)

        expect(mockNotifAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'scheduling_cancelled',
            })
        )
    })

    it('removes musician from setlist musicians array', async () => {
        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1' },
        })

        await POST(req)

        expect(mockSetlistUpdate).toHaveBeenCalledWith(
            expect.anything(), // setlistRef
            {
                musicians: [{ uid: 'musician-2' }],
                assignedUids: ['musician-2'],
            }
        )
    })

    it('returns 404 for missing assignments', async () => {
        assignmentDoc = { exists: false, data: () => undefined }

        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'missing' },
        })

        const res = await POST(req)
        expect(res.status).toBe(404)
    })

    it('skips SMS when musician has no phone', async () => {
        const req = makeReq('/api/scheduling/unassign', {
            method: 'POST',
            token: 'valid-token',
            body: { assignmentId: 'a1' },
        })

        await POST(req)

        expect(sendSchedulingCancellationSMS).not.toHaveBeenCalled()
    })
})
