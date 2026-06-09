import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
    getSetlistsPage,
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
        // Pin "now" so the upcoming-window filter is deterministic.
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-05-22T08:00:00.000Z'))
        // Mixed-type corpus, returned in `date desc` order (the fetch field).
        // serializeSetlist has already turned Firestore Timestamps into ISO
        // strings, so both Timestamp-origin and String-origin eventDates
        // arrive here as ISO text. `str-later` carries the offset-form string
        // that the old `.where('eventDate','>=')` range filter dropped.
        mockSnapshotDocs = [
            makeDoc('past', { name: 'Last week', date: '2026-05-15', eventDate: '2026-05-15T12:00:00Z' }),
            makeDoc('ts-soon', { name: 'Kabbalat Shabbat', date: '2026-05-21', eventDate: '2026-05-22T12:00:00Z' }),
            makeDoc('str-later', { name: 'Shabbat Morning', date: '2026-05-02', eventDate: '2026-05-23T12:00:00.000-06:00' }),
            makeDoc('undated', { name: 'Template', date: '2026-05-09' }),
        ]
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('fetches by the type-consistent `date` field (not the mixed-type eventDate where-filter)', async () => {
        await getUpcomingSetlists()
        // No `.where('eventDate','>=')` — that range filter matches only
        // Timestamp-typed values and silently dropped String-typed services.
        expect(mockWhere).not.toHaveBeenCalled()
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(200) // MAX_SETLIST_FETCH
    })

    it('returns future events (Timestamp- and String-typed) ascending; excludes past + undated', async () => {
        const result = await getUpcomingSetlists()
        expect(result.map((s) => s.id)).toEqual(['ts-soon', 'str-later'])
    })

    it('includes a String-typed future eventDate the old where-filter dropped (VERIFY-1 regression)', async () => {
        const result = await getUpcomingSetlists()
        expect(result.map((s) => s.id)).toContain('str-later')
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
        expect(result.map((s) => s.id)).toEqual(['ts-soon', 'str-later'])
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

    it("orderBy:'eventDate' fetches by the consistent `date` field, then sorts eventDate in memory (mixed-type safe — VERIFY-1)", async () => {
        // Returned in `date desc` order (the fetch field). eventDate order
        // differs from date order: the most recent service has the LATEST
        // eventDate but is NOT first by `date`. The old code's
        // `.orderBy('eventDate','desc').limit(n)` would rank String-typed
        // eventDates above the Timestamp-typed target and drop it past `limit`.
        mockSnapshotDocs = [
            makeDoc('s-recentwrite', { name: 'Old event, recent write', date: '2026-05-20', eventDate: '2026-03-21' }),
            makeDoc('s-target', { name: 'Kabbalat Shabbat', date: '2026-05-19', eventDate: '2026-05-22' }),
            makeDoc('s-mid', { name: 'Mid', date: '2026-05-18', eventDate: '2026-04-10' }),
            makeDoc('s-undated', { name: 'Template', date: '2026-05-17' }),
        ]
        const result = await getAllSetlists({ orderBy: 'eventDate', limit: 2 })
        // Fetch uses the consistent `date` field (NOT mixed-type eventDate) and
        // pulls the whole corpus (MAX) so nothing drops at the fetch layer.
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockOrderBy).not.toHaveBeenCalledWith('eventDate', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(200) // MAX_SETLIST_FETCH
        // In-memory eventDate desc → target (5/22) first even though it is not
        // first by `date`; sliced to the requested limit (the target survives).
        expect(result.map((s) => s.id)).toEqual(['s-target', 's-mid'])
    })

    it("orderBy:'eventDate' sorts rows without a parseable eventDate last", async () => {
        mockSnapshotDocs = [
            makeDoc('a', { date: '2026-05-20', eventDate: '2026-05-10' }),
            makeDoc('undated', { date: '2026-05-19' }),
            makeDoc('b', { date: '2026-05-18', eventDate: '2026-05-22' }),
        ]
        const result = await getAllSetlists({ orderBy: 'eventDate' })
        expect(result.map((s) => s.id)).toEqual(['b', 'a', 'undated'])
    })
})

describe('getAllSetlists — v11-04-01 tenant scoping (cross-tenant non-leak)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('bl1', { name: 'BL gig', orgId: 'brotherslazaroff' }),
        ]
    })

    it("applies .where('orgId','==',org) when an org is passed (default `date` ordering)", async () => {
        await getAllSetlists({ org: 'brotherslazaroff' })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'brotherslazaroff')
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it("applies the orgId where on the eventDate branch too", async () => {
        await getAllSetlists({ org: 'crc', orderBy: 'eventDate' })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'crc')
        // eventDate branch still fetches by the type-consistent `date` field
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it("does NOT filter by orgId when no org is passed (preserves the MCP broad-fetch + rowOrg-filter contract)", async () => {
        await getAllSetlists()
        expect(mockWhere).not.toHaveBeenCalledWith('orgId', '==', expect.anything())
    })

    it("scopes each tenant to its own query independently", async () => {
        await getAllSetlists({ org: 'crc' })
        await getAllSetlists({ org: 'brotherslazaroff' })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'crc')
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'brotherslazaroff')
    })
})

describe('authed read paths — v11-04-03 tenant scoping (getSetlistsPage / getUpcoming / getRecent)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockShouldThrow = false
        mockSnapshotDocs = [
            makeDoc('bl1', { name: 'BL gig', orgId: 'brotherslazaroff', date: '2026-06-01T00:00:00Z' }),
        ]
    })

    it("getSetlistsPage applies .where('orgId','==',org) when org is passed", async () => {
        await getSetlistsPage({ org: 'brotherslazaroff', pageSize: 50 })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'brotherslazaroff')
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it("getSetlistsPage does NOT filter by orgId when no org is passed (preserves cross-tenant contract)", async () => {
        await getSetlistsPage({ pageSize: 50 })
        expect(mockWhere).not.toHaveBeenCalledWith('orgId', '==', expect.anything())
    })

    it("getUpcomingSetlists / getRecentSetlists apply the orgId where when org is passed", async () => {
        await getUpcomingSetlists({ org: 'crc' })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'crc')
        vi.clearAllMocks()
        await getRecentSetlists({ org: 'brotherslazaroff' })
        expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'brotherslazaroff')
    })

    it("getUpcomingSetlists / getRecentSetlists stay cross-tenant with no org (unchanged contract)", async () => {
        await getUpcomingSetlists()
        await getRecentSetlists()
        expect(mockWhere).not.toHaveBeenCalledWith('orgId', '==', expect.anything())
    })
})
