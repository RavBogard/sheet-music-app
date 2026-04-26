import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../schema'
import type { LocalSong } from '../types'

describe('LocalDb schema (v50-04: v2 additive defaults + recent on songs)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('opens at Dexie version 2', async () => {
        const db = getDb()
        await db.open()
        expect(db.verno).toBe(2)
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
