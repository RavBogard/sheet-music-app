import { describe, it, expect, vi, beforeEach } from 'vitest'

import { getTracksForSetlistClient, fetchTracksForSetlistClient } from '@/lib/client-tracks'

// Mock Firestore SDK + firebase db for fetchTracksForSetlistClient tests.
// getTracksForSetlistClient is pure (no Firestore calls) and ignores these.
const mockGetDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db, path) => ({ __path: path })),
    query: vi.fn((coll, ...constraints) => ({ __coll: coll, __constraints: constraints })),
    where: vi.fn((field, op, value) => ({ __where: { field, op, value } })),
    getDocs: (...args: unknown[]) => mockGetDocs(...args),
}))
vi.mock('@/lib/firebase', () => ({
    db: { __mockDb: true },
}))

/**
 * v60-05-01 — getTracksForSetlistClient pure-function unit tests.
 *
 * Covers all 3 branches of the hydration-aware reader contract plus
 * edge cases. No Firestore, no Dexie — pure-function tests on
 * deterministic inputs.
 */
describe('v60-05-01 getTracksForSetlistClient (pure function)', () => {
    // Branch 1: hydrated → Dexie authoritative, embedded ignored
    it('hydrated branch: returns dexieTracks; ignores stale embedded tracks', () => {
        const dexie = [
            { id: 't1', setlistId: 's1', order: 0, title: 'Adon Olam' },
        ] as unknown as Parameters<typeof getTracksForSetlistClient>[0]
        const setlist = { hydrated: true, tracks: [{ title: 'STALE' }] }
        const out = getTracksForSetlistClient(dexie, setlist)
        expect(out).toHaveLength(1)
        expect(out[0].title).toBe('Adon Olam')
    })

    // Branch 2: Dexie-has-data pre-hydration (snapshot-listener delivered
    // server rows into Dexie before the cascade flipped hydrated:true).
    it('Dexie-has-data pre-hydration: returns dexieTracks (NOT embedded fallback)', () => {
        const dexie = [
            { id: 't1', setlistId: 's1', order: 0, title: 'Snapshot Delivered' },
        ] as unknown as Parameters<typeof getTracksForSetlistClient>[0]
        const setlist = { hydrated: false, tracks: [{ title: 'EMBEDDED' }] }
        const out = getTracksForSetlistClient(dexie, setlist)
        expect(out[0].title).toBe('Snapshot Delivered')
    })

    // Branch 3: unhydrated + empty Dexie → embedded fallback
    it('unhydrated + empty Dexie: returns embedded tracks', () => {
        const setlist = {
            hydrated: false,
            tracks: [{ title: 'Embedded 1' }, { title: 'Embedded 2' }],
        }
        const out = getTracksForSetlistClient([], setlist)
        expect(out.map((t) => t.title)).toEqual(['Embedded 1', 'Embedded 2'])
    })

    // Edge case: undefined dexieTracks (in-flight useLiveQuery) + hydrated → []
    it('undefined dexieTracks (in-flight live query) + hydrated setlist → empty array', () => {
        const out = getTracksForSetlistClient(undefined, { hydrated: true, tracks: [] })
        expect(out).toEqual([])
    })

    // Edge case: undefined dexieTracks + unhydrated → embedded fallback
    it('undefined dexieTracks + unhydrated setlist → embedded tracks', () => {
        const out = getTracksForSetlistClient(undefined, {
            hydrated: false,
            tracks: [{ title: 'Legacy' }],
        })
        expect(out).toHaveLength(1)
        expect(out[0].title).toBe('Legacy')
    })

    // Edge case: null/undefined setlistData
    it('null/undefined setlistData → empty array', () => {
        expect(getTracksForSetlistClient([], undefined)).toEqual([])
        expect(getTracksForSetlistClient([], null)).toEqual([])
    })

    // Edge case: setlistData with no tracks field + empty Dexie → []
    it('setlistData without tracks field + empty Dexie → empty array', () => {
        const out = getTracksForSetlistClient([], { hydrated: false })
        expect(out).toEqual([])
    })
})

/**
 * v60-06-06 — fetchTracksForSetlistClient: Web SDK Firestore-direct reader.
 *
 * Async 2-branch helper used by admin / one-shot surfaces that lack Dexie
 * pre-population (no snapshot listener mounted). Hydrated → top-level
 * `tracks` query; unhydrated → embedded fallback. Mirrors server-tracks.ts
 * shape on the client.
 */
describe('v60-06-06 fetchTracksForSetlistClient (Firestore-direct)', () => {
    beforeEach(() => {
        mockGetDocs.mockReset()
    })

    it('hydrated path: returns sorted top-level tracks from Firestore', async () => {
        // Docs returned out of order to exercise the sortBy
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

    it('unhydrated path: returns embedded tracks unchanged (no Firestore call)', async () => {
        const embedded = [
            { id: 'e1', title: 'Legacy 1' },
            { id: 'e2', title: 'Legacy 2' },
        ] as unknown as Parameters<typeof fetchTracksForSetlistClient>[1] extends infer T
            ? T extends { tracks?: infer U }
                ? U extends unknown[]
                    ? U
                    : never
                : never
            : never

        const out = await fetchTracksForSetlistClient('s1', { hydrated: false, tracks: embedded })

        expect(mockGetDocs).not.toHaveBeenCalled()
        expect(out).toHaveLength(2)
        expect(out.map((t) => (t as { title: string }).title)).toEqual(['Legacy 1', 'Legacy 2'])
    })

    it('unhydrated path with missing tracks: returns [] (no Firestore call)', async () => {
        const out = await fetchTracksForSetlistClient('s1', { hydrated: false })

        expect(mockGetDocs).not.toHaveBeenCalled()
        expect(out).toEqual([])
    })

    it('hydrated path with empty result: returns [] (Firestore queried)', async () => {
        mockGetDocs.mockResolvedValueOnce({ docs: [] })

        const out = await fetchTracksForSetlistClient('s1', { hydrated: true })

        expect(mockGetDocs).toHaveBeenCalledTimes(1)
        expect(out).toEqual([])
    })

    it('null/undefined setlistData → [] (no Firestore call)', async () => {
        expect(await fetchTracksForSetlistClient('s1', null)).toEqual([])
        expect(await fetchTracksForSetlistClient('s1', undefined)).toEqual([])
        expect(mockGetDocs).not.toHaveBeenCalled()
    })
})
