import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetDocs = vi.fn()
const mockCollection = vi.fn((...args: unknown[]) => ({
    __ref: 'collection',
    args,
    withConverter: vi.fn(() => ({ __ref: 'collection-converted', args })),
}))
const mockQuery = vi.fn((...args: unknown[]) => ({ __ref: 'query', args }))
const mockOrderBy = vi.fn((...args: unknown[]) => ({ __ref: 'orderBy', args }))
const mockLimit = vi.fn((...args: unknown[]) => ({ __ref: 'limit', args }))

vi.mock('firebase/firestore', () => ({
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
    collection: (...args: unknown[]) => mockCollection(...args),
    query: (...args: unknown[]) => mockQuery(...args),
    orderBy: (...args: unknown[]) => mockOrderBy(...args),
    limit: (...args: unknown[]) => mockLimit(...args),
    // Unused-but-imported by setlist-firebase.ts:
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(),
    where: vi.fn(),
    writeBatch: vi.fn(),
    runTransaction: vi.fn(),
    Timestamp: {
        fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d }),
        now: () => ({ seconds: 0, nanoseconds: 0 }),
    },
}))

vi.mock('@/lib/firebase', () => ({ db: { __mock: true } }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/setlist-audit', () => ({ logSetlistChange: vi.fn() }))

// Identity converter so .data() returns the raw Setlist object passed in via the mock snapshot.
vi.mock('@/types/schemas', () => ({
    setlistConverter: {
        toFirestore: (data: unknown) => data,
        fromFirestore: (snap: { data: () => unknown }) => snap.data(),
    },
}))

// ── Import after mocks ──
import { createSetlistService, setlistMatchesServiceType, type Setlist } from '@/lib/setlist-firebase'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a fake QuerySnapshot for getDocs to return. The setlists are returned
 * in the order given (mocking the orderBy('date', 'desc') result — caller is
 * responsible for pre-sorting).
 */
function fakeSnapshot(setlists: Partial<Setlist>[]) {
    return {
        docs: setlists.map((s, i) => ({
            id: s.id ?? `id-${i}`,
            data: () => ({ id: s.id ?? `id-${i}`, ...s }),
        })),
    }
}

// Anchor dates — chosen so getServiceContext returns predictable types.
// 2026-04-17 is a Friday → friday_night.
// 2026-04-18 is a Saturday → shabbat_morning.
// 2026-04-24 is a Friday → friday_night.
// 2026-04-30 is a Thursday (used as beforeDate cutoff).
const FRIDAY_APR_17 = new Date(2026, 3, 17)   // month is 0-indexed
const SATURDAY_APR_18 = new Date(2026, 3, 18)
const FRIDAY_APR_24 = new Date(2026, 3, 24)
const THURSDAY_APR_30 = new Date(2026, 3, 30)

describe('setlistMatchesServiceType (pure helper)', () => {
    it('matches when templateType equals the requested service type', () => {
        const sl = { eventDate: FRIDAY_APR_24, date: FRIDAY_APR_24, templateType: 'friday_night' as const }
        expect(setlistMatchesServiceType(sl, 'friday_night')).toBe(true)
        expect(setlistMatchesServiceType(sl, 'shabbat_morning')).toBe(false)
    })

    it('templateType=festival matches any festival-bucket service type', () => {
        const sl = { eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, templateType: 'festival' as const }
        expect(setlistMatchesServiceType(sl, 'sukkot')).toBe(true)
        expect(setlistMatchesServiceType(sl, 'simchat_torah')).toBe(true)
        expect(setlistMatchesServiceType(sl, 'passover')).toBe(true)
        expect(setlistMatchesServiceType(sl, 'shavuot')).toBe(true)
        // Not in the festival bucket:
        expect(setlistMatchesServiceType(sl, 'friday_night')).toBe(false)
        expect(setlistMatchesServiceType(sl, 'rosh_hashanah')).toBe(false)
    })

    it("templateType='other' falls back to inference from eventDate", () => {
        // Friday eventDate → infers friday_night even though templateType is 'other'.
        const sl = { eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, templateType: 'other' as const }
        expect(setlistMatchesServiceType(sl, 'friday_night')).toBe(true)
        expect(setlistMatchesServiceType(sl, 'shabbat_morning')).toBe(false)
    })

    it('missing templateType falls back to inference (legacy setlists)', () => {
        const friday = { eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17 }
        expect(setlistMatchesServiceType(friday, 'friday_night')).toBe(true)

        const saturday = { eventDate: SATURDAY_APR_18, date: SATURDAY_APR_18 }
        expect(setlistMatchesServiceType(saturday, 'shabbat_morning')).toBe(true)
        expect(setlistMatchesServiceType(saturday, 'friday_night')).toBe(false)
    })

    it('falls back to `date` when eventDate is missing', () => {
        const sl = { date: FRIDAY_APR_17 }
        expect(setlistMatchesServiceType(sl, 'friday_night')).toBe(true)
    })

    it('returns false when no usable date and no templateType', () => {
        const sl = { date: null as unknown as Setlist['date'] }
        expect(setlistMatchesServiceType(sl, 'friday_night')).toBe(false)
    })
})

describe('findLastMatchingService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    function makeService() {
        return createSetlistService('user-1', 'Rabbi Daniel')
    }

    it('returns the most recent matching setlist before the cutoff date', async () => {
        // Snapshot pre-sorted by date desc (matches orderBy('date', 'desc')).
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'C', name: 'Erev Shabbat C', eventDate: FRIDAY_APR_24, date: FRIDAY_APR_24, templateType: 'friday_night', tracks: [], trackCount: 0 },
            { id: 'B', name: 'Shabbat B', eventDate: SATURDAY_APR_18, date: SATURDAY_APR_18, templateType: 'shabbat_morning', tracks: [], trackCount: 0 },
            { id: 'A', name: 'Erev Shabbat A', eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, templateType: 'friday_night', tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('friday_night', THURSDAY_APR_30)

        expect(result?.id).toBe('C')
        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
        expect(mockLimit).toHaveBeenCalledWith(20)
    })

    it('matches by inferring service type when templateType is missing (legacy)', async () => {
        // No templateType field — should infer friday_night from the Friday eventDate.
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'L', name: 'Legacy Friday', eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('friday_night', THURSDAY_APR_30)
        expect(result?.id).toBe('L')
    })

    it('returns null when no candidate matches', async () => {
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'B', name: 'Shabbat B', eventDate: SATURDAY_APR_18, date: SATURDAY_APR_18, templateType: 'shabbat_morning', tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('rosh_hashanah', THURSDAY_APR_30)
        expect(result).toBeNull()
    })

    it('skips candidates dated on or after beforeDate', async () => {
        // C is dated AFTER the cutoff (Friday May 1), should be skipped in favor of A.
        const FRIDAY_MAY_1 = new Date(2026, 4, 1)
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'future', name: 'Future Friday', eventDate: FRIDAY_MAY_1, date: FRIDAY_MAY_1, templateType: 'friday_night', tracks: [], trackCount: 0 },
            { id: 'A', name: 'Erev Shabbat A', eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, templateType: 'friday_night', tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('friday_night', FRIDAY_APR_24)
        expect(result?.id).toBe('A')
    })

    it('skips templates (isTemplate=true) even if templateType matches', async () => {
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'tmpl', name: 'Friday Night Template', eventDate: FRIDAY_APR_24, date: FRIDAY_APR_24, templateType: 'friday_night', isTemplate: true, tracks: [], trackCount: 0 },
            { id: 'real', name: 'Real Friday', eventDate: FRIDAY_APR_17, date: FRIDAY_APR_17, templateType: 'friday_night', tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('friday_night', THURSDAY_APR_30)
        expect(result?.id).toBe('real')
    })

    it('matches festival-bucket templateType against specific festival service types', async () => {
        mockGetDocs.mockResolvedValueOnce(fakeSnapshot([
            { id: 'F', name: 'Sukkot Service', eventDate: FRIDAY_APR_24, date: FRIDAY_APR_24, templateType: 'festival', tracks: [], trackCount: 0 },
        ]))

        const result = await makeService().findLastMatchingService('sukkot', THURSDAY_APR_30)
        expect(result?.id).toBe('F')
    })

    it('returns null gracefully when getDocs throws (offline / permission)', async () => {
        mockGetDocs.mockRejectedValueOnce(new Error('offline'))
        const result = await makeService().findLastMatchingService('friday_night', THURSDAY_APR_30)
        expect(result).toBeNull()
    })
})
