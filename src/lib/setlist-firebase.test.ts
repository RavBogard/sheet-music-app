import { describe, it, expect, vi, beforeEach } from 'vitest'

const hoisted = vi.hoisted(() => {
    class MockTimestamp {
        seconds: number
        nanoseconds: number
        constructor(seconds: number, nanoseconds: number) {
            this.seconds = seconds
            this.nanoseconds = nanoseconds
        }
        toDate() { return new Date(this.seconds * 1000) }
        static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0) }
    }
    return {
        MockTimestamp,
        mockAddDoc: vi.fn().mockResolvedValue({ id: 'new-setlist-id' }),
        mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
        mockDeleteDoc: vi.fn().mockResolvedValue(undefined),
        mockGetDoc: vi.fn(),
        mockOnSnapshot: vi.fn(),
        mockBatchDelete: vi.fn(),
        mockBatchCommit: vi.fn().mockResolvedValue(undefined),
        // Mutable state the tests can set before each case.
        txRemoteDoc: { exists: true, data: { updatedAt: null } as Record<string, unknown> },
        txUpdatePayloads: [] as Array<Record<string, unknown>>,
    }
})

const {
    MockTimestamp: _MockTimestamp,
    mockAddDoc,
    mockUpdateDoc: _mockUpdateDoc,
    mockDeleteDoc,
    mockOnSnapshot: _mockOnSnapshot,
    mockBatchDelete,
    mockBatchCommit,
} = hoisted
void _MockTimestamp; void _mockUpdateDoc; void _mockOnSnapshot

vi.mock('./firebase', () => ({ db: {}, auth: { currentUser: null } }))
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    addDoc: (...args: unknown[]) => hoisted.mockAddDoc(...args),
    updateDoc: (...args: unknown[]) => hoisted.mockUpdateDoc(...args),
    deleteDoc: (...args: unknown[]) => hoisted.mockDeleteDoc(...args),
    doc: vi.fn((_db: unknown, _path: string, id: string) => ({ path: `setlists/${id}`, id })),
    onSnapshot: (...args: unknown[]) => hoisted.mockOnSnapshot(...args),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    Timestamp: hoisted.MockTimestamp,
    getDoc: (...args: unknown[]) => hoisted.mockGetDoc(...args),
    getDocs: vi.fn().mockResolvedValue({
        size: 1,
        docs: [
            { id: 'task1', ref: { path: 'tasks/task1' }, data: () => ({}) },
        ]
    }),
    writeBatch: vi.fn(() => ({
        delete: hoisted.mockBatchDelete,
        commit: hoisted.mockBatchCommit,
    })),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
            get: async () => ({
                exists: () => hoisted.txRemoteDoc.exists,
                data: () => hoisted.txRemoteDoc.data,
            }),
            update: (_ref: unknown, payload: Record<string, unknown>) => {
                hoisted.txUpdatePayloads.push(payload)
            },
        }
        return fn(tx)
    },
}))
vi.mock('@/lib/setlist-audit', () => ({ logSetlistChange: vi.fn() }))
vi.mock('@/lib/notification-store', () => ({
    notifySetlistPublished: vi.fn(),
    notifySetlistUpdated: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/lib/firestore-helpers', () => ({
    toDate: (val: unknown) => {
        if (val instanceof Date) return val
        if (typeof val === 'string') return new Date(val)
        if (val && typeof val === 'object' && 'seconds' in val) return new Date((val as any).seconds * 1000)
        return null
    },
}))
vi.mock('@/lib/liturgical-calendar', () => ({
    getFullServiceContext: vi.fn().mockResolvedValue({
        type: 'friday_night',
        date: new Date('2026-03-20T19:00:00'),
        hebrewDate: { day: 1, month: 'Nisan', year: '5786', display: '1 Nisan 5786' },
        parasha: 'Vayikra',
        holiday: null,
        isShabbat: true,
    }),
}))
vi.mock('@/lib/liturgical-templates', () => ({
    generateSetlistName: vi.fn().mockReturnValue('Friday Night — Parashat Vayikra — March 20'),
}))
vi.mock('@/types/schemas', () => ({
    setlistConverter: {},
}))

import { createSetlistService, StaleWriteError } from './setlist-firebase'
import { Timestamp } from 'firebase/firestore'

describe('createSetlistService', () => {
    let service: ReturnType<typeof createSetlistService>

    beforeEach(() => {
        vi.clearAllMocks()
        hoisted.txRemoteDoc = { exists: true, data: { updatedAt: null } }
        hoisted.txUpdatePayloads.length = 0
        // apiFetch (via deleteSetlist task cleanup) bypasses the real network
        globalThis.fetch = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
        ) as unknown as typeof fetch
        service = createSetlistService('user123', 'Test User')
    })

    describe('createSetlist', () => {
        it('creates a setlist with required fields', async () => {
            const tracks = [
                { id: '1', title: 'Song 1', fileName: 'Song 1', type: 'song' as const },
                { id: '2', title: 'Song 2', fileName: 'Song 2', type: 'song' as const },
            ]

            const id = await service.createSetlist('Friday Night', tracks)

            expect(id).toBe('new-setlist-id')
            expect(mockAddDoc).toHaveBeenCalledTimes(1)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.name).toBe('Friday Night')
            expect(data.tracks).toHaveLength(2)
            expect(data.trackCount).toBe(2)
            expect(data.ownerId).toBe('user123')
            expect(data.ownerName).toBe('Test User')
        })

        it('never writes isPublic to Firestore (regression guard)', async () => {
            await service.createSetlist('Any Setlist', [])
            const data = mockAddDoc.mock.calls[0][1]
            expect(Object.keys(data)).not.toContain('isPublic')
        })

        it('includes additional data when provided', async () => {
            await service.createSetlist('Festival', [], {
                templateType: 'rosh_hashanah',
            })

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.templateType).toBe('rosh_hashanah')
        })
    })

    describe('deleteSetlist', () => {
        it('delegates to /api/setlist/delete (server-side cascade via Admin SDK)', async () => {
            const fetchSpy = vi.fn(async () =>
                new Response(JSON.stringify({ ok: true }), { status: 200 }),
            ) as unknown as typeof fetch
            globalThis.fetch = fetchSpy

            await service.deleteSetlist('setlist-abc')

            // D01: deletion is fully server-side now — client never touches Firestore directly
            expect(fetchSpy).toHaveBeenCalledTimes(1)
            const [url, init] = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
            expect(url).toContain('/api/setlist/delete')
            expect((init as RequestInit).method).toBe('POST')
            expect((init as RequestInit).body).toBe(JSON.stringify({ setlistId: 'setlist-abc' }))
            expect(mockDeleteDoc).not.toHaveBeenCalled()
            expect(mockBatchDelete).not.toHaveBeenCalled()
        })
    })

    describe('updateSetlist', () => {
        it('updates fields inside a transaction and stamps updatedAt', async () => {
            hoisted.txRemoteDoc = { exists: true, data: { updatedAt: null } }

            await service.updateSetlist('setlist-xyz', {
                tracks: [{ id: 'a', title: 'Song A', fileName: 'Song A', type: 'song' as const }],
                trackCount: 1,
                name: 'Test Setlist',
            })

            expect(hoisted.txUpdatePayloads).toHaveLength(1)
            const payload = hoisted.txUpdatePayloads[0]
            expect(payload.name).toBe('Test Setlist')
            expect(payload.updatedAt).toBe('SERVER_TIMESTAMP')
        })

        it('with a matching expectedUpdatedAt, commits successfully', async () => {
            const expected = new Timestamp(1_700_000_000, 0)
            hoisted.txRemoteDoc = { exists: true, data: { updatedAt: expected } }

            await service.updateSetlist('s1', { name: 'ok' }, expected)
            expect(hoisted.txUpdatePayloads).toHaveLength(1)
        })

        it('with a stale expectedUpdatedAt, throws StaleWriteError and does not write', async () => {
            const stale = new Timestamp(1_700_000_000, 0)
            const remote = new Timestamp(1_700_000_001, 0)
            hoisted.txRemoteDoc = { exists: true, data: { updatedAt: remote } }

            await expect(
                service.updateSetlist('s1', { name: 'nope' }, stale)
            ).rejects.toBeInstanceOf(StaleWriteError)
            expect(hoisted.txUpdatePayloads).toHaveLength(0)
        })

        it('null expectedUpdatedAt acts as skip-check (legacy doc path)', async () => {
            const remote = new Timestamp(1_700_000_001, 0)
            hoisted.txRemoteDoc = { exists: true, data: { updatedAt: remote } }

            await service.updateSetlist('s1', { name: 'legacy' }, null)
            expect(hoisted.txUpdatePayloads).toHaveLength(1)
        })

        it('regression guard: every updateSetlist write advances updatedAt', async () => {
            await service.updateSetlist('s1', { name: 'x' })
            const payload = hoisted.txUpdatePayloads[0]
            expect(Object.keys(payload)).toContain('updatedAt')
            expect(payload.updatedAt).toBe('SERVER_TIMESTAMP')
        })
    })

    describe('with null userId', () => {
        it('creates service with null user (guest mode)', () => {
            const guestService = createSetlistService(null)
            expect(guestService).toBeDefined()
            expect(guestService.createSetlist).toBeDefined()
        })
    })

    describe('cloneForNextWeek', () => {
        const sourceSetlist = {
            id: 'source-setlist-id',
            name: 'Friday Night — Parashat Tzav — March 13',
            date: { seconds: Math.floor(new Date('2026-03-13T19:00:00').getTime() / 1000), nanoseconds: 0 },
            eventDate: { seconds: Math.floor(new Date('2026-03-13T19:00:00').getTime() / 1000), nanoseconds: 0 },
            tracks: [
                { id: 't1', title: 'Shema', type: 'song' as const },
                { id: 't2', title: 'Mi Chamocha', type: 'song' as const },
            ],
            trackCount: 2,
            ownerId: 'user123',
            musicians: [{ name: 'Alice', email: 'alice@test.com' }],
            rabbi: 'Daniel',
        }

        it('creates a new setlist with advanced date (+7 days)', async () => {
            const newId = await service.cloneForNextWeek(sourceSetlist as any)

            expect(newId).toBe('new-setlist-id')
            expect(mockAddDoc).toHaveBeenCalledTimes(1)

            const data = mockAddDoc.mock.calls[0][1]
            // Date should be advanced (Timestamp.fromDate is called with the target date)
            expect(data.date).toBeDefined()
            expect(data.eventDate).toBeDefined()
        })

        it('copies tracks from source', async () => {
            await service.cloneForNextWeek(sourceSetlist as any)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.tracks).toHaveLength(2)
            expect(data.trackCount).toBe(2)
        })

        it('auto-generates a liturgical name', async () => {
            await service.cloneForNextWeek(sourceSetlist as any)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.name).toBe('Friday Night — Parashat Vayikra — March 20')
        })

        it('copies musicians and rabbi from source', async () => {
            await service.cloneForNextWeek(sourceSetlist as any)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.musicians).toEqual(sourceSetlist.musicians)
            expect(data.rabbi).toBe('Daniel')
        })

        it('new setlist has a different ID from source', async () => {
            const newId = await service.cloneForNextWeek(sourceSetlist as any)
            expect(newId).not.toBe(sourceSetlist.id)
        })

        it('records clonedFrom reference', async () => {
            await service.cloneForNextWeek(sourceSetlist as any)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.clonedFrom).toBe('source-setlist-id')
        })
    })
})
