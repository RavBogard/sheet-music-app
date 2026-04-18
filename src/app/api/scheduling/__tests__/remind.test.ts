import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }

let pendingAssignments: MockDocEntry[] = []
const mockNotificationAdd = vi.fn()

const makeChainable = (docs: MockDocEntry[]) => {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: vi.fn(async () => ({ empty: docs.length === 0, docs })),
    }
    return chain
}

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'scheduling_assignments') {
            return makeChainable(pendingAssignments)
        }
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    collection: vi.fn(() => ({
                        add: mockNotificationAdd,
                    })),
                })),
            }
        }
        return makeChainable([])
    }),
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestoreLocal),
    verifyIdToken: vi.fn(),
}))

vi.mock('firebase-admin/firestore', () => ({
    FieldValue: {
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    },
}))

vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: vi.fn(() => null),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const mockSendEmail = vi.fn((_opts?: unknown) => Promise.resolve({ ok: true }))
vi.mock('@/lib/email-scheduling', () => ({
    sendSchedulingEmail: (...args: unknown[]) => mockSendEmail(args[0]),
}))

const mockSendSMS = vi.fn((_opts?: unknown) => Promise.resolve({ ok: true }))
vi.mock('@/lib/sms', () => ({
    sendSchedulingReminderSMS: (...args: unknown[]) => mockSendSMS(args[0]),
}))

vi.mock('@/lib/constants', () => ({
    BASE_URL: 'http://localhost:3000',
}))

// ── Import after mocks ──

import { verifyIdToken } from '@/lib/firebase-admin'

function mockAuth(role: string) {
    vi.mocked(verifyIdToken).mockResolvedValue({
        uid: 'leader-1',
        email: 'leader@example.com',
        role,
        isAdmin: role === 'admin',
        isBandLeader: role === 'band_leader' || role === 'admin',
        isMusician: ['musician', 'band_leader', 'admin'].includes(role),
        isMember: role !== 'pending',
    } as never)
}

// ── Tests ──

let POST: typeof import('@/app/api/scheduling/remind/route').POST

beforeAll(async () => {
    const mod = await import('@/app/api/scheduling/remind/route')
    POST = mod.POST
})

function makePendingAssignment(overrides: Record<string, unknown> = {}): MockDocEntry {
    return {
        id: overrides.id as string || 'assignment-1',
        data: () => ({
            musicianEmail: 'player@example.com',
            musicianName: 'Test Player',
            musicianPhone: '+15551234567',
            musicianUid: 'musician-1',
            setlistName: 'Shabbat Service',
            instrument: 'guitar',
            eventDate: '2026-03-15',
            status: 'pending',
            ...overrides,
        }),
    }
}

describe('POST /api/scheduling/remind', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        pendingAssignments = []
    })

    it('sends reminders for pending assignments with setlistId', async () => {
        mockAuth('band_leader')
        pendingAssignments = [makePendingAssignment()]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.reminded).toBe(1)
        expect(mockSendEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'player@example.com',
                status: 'pending',
            })
        )
        expect(mockNotificationAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'scheduling_reminder',
                title: 'Service reminder',
            })
        )
    })

    it('returns reminded count, emailsSent, smsSent in response', async () => {
        mockAuth('band_leader')
        pendingAssignments = [makePendingAssignment()]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.reminded).toBe(1)
        expect(json.emailsSent).toBe(1)
        expect(json.smsSent).toBe(1)
    })

    it('skips SMS when musician has no phone', async () => {
        mockAuth('band_leader')
        pendingAssignments = [makePendingAssignment({ musicianPhone: null })]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.smsSent).toBe(0)
        expect(mockSendSMS).not.toHaveBeenCalled()
    })

    it('sends reminders for multiple pending assignments', async () => {
        mockAuth('band_leader')
        pendingAssignments = [
            makePendingAssignment({ id: 'a1', musicianEmail: 'player1@example.com', musicianUid: 'uid-1' }),
            makePendingAssignment({ id: 'a2', musicianEmail: 'player2@example.com', musicianUid: 'uid-2' }),
        ]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.reminded).toBe(2)
        expect(json.emailsSent).toBe(2)
        expect(mockSendEmail).toHaveBeenCalledTimes(2)
        expect(mockNotificationAdd).toHaveBeenCalledTimes(2)
    })

    it('continues sending when email fails for one musician', async () => {
        mockAuth('band_leader')
        mockSendEmail.mockRejectedValueOnce(new Error('SMTP error'))
        pendingAssignments = [
            makePendingAssignment({ id: 'a1', musicianEmail: 'fail@example.com', musicianUid: 'uid-1' }),
            makePendingAssignment({ id: 'a2', musicianEmail: 'ok@example.com', musicianUid: 'uid-2' }),
        ]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.reminded).toBe(2)
        // First email failed, second succeeded
        expect(json.emailsSent).toBe(1)
        expect(mockSendEmail).toHaveBeenCalledTimes(2)
    })

    it('returns zero counts when no pending assignments exist', async () => {
        mockAuth('band_leader')
        pendingAssignments = []
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.reminded).toBe(0)
        expect(json.emailsSent).toBe(0)
        expect(json.smsSent).toBe(0)
        expect(mockSendEmail).not.toHaveBeenCalled()
    })

    it('creates in-app notification with instrument text', async () => {
        mockAuth('band_leader')
        pendingAssignments = [makePendingAssignment({ instrument: 'trumpet' })]
        const req = makeReq('/api/scheduling/remind', {
            method: 'POST',
            token: 'valid',
            body: { setlistId: 'setlist-1' },
        })
        await POST(req)

        expect(mockNotificationAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                body: expect.stringContaining('on trumpet'),
            })
        )
    })
})
