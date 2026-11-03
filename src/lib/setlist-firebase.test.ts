import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

vi.mock('./firebase', () => {
    const stubDb = { __mock: true }
    return {
        db: stubDb,
        auth: { currentUser: null },
        getDb: vi.fn(async () => stubDb),
        subscribeWithDb: vi.fn((setup: (db: unknown) => unknown) => {
            const u = setup(stubDb)
            return typeof u === 'function' ? (u as () => void) : () => {}
        }),
    }
})
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
    deleteField: vi.fn(() => '__DELETE_FIELD__'),
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
vi.mock('@/lib/client-tracks', () => ({
    fetchTracksForSetlistClient: vi.fn().mockResolvedValue([]),
}))

import { createSetlistService } from './setlist-firebase'

/** Bodies POSTed to /api/setlists/create, in order. */
const createBodies: Array<Record<string, unknown>> = []

describe('createSetlistService', () => {
    let service: ReturnType<typeof createSetlistService>

    beforeEach(() => {
        vi.clearAllMocks()
        createBodies.length = 0
        globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
            if (String(url).includes('/api/setlists/create')) {
                const body = JSON.parse(String(init?.body)) as Record<string, unknown>
                createBodies.push(body)
                return new Response(JSON.stringify({ ok: true, setlistId: body.setlistId }), { status: 200 })
            }
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
        }) as unknown as typeof fetch
        service = createSetlistService('user123', 'Test User')
    })

    // Setlist sync PR 3: every create-style path is ONE server transaction.
    describe('createSetlist', () => {
        it('posts the setlist and its rows as explicit field lists; the browser writes no Firestore doc', async () => {
            const tracks = [
                { id: '1', title: 'Song 1', fileName: 'Song 1', type: 'song' as const },
                { id: '2', title: 'Song 2', fileName: 'Song 2', type: 'song' as const },
            ]
            const id = await service.createSetlist('Friday Night', tracks, { templateType: 'rosh_hashanah' })

            expect(createBodies).toHaveLength(1)
            const body = createBodies[0]
            expect(body.setlistId).toBe(id)
            expect(body).toMatchObject({ name: 'Friday Night', templateType: 'rosh_hashanah' })
            expect(body.rows).toEqual([
                { title: 'Song 1', fileName: 'Song 1', type: 'song' },
                { title: 'Song 2', fileName: 'Song 2', type: 'song' },
            ])
            expect(body).not.toHaveProperty('isPublic')
            expect(body).not.toHaveProperty('orgId')
            expect(mockAddDoc).not.toHaveBeenCalled()
        })

        it('a refused create throws with the server reason', async () => {
            globalThis.fetch = vi.fn(async () =>
                new Response(JSON.stringify({ ok: false, reason: 'forbidden' }), { status: 403 }),
            ) as unknown as typeof fetch
            await expect(service.createSetlist('X', [])).rejects.toThrow(/forbidden/)
        })
    })

    describe('deleteSetlist', () => {
        it('delegates to /api/setlist/delete (server-side cascade via Admin SDK)', async () => {
            const fetchSpy = vi.fn(async () =>
                new Response(JSON.stringify({ ok: true }), { status: 200 }),
            ) as unknown as typeof fetch
            globalThis.fetch = fetchSpy

            await service.deleteSetlist('setlist-abc')

            expect(fetchSpy).toHaveBeenCalledTimes(1)
            const [url, init] = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
            expect(url).toContain('/api/setlist/delete')
            expect((init as RequestInit).method).toBe('POST')
            expect((init as RequestInit).body).toBe(JSON.stringify({ setlistId: 'setlist-abc' }))
            expect(mockDeleteDoc).not.toHaveBeenCalled()
            expect(mockBatchDelete).not.toHaveBeenCalled()
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
            trackCount: 2,
            ownerId: 'user123',
            musicians: [{ name: 'Alice', email: 'alice@test.com' }],
            rabbi: 'Daniel',
        }

        it('asks the server to clone the source a week later, with its musicians and rabbi', async () => {
            const newId = await service.cloneForNextWeek(sourceSetlist as never)
            expect(newId).not.toBe(sourceSetlist.id)
            const body = createBodies[0]
            expect(body).toMatchObject({
                name: 'Friday Night — Parashat Vayikra — March 20',
                copyFrom: 'source-setlist-id',
                copyKind: 'clonedFrom',
                rabbi: 'Daniel',
                musicians: sourceSetlist.musicians,
            })
            expect(new Date(String(body.eventDate)).getDate()).toBe(20)
            expect(body).not.toHaveProperty('rows')
        })
    })
})

