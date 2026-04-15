import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock state ──

let mockSnapshotDocs: Array<{ id: string; data: () => Record<string, unknown> }> = []
let mockShouldThrow = false

// ── Track query chain calls ──

const mockLimit = vi.fn()
const mockOrderBy = vi.fn()
const mockWhere = vi.fn()

const mockGet = vi.fn(async () => {
    if (mockShouldThrow) throw new Error('Firestore error')
    return { docs: mockSnapshotDocs }
})

// Chainable query builder
const queryChain = {
    where: vi.fn((..._args: unknown[]) => {
        mockWhere(..._args)
        return queryChain
    }),
    orderBy: vi.fn((..._args: unknown[]) => {
        mockOrderBy(..._args)
        return queryChain
    }),
    limit: vi.fn((n: number) => {
        mockLimit(n)
        return queryChain
    }),
    get: mockGet,
}

vi.mock('@/lib/firebase-admin', () => ({
    initAdmin: vi.fn().mockReturnValue(true),
}))

vi.mock('firebase-admin/firestore', () => ({
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => queryChain),
    })),
}))

vi.mock('@/lib/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// serializeSetlist — pass through with id added
vi.mock('@/lib/server-auth', () => ({
    serializeSetlist: vi.fn((id: string, data: Record<string, unknown>) => ({ id, ...data })),
}))

// ── Import after mocks ──

import {
    getUpcomingSetlists,
    getRecentSetlists,
    getAllSetlists,
    getUpcomingPublicSetlists,
    getRecentPublicSetlists,
    getPersonalSetlists,
    getAllPublicSetlists,
} from '@/lib/server-setlists'

// ── Helpers ──

function makeDoc(id: string, data: Record<string, unknown>) {
    return { id, data: () => data }
}

// ── Tests ──

describe('getUpcomingSetlists', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('s1', { name: 'Shabbat', eventDate: '2026-04-01' }),
            makeDoc('s2', { name: 'Friday Night', eventDate: '2026-04-02' }),
        ]
    })

    it('returns serialized setlists for upcoming setlists', async () => {
        const result = await getUpcomingSetlists()

        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({ id: 's1', name: 'Shabbat', eventDate: '2026-04-01' })
        expect(result[1]).toEqual({ id: 's2', name: 'Friday Night', eventDate: '2026-04-02' })
    })

    it('queries with correct filters (eventDate >= now, no isPublic filter)', async () => {
        await getUpcomingSetlists()

        expect(mockWhere).toHaveBeenCalledWith('eventDate', '>=', expect.any(Date))
        expect(mockWhere).not.toHaveBeenCalledWith('isPublic', '==', true)
        expect(mockOrderBy).toHaveBeenCalledWith('eventDate', 'asc')
        expect(mockLimit).toHaveBeenCalledWith(5)
    })

    it('returns empty array when no matching setlists', async () => {
        mockSnapshotDocs = []
        const result = await getUpcomingSetlists()
        expect(result).toEqual([])
    })

    it('returns empty array on Firestore error', async () => {
        mockShouldThrow = true
        const result = await getUpcomingSetlists()
        expect(result).toEqual([])
    })

    it('backward-compat alias getUpcomingPublicSetlists works', async () => {
        const result = await getUpcomingPublicSetlists()
        expect(result).toHaveLength(2)
    })
})

describe('getRecentSetlists', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('s1', { name: 'Recent Service' }),
        ]
    })

    it('returns serialized setlists ordered by date desc', async () => {
        const result = await getRecentSetlists()

        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('s1')
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(5)
    })

    it('returns empty array on error', async () => {
        mockShouldThrow = true
        const result = await getRecentSetlists()
        expect(result).toEqual([])
    })

    it('backward-compat alias getRecentPublicSetlists works', async () => {
        const result = await getRecentPublicSetlists()
        expect(result).toHaveLength(1)
    })
})

describe('getPersonalSetlists (backward-compat alias)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('s1', { name: 'My Setlist', ownerId: 'user-abc' }),
        ]
    })

    it('returns all setlists (no longer filters by ownerId)', async () => {
        const result = await getPersonalSetlists('user-abc')

        expect(result).toHaveLength(1)
        // v4.0: getPersonalSetlists is now an alias for getAllSetlists
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(50)
    })

    it('returns empty array on error', async () => {
        mockShouldThrow = true
        const result = await getPersonalSetlists('user-abc')
        expect(result).toEqual([])
    })
})

describe('getAllSetlists', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('s1', { name: 'Setlist 1' }),
            makeDoc('s2', { name: 'Setlist 2' }),
        ]
    })

    it('returns up to 50 setlists without isPublic filter', async () => {
        const result = await getAllSetlists()

        expect(result).toHaveLength(2)
        expect(mockWhere).not.toHaveBeenCalledWith('isPublic', '==', true)
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(50)
    })

    it('returns empty array on error', async () => {
        mockShouldThrow = true
        const result = await getAllSetlists()
        expect(result).toEqual([])
    })

    it('backward-compat alias getAllPublicSetlists works', async () => {
        const result = await getAllPublicSetlists()
        expect(result).toHaveLength(2)
    })
})
