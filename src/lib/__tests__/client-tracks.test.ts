import { describe, it, expect } from 'vitest'

import { getTracksForSetlistClient } from '@/lib/client-tracks'

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
