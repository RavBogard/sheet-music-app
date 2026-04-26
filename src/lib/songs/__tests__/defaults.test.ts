import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import {
    __resetForTests,
    flushPendingPropagations,
    propagateTrackEditToSong,
    seedTrackFromSong,
    type PropagationClock,
} from '../defaults'

class FakeClock implements PropagationClock {
    private t: number
    private timers: Array<{ id: number; at: number; fn: () => void }> = []
    private nextId = 1

    constructor(start = 1700000000000) {
        this.t = start
    }

    now(): number {
        return this.t
    }

    setTimeout(fn: () => void, ms: number): unknown {
        const id = this.nextId++
        this.timers.push({ id, at: this.t + ms, fn })
        return id
    }

    clearTimeout(handle: unknown): void {
        const id = handle as number
        this.timers = this.timers.filter((t) => t.id !== id)
    }

    async advance(ms: number): Promise<void> {
        const target = this.t + ms
        await flushAll()
        while (true) {
            this.timers.sort((a, b) => a.at - b.at)
            const due = this.timers.find((t) => t.at <= target)
            if (!due) break
            this.timers = this.timers.filter((t) => t.id !== due.id)
            this.t = due.at
            due.fn()
            await flushAll()
        }
        this.t = target
        await flushAll()
    }
}

async function flushAll(rounds = 6): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

describe('seedTrackFromSong', () => {
    beforeEach(async () => {
        await resetDbForTests()
        __resetForTests()
    })
    afterEach(async () => {
        __resetForTests()
        await resetDbForTests()
    })

    it('returns defaults for an existing song', async () => {
        const db = getDb()
        await db.songs.put({
            id: 'songA',
            title: 'Adon Olam',
            normalizedTitle: 'adon olam',
            defaults: { key: 'Dm', lead: 'Randy', bpm: 92 },
        })
        const seed = await seedTrackFromSong('songA')
        expect(seed).toEqual({ key: 'Dm', lead: 'Randy', bpm: 92 })
    })

    it('returns {} for a missing song without throwing', async () => {
        const seed = await seedTrackFromSong('nope')
        expect(seed).toEqual({})
    })

    it('returns {} when song has no defaults field', async () => {
        const db = getDb()
        await db.songs.put({
            id: 'bare',
            title: 'Bare',
            normalizedTitle: 'bare',
        })
        const seed = await seedTrackFromSong('bare')
        expect(seed).toEqual({})
    })

    it('coerces unknown fields out of the seed', async () => {
        const db = getDb()
        await db.songs.put({
            id: 'songB',
            title: 'B',
            normalizedTitle: 'b',
            defaults: {
                key: 'F',
                // @ts-expect-error — exercising defensive coercion
                bogus: 'x',
            },
        })
        const seed = await seedTrackFromSong('songB')
        expect(seed).toEqual({ key: 'F' })
    })
})

describe('propagateTrackEditToSong', () => {
    beforeEach(async () => {
        await resetDbForTests()
        __resetForTests()
    })
    afterEach(async () => {
        __resetForTests()
        await resetDbForTests()
    })

    async function seed(id: string) {
        await getDb().songs.put({
            id,
            title: id,
            normalizedTitle: id,
        })
    }

    it('debounces three rapid calls within window into ONE applyEdit', async () => {
        await seed('songA')
        const clock = new FakeClock()

        propagateTrackEditToSong(
            'songA',
            { key: 'C' },
            'sl1',
            { clock, debounceMs: 1000 },
        )
        await clock.advance(300)
        propagateTrackEditToSong(
            'songA',
            { key: 'D' },
            'sl1',
            { clock, debounceMs: 1000 },
        )
        await clock.advance(300)
        propagateTrackEditToSong(
            'songA',
            { key: 'E', lead: 'Daniel' },
            'sl1',
            { clock, debounceMs: 1000 },
        )

        // Still inside debounce window for the latest call
        await clock.advance(500)
        let song = await getDb().songs.get('songA')
        expect(song?.defaults).toBeUndefined()

        // Latest call set timer for now+1000; advance past it
        await clock.advance(600)
        await flushPendingPropagations()

        song = await getDb().songs.get('songA')
        expect(song?.defaults).toEqual({ key: 'E', lead: 'Daniel' })
        expect(song?.recent).toHaveLength(1)
        expect(song?.recent?.[0]).toMatchObject({
            key: 'E',
            lead: 'Daniel',
            setlistId: 'sl1',
        })

        // Outbox should have exactly ONE update for songs/songA
        const all = await getDb().outbox.toArray()
        const matches = all.filter(
            (r) => r.collection === 'songs' && r.docId === 'songA',
        )
        expect(matches).toHaveLength(1)
        expect(matches[0].op).toBe('update')
    })

    it('debounces two different songs independently', async () => {
        await seed('songA')
        await seed('songB')
        const clock = new FakeClock()

        propagateTrackEditToSong(
            'songA',
            { key: 'C' },
            'sl1',
            { clock, debounceMs: 1000 },
        )
        propagateTrackEditToSong(
            'songB',
            { key: 'G' },
            'sl1',
            { clock, debounceMs: 1000 },
        )

        await clock.advance(1100)
        await flushPendingPropagations()

        const a = await getDb().songs.get('songA')
        const b = await getDb().songs.get('songB')
        expect(a?.defaults?.key).toBe('C')
        expect(b?.defaults?.key).toBe('G')
    })

    it('caps recent[] at 5 entries (FIFO, latest first)', async () => {
        await seed('songC')
        const clock = new FakeClock()

        for (let i = 0; i < 7; i++) {
            propagateTrackEditToSong(
                'songC',
                { key: `K${i}` },
                `sl${i}`,
                { clock, debounceMs: 1000 },
            )
            await clock.advance(1100)
            await flushPendingPropagations()
        }

        const song = await getDb().songs.get('songC')
        expect(song?.recent).toHaveLength(5)
        expect(song?.recent?.[0]?.key).toBe('K6')
        expect(song?.recent?.[4]?.key).toBe('K2')
        expect(song?.defaults?.key).toBe('K6')
    })

    it('merges defaults additively across separate flushes', async () => {
        await seed('songD')
        const clock = new FakeClock()

        propagateTrackEditToSong(
            'songD',
            { key: 'A' },
            'sl1',
            { clock, debounceMs: 1000 },
        )
        await clock.advance(1100)
        await flushPendingPropagations()

        propagateTrackEditToSong(
            'songD',
            { lead: 'Mira' },
            'sl1',
            { clock, debounceMs: 1000 },
        )
        await clock.advance(1100)
        await flushPendingPropagations()

        const song = await getDb().songs.get('songD')
        expect(song?.defaults).toEqual({ key: 'A', lead: 'Mira' })
        expect(song?.recent).toHaveLength(2)
    })

    it('flushPendingPropagations triggers pending flushes immediately', async () => {
        await seed('songE')
        const clock = new FakeClock()
        propagateTrackEditToSong(
            'songE',
            { bpm: 110 },
            'sl1',
            { clock, debounceMs: 5000 },
        )
        // Don't advance — flush directly
        await flushPendingPropagations()
        const song = await getDb().songs.get('songE')
        expect(song?.defaults?.bpm).toBe(110)
    })
})
