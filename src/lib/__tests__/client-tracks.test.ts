import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getTracksForSetlistClient, fetchTracksForSetlistClient } from '@/lib/client-tracks'

// Mock Firestore SDK + firebase db for fetchTracksForSetlistClient tests.
// getTracksForSetlistClient is pure (no Firestore calls).
const mockGetDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, path) => ({ __path: path })),
    query: vi.fn((coll, ...constraints) => ({ __coll: coll, __constraints: constraints })),
    where: vi.fn((field, op, value) => ({ __where: { field, op, value } })),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
}))
// R-0919-audit-2: `auth.currentUser` now decides which path
// fetchTracksForSetlistClient takes. Signed IN by default here, so the
// existing Firestore-direct cases below keep exercising the Firestore branch;
// the signed-out suite at the bottom flips it.
// vi.hoisted, because vi.mock is lifted above ordinary top-level consts.
const { mockAuth } = vi.hoisted(() => ({
    mockAuth: { currentUser: { uid: 'signed-in-user' } } as {
        currentUser: { uid: string } | null
    },
}))
vi.mock('@/lib/firebase', () => ({
    db: { __mockDb: true },
    auth: mockAuth,
    getDb: vi.fn(async () => ({ __mockDb: true })),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({ __mockDb: true })
        return typeof u === 'function' ? u : () => {}
    }),
}))

/**
 * v60-08-01 — getTracksForSetlistClient single-branch contract.
 *
 * Embedded-array fallback removed after universal backfill. The helper now
 * trusts Dexie unconditionally: returns dexieTracks (or [] when undefined/
 * empty). The `setlistData` param is retained for ABI stability but is
 * no longer inspected.
 */
describe('v60-08-01 getTracksForSetlistClient (pure function)', () => {
    it('returns dexieTracks when populated; ignores stale embedded tracks', () => {
        const dexie = [
            { id: 't1', setlistId: 's1', order: 0, title: 'Adon Olam' },
        ] as unknown as Parameters<typeof getTracksForSetlistClient>[0]
        const setlist = { hydrated: true, tracks: [{ title: 'STALE' }] }
        const out = getTracksForSetlistClient(dexie, setlist)
        expect(out).toHaveLength(1)
        expect(out[0].title).toBe('Adon Olam')
    })

    it('Dexie wins regardless of hydrated flag (post-v60-08 contract)', () => {
        const dexie = [
            { id: 't1', setlistId: 's1', order: 0, title: 'Snapshot Delivered' },
        ] as unknown as Parameters<typeof getTracksForSetlistClient>[0]
        const setlist = { hydrated: false, tracks: [{ title: 'EMBEDDED' }] }
        const out = getTracksForSetlistClient(dexie, setlist)
        expect(out[0].title).toBe('Snapshot Delivered')
    })

    it('empty Dexie + any setlist shape: returns [] (no embedded fallback)', () => {
        const setlist = {
            hydrated: false,
            tracks: [{ title: 'WOULD_FALLBACK_PRE_V60_08' }, { title: 'GONE' }],
        }
        expect(getTracksForSetlistClient([], setlist)).toEqual([])
    })

    it('undefined dexieTracks: returns []', () => {
        expect(getTracksForSetlistClient(undefined, { hydrated: true, tracks: [] })).toEqual([])
        expect(getTracksForSetlistClient(undefined, { hydrated: false, tracks: [{ title: 'Legacy' }] })).toEqual([])
    })

    it('null/undefined setlistData: returns []', () => {
        expect(getTracksForSetlistClient([], undefined)).toEqual([])
        expect(getTracksForSetlistClient([], null)).toEqual([])
    })
})

/**
 * v60-08-01 — fetchTracksForSetlistClient single-branch Firestore-direct reader.
 *
 * Embedded fallback removed. Always queries the top-level `tracks` collection
 * filtered by setlistId, sorts by order ascending. The `setlistData` param
 * is retained for ABI stability.
 */
describe('v60-08-01 fetchTracksForSetlistClient (Firestore-direct)', () => {
    beforeEach(() => {
        mockGetDocs.mockReset()
        mockAuth.currentUser = { uid: 'signed-in-user' }
    })

    it('returns sorted top-level tracks from Firestore', async () => {
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                { id: 't3', data: () => ({ setlistId: 's1', order: 2, title: 'C', fileId: 'f3' }) },
                { id: 't1', data: () => ({ setlistId: 's1', order: 0, title: 'A', fileId: 'f1' }) },
                { id: 't2', data: () => ({ setlistId: 's1', order: 1, title: 'B', fileId: 'f2' }) },
            ],
        })

        const out = await fetchTracksForSetlistClient('s1', { hydrated: true })

        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(out).toHaveLength(3)
        expect(out.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
        expect(out.map((t) => (t as { title: string }).title)).toEqual(['A', 'B', 'C'])
        expect(out.map((t) => (t as { fileId: string }).fileId)).toEqual(['f1', 'f2', 'f3'])
    })

    it('queries top-level even when caller passes hydrated:false (no embedded fallback)', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [] })

        const out = await fetchTracksForSetlistClient('s1', {
            hydrated: false,
            tracks: [{ title: 'WOULD_FALLBACK_PRE_V60_08' }],
        })

        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(out).toEqual([])
    })

    it('queries top-level even when setlistData is null/undefined', async () => {
        mockGetDocs.mockResolvedValue({ docs: [] })

        expect(await fetchTracksForSetlistClient('s1', null)).toEqual([])
        expect(await fetchTracksForSetlistClient('s1', undefined)).toEqual([])
        expect(mockGetDocs).toHaveBeenCalledTimes(2)
    })

    it('empty Firestore result: returns []', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [] })

        const out = await fetchTracksForSetlistClient('s1', { hydrated: true })

        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(out).toEqual([])
    })
})

/**
 * R-0919-audit-2 — the signed-out path.
 *
 * A signed-out client cannot run the `tracks` query any more: collection-wide
 * `list` requires sign-in, because `allow read: if true` let anyone enumerate
 * every track of both tenants. The rows still have to reach a band member who
 * opened a /perform link without logging in — which on a service morning is
 * the normal case — so they come from /api/setlists/{id}/tracks instead.
 */
describe('R-0919-audit-2 fetchTracksForSetlistClient (signed out)', () => {
    const fetchMock = vi.fn()

    beforeEach(() => {
        mockGetDocs.mockReset()
        fetchMock.mockReset()
        mockAuth.currentUser = null
        vi.stubGlobal('fetch', fetchMock)
    })

    it('goes to the public endpoint instead of querying Firestore', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                found: true,
                tracks: [
                    { id: 't2', setlistId: 's1', order: 1, title: 'B' },
                    { id: 't1', setlistId: 's1', order: 0, title: 'A' },
                ],
            }),
        })

        const out = await fetchTracksForSetlistClient('s1', { hydrated: true })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('/api/setlists/s1/tracks')
        // Never touched Firestore — that query would have been denied.
        expect(mockGetDocs).not.toHaveBeenCalled()
        expect(out.map((t) => t.id)).toEqual(['t1', 't2'])
    })

    it('escapes the setlist id in the url', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ found: true, tracks: [] }),
        })
        await fetchTracksForSetlistClient('a b/c', null)
        expect(fetchMock.mock.calls[0][0]).toBe('/api/setlists/a%20b%2Fc/tracks')
    })

    it('breaks an order tie by document id, like every other reader (R11-b)', async () => {
        // Two rows sharing `order` exist on real setlists (2 of 84, measured
        // 2026-09-16). A bare numeric sort would let this reader and the
        // server disagree about which comes first.
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                found: true,
                tracks: [
                    { id: 'tb', setlistId: 's1', order: 1, title: 'B' },
                    { id: 'ta', setlistId: 's1', order: 1, title: 'A' },
                ],
            }),
        })

        const out = await fetchTracksForSetlistClient('s1', null)
        expect(out.map((t) => t.id)).toEqual(['ta', 'tb'])
    })

    it('returns an empty list for a setlist the server does not have', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ found: false, tracks: [] }),
        })
        expect(await fetchTracksForSetlistClient('gone', null)).toEqual([])
    })

    it('falls back to Firestore when the endpoint fails', async () => {
        // Signed out that query will be denied and we end up with nothing
        // either way — but a musician mid-service is better served by one more
        // attempt than by a certain blank screen.
        fetchMock.mockRejectedValueOnce(new Error('offline'))
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                { id: 't1', data: () => ({ setlistId: 's1', order: 0, title: 'A' }) },
            ],
        })

        const out = await fetchTracksForSetlistClient('s1', null)
        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(out.map((t) => t.id)).toEqual(['t1'])
    })

    it('falls back to Firestore on a non-ok response', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) })
        mockGetDocs.mockResolvedValueOnce({ docs: [] })

        expect(await fetchTracksForSetlistClient('s1', null)).toEqual([])
        expect(mockGetDocs).toHaveBeenCalledTimes(1)
    })
})
