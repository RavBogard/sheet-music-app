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
vi.mock('@/lib/firebase', () => ({
    db: { __mockDb: true },
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
