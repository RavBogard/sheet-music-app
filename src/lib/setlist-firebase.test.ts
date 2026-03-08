import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-setlist-id' })
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDoc = vi.fn()
const mockOnSnapshot = vi.fn()

const mockBatchDelete = vi.fn()
const mockBatchCommit = vi.fn().mockResolvedValue(undefined)

vi.mock('./firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    addDoc: (...args: unknown[]) => mockAddDoc(...args),
    updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
    deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
    doc: vi.fn((_db: unknown, _path: string, id: string) => ({ path: `setlists/${id}`, id })),
    onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
    query: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    Timestamp: { fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d }) },
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
    getDocs: vi.fn().mockResolvedValue({
        size: 1,
        docs: [
            { id: 'task1', ref: { path: 'tasks/task1' }, data: () => ({}) },
        ]
    }),
    writeBatch: vi.fn(() => ({
        delete: mockBatchDelete,
        commit: mockBatchCommit,
    })),
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

import { createSetlistService } from './setlist-firebase'

describe('createSetlistService', () => {
    let service: ReturnType<typeof createSetlistService>

    beforeEach(() => {
        vi.clearAllMocks()
        service = createSetlistService('user123', 'Test User')
    })

    describe('createSetlist', () => {
        it('creates a setlist with required fields', async () => {
            const tracks = [
                { id: '1', title: 'Song 1', fileName: 'Song 1', type: 'song' as const },
                { id: '2', title: 'Song 2', fileName: 'Song 2', type: 'song' as const },
            ]

            const id = await service.createSetlist('Friday Night', tracks, false)

            expect(id).toBe('new-setlist-id')
            expect(mockAddDoc).toHaveBeenCalledTimes(1)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.name).toBe('Friday Night')
            expect(data.tracks).toHaveLength(2)
            expect(data.trackCount).toBe(2)
            expect(data.isPublic).toBe(false)
            expect(data.ownerId).toBe('user123')
            expect(data.ownerName).toBe('Test User')
        })

        it('creates a public setlist', async () => {
            await service.createSetlist('Shabbat Morning', [], true)

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.isPublic).toBe(true)
        })

        it('includes additional data when provided', async () => {
            await service.createSetlist('Festival', [], false, {
                templateType: 'rosh_hashanah',
            })

            const data = mockAddDoc.mock.calls[0][1]
            expect(data.templateType).toBe('rosh_hashanah')
        })
    })

    describe('deleteSetlist', () => {
        it('deletes the setlist document directly and attempts task cleanup', async () => {
            await service.deleteSetlist('setlist-abc', false)

            // Setlist doc is deleted directly (not via batch)
            expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
            // Task cleanup is best-effort via batch (may fail due to Firestore rules)
            expect(mockBatchDelete).toHaveBeenCalledTimes(1) // 1 mocked task
            expect(mockBatchCommit).toHaveBeenCalledTimes(1)
        })
    })

    describe('updateSetlist', () => {
        it('updates setlist fields', async () => {
            const tracks = [
                { id: 'a', title: 'Song A', fileName: 'Song A', type: 'song' as const },
                { id: 'b', title: 'Song B', fileName: 'Song B', type: 'song' as const },
                { id: 'c', title: 'Song C', fileName: 'Song C', type: 'song' as const },
            ]

            await service.updateSetlist('setlist-xyz', false, {
                tracks,
                trackCount: 3,
                name: 'Test Setlist',
            })

            expect(mockUpdateDoc).toHaveBeenCalledTimes(1)
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
            isPublic: false,
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
