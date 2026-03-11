import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { makeReq } from '@/__tests__/api-test-helpers'

// ── Configurable mock state ──

type MockDocEntry = { id: string; data: () => Record<string, unknown> }

// Per-test configuration
let existingAssignmentDocs: MockDocEntry[] = [] // for duplicate check
let setlistData: Record<string, unknown> = { tracks: [] }
let setlistExists = true
let musicianNotifPrefs: Record<string, unknown> = {} // default: all enabled
let addResult = { id: 'assignment-1' }
let setlistMusicians: Array<{ uid?: string; name: string; email: string }> = []

const mockUpdate = vi.fn()
const mockAdd = vi.fn(async (_data?: unknown) => addResult)
const mockNotificationAdd = vi.fn()

const makeChainable = (docs: MockDocEntry[]) => {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        get: vi.fn(async () => ({ empty: docs.length === 0, docs })),
        add: mockAdd,
    }
    return chain
}

const mockFirestoreLocal = {
    collection: vi.fn((name: string) => {
        if (name === 'scheduling_assignments') {
            return {
                where: vi.fn(() => ({
                    where: vi.fn(() => ({
                        limit: vi.fn(() => ({
                            get: vi.fn(async () => ({
                                empty: existingAssignmentDocs.length === 0,
                                docs: existingAssignmentDocs,
                            })),
                        })),
                    })),
                })),
                add: mockAdd,
                doc: vi.fn(() => ({
                    update: mockUpdate,
                })),
            }
        }
        if (name === 'setlists') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        exists: setlistExists,
                        data: () => ({ ...setlistData, musicians: setlistMusicians }),
                    })),
                    update: mockUpdate,
                })),
            }
        }
        if (name === 'users') {
            return {
                doc: vi.fn(() => ({
                    get: vi.fn(async () => ({
                        exists: true,
                        data: () => ({
                            musicianProfile: { notificationPreferences: musicianNotifPrefs },
                        }),
                    })),
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
        arrayUnion: vi.fn((...args: unknown[]) => ({ _arrayUnion: args })),
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
    sendSchedulingAssignmentSMS: (...args: unknown[]) => mockSendSMS(args[0]),
}))

vi.mock('@/lib/new-song-detector', () => ({
    detectNewSongs: vi.fn(async () => []),
}))

vi.mock('@/lib/constants', () => ({
    BASE_URL: 'http://localhost:3000',
}))

const mockSendPush = vi.fn((_uids?: unknown, _opts?: unknown) => Promise.resolve())
vi.mock('@/lib/push-send', () => ({
    sendPushToUsers: (...args: unknown[]) => mockSendPush(args[0], args[1]),
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

let POST: typeof import('@/app/api/scheduling/assign/route').POST

beforeAll(async () => {
    const mod = await import('@/app/api/scheduling/assign/route')
    POST = mod.POST
})

const validMusician = {
    uid: 'musician-1',
    name: 'Test Player',
    email: 'player@example.com',
    phone: '+15551234567',
    instrument: 'guitar',
    schedulingTier: 'regular' as const,
}

const validBody = {
    setlistId: 'setlist-1',
    setlistName: 'Shabbat Service',
    eventDate: '2026-03-15',
    musicians: [validMusician],
}

describe('POST /api/scheduling/assign', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        existingAssignmentDocs = []
        setlistData = { tracks: [] }
        setlistExists = true
        musicianNotifPrefs = {}
        addResult = { id: 'assignment-1' }
        setlistMusicians = []
    })

    it('assigns one musician with pending status and returns success', async () => {
        mockAuth('band_leader')
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        const res = await POST(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.assigned).toBe(1)
        expect(mockAdd).toHaveBeenCalled()
        const addCall = (mockAdd.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
        expect(addCall.status).toBe('pending')
        expect(addCall.autoConfirmed).toBe(false)
    })

    it('assigns core musician with confirmed status and autoConfirmed true', async () => {
        mockAuth('band_leader')
        const coreMusician = { ...validMusician, schedulingTier: 'core' as const }
        const req = makeReq('/api/scheduling/assign', {
            method: 'POST',
            token: 'valid',
            body: { ...validBody, musicians: [coreMusician] },
        })
        const res = await POST(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.assigned).toBe(1)
        const addCall = (mockAdd.mock.calls as unknown[][])[0]?.[0] as Record<string, unknown>
        expect(addCall.status).toBe('confirmed')
        expect(addCall.autoConfirmed).toBe(true)
    })

    it('skips duplicate assignment when musician already assigned', async () => {
        mockAuth('band_leader')
        existingAssignmentDocs = [{ id: 'existing-1', data: () => ({}) }]
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        const res = await POST(req)
        const json = await res.json()

        expect(json.success).toBe(true)
        expect(json.assigned).toBe(0)
        // add should not be called for scheduling_assignments (only the duplicate check query ran)
        expect(mockAdd).not.toHaveBeenCalled()
    })

    it('sends email when email notifications enabled (default)', async () => {
        mockAuth('band_leader')
        musicianNotifPrefs = {} // email defaults to true
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        await POST(req)
        // Wait for fire-and-forget promises
        await new Promise(r => setTimeout(r, 10))

        expect(mockSendEmail).toHaveBeenCalledWith(
            expect.objectContaining({
                to: 'player@example.com',
                setlistName: 'Shabbat Service',
                status: 'pending',
            })
        )
    })

    it('sends SMS when sms enabled and phone present', async () => {
        mockAuth('band_leader')
        musicianNotifPrefs = { sms: true }
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        await POST(req)
        await new Promise(r => setTimeout(r, 10))

        expect(mockSendSMS).toHaveBeenCalledWith(
            expect.objectContaining({
                to: '+15551234567',
                musicianName: 'Test Player',
            })
        )
    })

    it('skips SMS when musician has no phone', async () => {
        mockAuth('band_leader')
        musicianNotifPrefs = { sms: true }
        const noPhoneMusician = { ...validMusician, phone: undefined }
        const req = makeReq('/api/scheduling/assign', {
            method: 'POST',
            token: 'valid',
            body: { ...validBody, musicians: [noPhoneMusician] },
        })
        await POST(req)
        await new Promise(r => setTimeout(r, 10))

        expect(mockSendSMS).not.toHaveBeenCalled()
    })

    it('creates in-app notification when push enabled (default)', async () => {
        mockAuth('band_leader')
        musicianNotifPrefs = {} // push defaults to true
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        await POST(req)

        expect(mockNotificationAdd).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'scheduling_request',
                title: "You're scheduled to play",
            })
        )
    })

    it('syncs setlist musicians array with new musician', async () => {
        mockAuth('band_leader')
        setlistMusicians = []
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        await POST(req)

        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                musicians: expect.arrayContaining([
                    expect.objectContaining({ uid: 'musician-1', name: 'Test Player' }),
                ]),
            })
        )
    })

    it('sends FCM push notification', async () => {
        mockAuth('band_leader')
        musicianNotifPrefs = {} // push defaults to true
        const req = makeReq('/api/scheduling/assign', { method: 'POST', token: 'valid', body: validBody })
        await POST(req)
        await new Promise(r => setTimeout(r, 10))

        expect(mockSendPush).toHaveBeenCalledWith(
            ['musician-1'],
            expect.objectContaining({
                title: "You're scheduled to play",
                link: '/schedule',
            })
        )
    })
})
