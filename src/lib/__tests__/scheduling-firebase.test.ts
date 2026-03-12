import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let capturedOnNext: Function
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
let capturedOnError: Function | undefined

const mockOnSnapshot = vi.fn((...args: any[]) => {
    capturedOnNext = args[1]
    capturedOnError = args[2]
    return vi.fn() // unsubscribe
})
const mockCollection = vi.fn((...args: any[]) => ({ __ref: 'collection', args }))
const mockQuery = vi.fn((...args: any[]) => ({ __ref: 'query', args }))
const mockWhere = vi.fn((...args: any[]) => ({ __ref: 'where', args }))
const mockOrderBy = vi.fn((...args: any[]) => ({ __ref: 'orderBy', args }))
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn((...args: any[]) => ({ __ref: 'doc', args }))
const mockTimestampFromDate = vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000) }))

vi.mock('firebase/firestore', () => ({
    collection: (...args: any[]) => mockCollection(...args),
    query: (...args: any[]) => mockQuery(...args),
    where: (...args: any[]) => mockWhere(...args),
    orderBy: (...args: any[]) => mockOrderBy(...args),
    onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
    updateDoc: (...args: any[]) => mockUpdateDoc(...args),
    doc: (...args: any[]) => mockDoc(...args),
    Timestamp: { fromDate: (d: Date) => mockTimestampFromDate(d) },
}))

vi.mock('@/lib/firebase', () => ({
    db: { __mock: true },
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const mockApiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// ── Import after mocks ──

import {
    subscribeToMyAssignments,
    subscribeToSetlistAssignments,
    subscribeToAllUpcomingAssignments,
    subscribeToUpcomingSetlists,
    assignMusicians,
    respondToAssignment,
    unassignMusician,
    generateCalendarFeedToken,
} from '@/lib/scheduling-firebase'

// ── Helpers ──

function makeSnapDocs(items: Array<{ id: string; data: Record<string, unknown> }>) {
    return {
        docs: items.map(item => ({
            id: item.id,
            data: () => item.data,
        })),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue({
        json: async () => ({ success: true }),
    })
    mockUpdateDoc.mockResolvedValue(undefined)
})

// ── Subscription Tests ──

describe('subscribeToMyAssignments', () => {
    it('calls query with correct where/orderBy args', () => {
        const cb = vi.fn()
        subscribeToMyAssignments('user-1', cb)

        expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'scheduling_assignments')
        expect(mockWhere).toHaveBeenCalledWith('musicianUid', '==', 'user-1')
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['pending', 'confirmed'])
        expect(mockOrderBy).toHaveBeenCalledWith('assignedAt', 'desc')
        expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    })

    it('maps snapshot docs to assignment array', () => {
        const cb = vi.fn()
        subscribeToMyAssignments('user-1', cb)

        capturedOnNext(makeSnapDocs([
            { id: 'a1', data: { musicianUid: 'user-1', status: 'confirmed' } },
            { id: 'a2', data: { musicianUid: 'user-1', status: 'pending' } },
        ]))

        expect(cb).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'a1', musicianUid: 'user-1' }),
            expect.objectContaining({ id: 'a2', status: 'pending' }),
        ])
    })

    it('calls callback with [] on snapshot error', () => {
        const cb = vi.fn()
        subscribeToMyAssignments('user-1', cb)

        capturedOnError!(new Error('fail'))

        expect(cb).toHaveBeenCalledWith([])
    })

    it('returns an unsubscribe function', () => {
        const cb = vi.fn()
        const unsub = subscribeToMyAssignments('user-1', cb)
        expect(typeof unsub).toBe('function')
    })
})

describe('subscribeToSetlistAssignments', () => {
    it('calls query with correct where args', () => {
        const cb = vi.fn()
        subscribeToSetlistAssignments('setlist-1', cb)

        expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'scheduling_assignments')
        expect(mockWhere).toHaveBeenCalledWith('setlistId', '==', 'setlist-1')
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['pending', 'confirmed', 'declined'])
        expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
    })

    it('maps snapshot docs to assignment array', () => {
        const cb = vi.fn()
        subscribeToSetlistAssignments('setlist-1', cb)

        capturedOnNext(makeSnapDocs([
            { id: 'a1', data: { setlistId: 'setlist-1', status: 'confirmed' } },
        ]))

        expect(cb).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'a1', setlistId: 'setlist-1' }),
        ])
    })

    it('calls callback with [] on error', () => {
        const cb = vi.fn()
        subscribeToSetlistAssignments('setlist-1', cb)

        capturedOnError!(new Error('fail'))
        expect(cb).toHaveBeenCalledWith([])
    })

    it('returns an unsubscribe function', () => {
        const cb = vi.fn()
        const unsub = subscribeToSetlistAssignments('setlist-1', cb)
        expect(typeof unsub).toBe('function')
    })
})

describe('subscribeToAllUpcomingAssignments', () => {
    it('calls query with correct where/orderBy args', () => {
        const cb = vi.fn()
        subscribeToAllUpcomingAssignments(cb)

        expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'scheduling_assignments')
        expect(mockWhere).toHaveBeenCalledWith('status', 'in', ['pending', 'confirmed'])
        expect(mockOrderBy).toHaveBeenCalledWith('assignedAt', 'desc')
    })

    it('maps snapshot docs to assignment array', () => {
        const cb = vi.fn()
        subscribeToAllUpcomingAssignments(cb)

        capturedOnNext(makeSnapDocs([
            { id: 'a1', data: { status: 'pending' } },
            { id: 'a2', data: { status: 'confirmed' } },
        ]))

        expect(cb).toHaveBeenCalledWith([
            expect.objectContaining({ id: 'a1' }),
            expect.objectContaining({ id: 'a2' }),
        ])
    })

    it('calls callback with [] on error', () => {
        const cb = vi.fn()
        subscribeToAllUpcomingAssignments(cb)

        capturedOnError!(new Error('fail'))
        expect(cb).toHaveBeenCalledWith([])
    })
})

describe('subscribeToUpcomingSetlists', () => {
    it('queries setlists collection with isPublic and eventDate filters', () => {
        const cb = vi.fn()
        subscribeToUpcomingSetlists(cb)

        expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'setlists')
        expect(mockWhere).toHaveBeenCalledWith('isPublic', '==', true)
        expect(mockWhere).toHaveBeenCalledWith('eventDate', '>=', expect.anything())
        expect(mockOrderBy).toHaveBeenCalledWith('eventDate', 'asc')
    })

    it('maps snapshot docs to setlist array with id, name, eventDate', () => {
        const cb = vi.fn()
        subscribeToUpcomingSetlists(cb)

        capturedOnNext(makeSnapDocs([
            { id: 's1', data: { name: 'Shabbat Service', eventDate: { seconds: 9999 } } },
            { id: 's2', data: { eventDate: { seconds: 10000 } } },
        ]))

        expect(cb).toHaveBeenCalledWith([
            { id: 's1', name: 'Shabbat Service', eventDate: { seconds: 9999 } },
            { id: 's2', name: 'Untitled', eventDate: { seconds: 10000 } },
        ])
    })

    it('calls callback with [] on error', () => {
        const cb = vi.fn()
        subscribeToUpcomingSetlists(cb)

        capturedOnError!(new Error('fail'))
        expect(cb).toHaveBeenCalledWith([])
    })
})

// ── API Wrapper Tests ──

describe('assignMusicians', () => {
    it('sends POST to /api/scheduling/assign with full params', async () => {
        const params = {
            setlistId: 'sl-1',
            setlistName: 'Shabbat',
            eventDate: '2026-03-15',
            musicians: [{ uid: 'u1', name: 'Test', email: 'a@b.com' }],
        }

        const result = await assignMusicians(params)

        expect(mockApiFetch).toHaveBeenCalledWith('/api/scheduling/assign', {
            method: 'POST',
            body: JSON.stringify(params),
        })
        expect(result).toEqual({ success: true })
    })
})

describe('respondToAssignment', () => {
    it('sends POST to /api/scheduling/respond', async () => {
        const params = { assignmentId: 'a1', action: 'accept' as const }

        const result = await respondToAssignment(params)

        expect(mockApiFetch).toHaveBeenCalledWith('/api/scheduling/respond', {
            method: 'POST',
            body: JSON.stringify(params),
        })
        expect(result).toEqual({ success: true })
    })
})

describe('unassignMusician', () => {
    it('sends POST to /api/scheduling/unassign with { assignmentId }', async () => {
        const result = await unassignMusician('a1')

        expect(mockApiFetch).toHaveBeenCalledWith('/api/scheduling/unassign', {
            method: 'POST',
            body: JSON.stringify({ assignmentId: 'a1' }),
        })
        expect(result).toEqual({ success: true })
    })
})

// ── generateCalendarFeedToken Tests ──

describe('generateCalendarFeedToken', () => {
    beforeEach(() => {
        // Mock crypto.getRandomValues for deterministic output
        vi.stubGlobal('crypto', {
            getRandomValues: (arr: Uint8Array) => {
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = i % 256
                }
                return arr
            },
        })
    })

    it('generates a 48-character hex string', async () => {
        const token = await generateCalendarFeedToken('user-1')

        expect(token).toHaveLength(48)
        expect(/^[0-9a-f]{48}$/.test(token)).toBe(true)
    })

    it('calls updateDoc on users/{uid} with calendarFeedToken', async () => {
        await generateCalendarFeedToken('user-1')

        expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'users', 'user-1')
        expect(mockUpdateDoc).toHaveBeenCalledWith(
            expect.anything(),
            { 'musicianProfile.calendarFeedToken': expect.any(String) }
        )
    })

    it('returns the generated token', async () => {
        const token = await generateCalendarFeedToken('user-1')

        expect(typeof token).toBe('string')
        expect(token.length).toBe(48)

        // Verify it matches what was saved
        const savedToken = mockUpdateDoc.mock.calls[0][1]['musicianProfile.calendarFeedToken']
        expect(token).toBe(savedToken)
    })
})
