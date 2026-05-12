import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../schema'
import type { LocalSong } from '../types'

describe('LocalDb schema (Bug 2 fix 2026-05-12: v4 additive tombstones)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('opens at Dexie version 4', async () => {
        const db = getDb()
        await db.open()
        expect(db.verno).toBe(4)
    })

    it('round-trips a tombstone row keyed by [collection+docId]', async () => {
        const db = getDb()
        await db.tombstones.put({
            collection: 'tracks',
            docId: 'track-abc',
            deletedAt: 1700000000000,
            originalUpdatedAt: 1699999999000,
        })
        const fetched = await db.tombstones.get(['tracks', 'track-abc'])
        expect(fetched).toBeDefined()
        expect(fetched?.collection).toBe('tracks')
        expect(fetched?.docId).toBe('track-abc')
        expect(fetched?.deletedAt).toBe(1700000000000)
        expect(fetched?.originalUpdatedAt).toBe(1699999999000)
    })

    it('compound primary key dedupes — second put for same (collection, docId) overwrites', async () => {
        const db = getDb()
        await db.tombstones.put({
            collection: 'tracks',
            docId: 'track-abc',
            deletedAt: 1,
        })
        await db.tombstones.put({
            collection: 'tracks',
            docId: 'track-abc',
            deletedAt: 2,
        })
        const all = await db.tombstones.toArray()
        expect(all).toHaveLength(1)
        expect(all[0].deletedAt).toBe(2)
    })

    it('round-trips a song row carrying defaults + recent', async () => {
        const db = getDb()
        const song: LocalSong = {
            id: 'songA',
            title: 'Adon Olam',
            normalizedTitle: 'adon olam',
            defaults: { key: 'Dm', lead: 'Randy', bpm: 92 },
            recent: [
                {
                    key: 'Dm',
                    lead: 'Randy',
                    bpm: 92,
                    setlistId: 'sl1',
                    performedAt: 1700000000000,
                },
            ],
        }
        await db.songs.put(song)
        const fetched = await db.songs.get('songA')
        expect(fetched?.defaults).toEqual({ key: 'Dm', lead: 'Randy', bpm: 92 })
        expect(fetched?.recent).toHaveLength(1)
        expect(fetched?.recent?.[0]).toMatchObject({
            setlistId: 'sl1',
            performedAt: 1700000000000,
        })
    })

    it('preserves legacy song rows without defaults/recent', async () => {
        const db = getDb()
        await db.songs.put({
            id: 'legacy',
            title: 'Old Song',
            normalizedTitle: 'old song',
        })
        const fetched = await db.songs.get('legacy')
        expect(fetched?.title).toBe('Old Song')
        expect(fetched?.defaults).toBeUndefined()
        expect(fetched?.recent).toBeUndefined()
    })
})
