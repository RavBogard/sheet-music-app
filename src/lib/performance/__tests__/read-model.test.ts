import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { LocalDb, resetDbForTests } from '../../local/schema'
import { _resetServerCacheMemory } from '../../setlist-ops-client/server-cache'
import { _resetReadModelMemory, decideHeal, decideSeed, seedCacheFromSsr, selfCheckAndHeal, shouldSkipHeal } from '../read-model'

const SID = 's1'
const row = (id: string, order: number, version = 1) => ({ id, setlistId: SID, order, title: id, version })

describe('version decisions', () => {
    it('seeds only when the render is strictly newer (or the cache is empty)', () => {
        expect(decideSeed(5, 4, true)).toBe('seed')
        expect(decideSeed(4, 4, true)).toBe('keep')
        expect(decideSeed(3, 4, true)).toBe('keep')
        expect(decideSeed(1, undefined, false)).toBe('seed')
    })
    it('heals only when the server is strictly ahead', () => {
        expect(decideHeal(4, 5)).toBe('heal')
        expect(decideHeal(5, 5)).toBe('ok')
        expect(decideHeal(6, 5)).toBe('ok')
    })
})

describe('seed and heal against the cache', () => {
    let db: LocalDb
    beforeEach(async () => {
        await resetDbForTests()
        _resetServerCacheMemory()
        _resetReadModelMemory()
        db = new LocalDb('read-model-test')
        await db.tracks.clear()
        await db.setlists.clear()
    })
    const ids = async () => (await db.tracks.where('setlistId').equals(SID).sortBy('order')).map((r) => r.id)

    it('a newer render replaces an older cache, ghosts included', async () => {
        await db.setlists.put({ id: SID, version: 2, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0), row('ghost', 1)] as never)
        const seeded = await seedCacheFromSsr(db, SID, { version: 3, rows: [row('a', 0, 2), row('b', 1, 2)] })
        expect(seeded).toBe(true)
        expect(await ids()).toEqual(['a', 'b'])
    })

    it('an older or equal render leaves the cache alone', async () => {
        await db.setlists.put({ id: SID, version: 5, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0, 5)] as never)
        expect(await seedCacheFromSsr(db, SID, { version: 5, rows: [row('z', 0)] })).toBe(false)
        expect(await ids()).toEqual(['a'])
    })

    it('self-check refetches and replaces when the server is ahead, silently', async () => {
        await db.setlists.put({ id: SID, version: 2, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0), row('old', 1)] as never)
        const healed = await selfCheckAndHeal(db, SID, async () => ({ version: 4, rows: [row('b', 0, 4), row('a', 1, 4)] }))
        expect(healed).toBe(true)
        expect(await ids()).toEqual(['b', 'a'])
    })

    it('self-check does nothing when current, or when the server cannot be reached', async () => {
        await db.setlists.put({ id: SID, version: 4, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0, 4)] as never)
        expect(await selfCheckAndHeal(db, SID, async () => ({ version: 4, rows: [row('z', 0, 4)] }))).toBe(false)
        expect(await selfCheckAndHeal(db, SID, async () => null)).toBe(false)
        expect(await selfCheckAndHeal(db, SID, async () => { throw new Error('offline') })).toBe(false)
        expect(await ids()).toEqual(['a'])
    })

    it('a device with no cached setlist doc heals once, not on every focus', async () => {
        let calls = 0
        const fetchSet = async () => (calls++, { version: 3, rows: [row('a', 0, 3)] })
        expect(await selfCheckAndHeal(db, SID, fetchSet)).toBe(true)
        expect(await selfCheckAndHeal(db, SID, fetchSet)).toBe(false)
    })
})


describe('races and live-listener skip', () => {
    let db: LocalDb
    beforeEach(async () => {
        await resetDbForTests()
        _resetServerCacheMemory()
        _resetReadModelMemory()
        db = new LocalDb('read-model-race-test')
        await db.tracks.clear()
        await db.setlists.clear()
    })
    const ids = async () => (await db.tracks.where('setlistId').equals(SID).sortBy('order')).map((r) => r.id)

    it('a heal fetch that finishes after a newer live snapshot replaces nothing and prunes nothing', async () => {
        await db.setlists.put({ id: SID, version: 3, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0, 3)] as never)
        const healed = await selfCheckAndHeal(db, SID, async () => {
            // While the fetch is in flight the live listener lands version 6.
            await db.setlists.put({ id: SID, version: 6, name: 'x' } as never)
            await db.tracks.bulkPut([row('a', 0, 6), row('new', 1, 6)] as never)
            return { version: 5, rows: [row('a', 0, 5)] }
        })
        expect(healed).toBe(false)
        expect(await ids()).toEqual(['a', 'new'])
    })

    it('an SSR seed that loses the same race is skipped too', async () => {
        await db.setlists.put({ id: SID, version: 2, name: 'x' } as never)
        await db.tracks.bulkPut([row('a', 0, 2)] as never)
        const pending = seedCacheFromSsr(db, SID, { version: 4, rows: [row('s', 0, 4)] })
        await db.setlists.put({ id: SID, version: 7, name: 'x' } as never)
        await db.tracks.bulkPut([row('live', 1, 7)] as never)
        await pending
        expect(await ids()).toContain('live')
    })

    it('the focus heal fetch is skipped while a live snapshot arrived within 60 s', () => {
        const now = 1_000_000
        expect(shouldSkipHeal(now - 10_000, now)).toBe(true)
        expect(shouldSkipHeal(now - 61_000, now)).toBe(false)
        expect(shouldSkipHeal(0, now)).toBe(false)
    })
})
