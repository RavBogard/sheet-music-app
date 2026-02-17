import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-setlist-id' })
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined)
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined)
const mockGetDoc = vi.fn()
const mockOnSnapshot = vi.fn()

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
    where: vi.fn(),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    getDoc: (...args: unknown[]) => mockGetDoc(...args),
}))
vi.mock('@/lib/setlist-audit', () => ({ logSetlistChange: vi.fn() }))
vi.mock('@/lib/notification-store', () => ({
    notifySetlistPublished: vi.fn(),
    notifySetlistUpdated: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
        it('deletes a setlist document', async () => {
            await service.deleteSetlist('setlist-abc', false)

            expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
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
})
