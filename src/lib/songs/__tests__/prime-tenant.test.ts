import { describe, expect, it, vi } from 'vitest'

/**
 * Multi-tenant phase 2 (G2): the default songs adapter reads only the tenant's
 * songs — `where('orgId','==',org)` — never the whole collection.
 */

const h = vi.hoisted(() => ({
    getDocs: vi.fn(async () => ({ docs: [] })),
    where: vi.fn((...a: unknown[]) => ({ where: a })),
    query: vi.fn((...a: unknown[]) => ({ query: a })),
}))

vi.mock('firebase/firestore', () => ({
    collection: (_db: unknown, path: string) => ({ path }),
    getDocs: h.getDocs,
    query: h.query,
    where: h.where,
}))
vi.mock('@/lib/firebase', () => ({ getDb: async () => ({}) }))
vi.mock('@/lib/local/schema', () => ({ getDb: () => ({ songs: { put: vi.fn() } }) }))

import { firestoreSongsAdapter } from '../prime'

describe('firestoreSongsAdapter', () => {
    it('queries songs by the tenant', async () => {
        await firestoreSongsAdapter('brotherslazaroff').getAllSongs()
        expect(h.where).toHaveBeenCalledWith('orgId', '==', 'brotherslazaroff')
        expect(h.query).toHaveBeenCalledWith({ path: 'songs' }, { where: ['orgId', '==', 'brotherslazaroff'] })
        expect(h.getDocs).toHaveBeenCalledWith({ query: [{ path: 'songs' }, { where: ['orgId', '==', 'brotherslazaroff'] }] })
    })
})
