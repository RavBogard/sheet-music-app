import 'fake-indexeddb/auto'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase', () => ({
    subscribeWithDb: vi.fn(() => () => {}),
    recoverFromFirestoreShutdown: vi.fn(),
}))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import {
    SONGS_SCOPE_META_KEY,
    subscribeSongsLibrary,
    type DocChange,
    type SubscribeAdapter,
} from '@/lib/songs/subscribe'

// David's ask 2 (2026-09-22): the local songs table belongs to one site and
// one account at a time, and a late delivery cannot cross a switch.

function manualAdapter() {
    const calls: Array<{ orgId: string; push: (c: DocChange[]) => void; stopped: boolean }> = []
    const adapter: SubscribeAdapter = {
        subscribe(handler, _onError, orgId) {
            const call = { orgId, push: handler, stopped: false }
            calls.push(call)
            return () => {
                call.stopped = true
            }
        },
    }
    return { adapter, calls }
}

const flush = () => new Promise((r) => setTimeout(r, 30))

describe('subscribeSongsLibrary — host-org scope', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('asks the adapter for the host org only', () => {
        const { adapter, calls } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'brotherslazaroff', uid: 'u1' })
        expect(calls.map((c) => c.orgId)).toEqual(['brotherslazaroff'])
        stop()
    })

    it('writes only rows of the host org, even if the server sent another', async () => {
        const { adapter, calls } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'brotherslazaroff', uid: 'u1' })
        calls[0].push([
            { type: 'added', id: 'bl', data: { title: 'Pink Supermoon', orgId: 'brotherslazaroff' } },
            { type: 'added', id: 'crc', data: { title: 'Adon Olam', orgId: 'crc' } },
            { type: 'added', id: 'legacy', data: { title: 'Legacy' } },
        ])
        await waitFor(async () => expect((await getDb().songs.toArray()).map((s) => s.id)).toEqual(['bl']), { timeout: 5000 })
        stop()
    })

    it('a device that last served another site or account starts empty', async () => {
        const db = getDb()
        await db.meta.put({ key: SONGS_SCOPE_META_KEY, value: 'crc|u1' })
        await db.songs.bulkPut([
            { id: 'a', title: 'CRC song', normalizedTitle: 'crc song', orgId: 'crc' },
            { id: 'b', title: 'BL song', normalizedTitle: 'bl song', orgId: 'brotherslazaroff' },
        ])
        const { adapter } = manualAdapter()
        const stop = subscribeSongsLibrary({ db, firestore: adapter, orgId: 'brotherslazaroff', uid: 'u1' })
        await waitFor(async () => expect((await db.meta.get(SONGS_SCOPE_META_KEY))?.value).toBe('brotherslazaroff|u1'), { timeout: 5000 })
        expect(await db.songs.count()).toBe(0)
        stop()
    })

    it('first run on an old device keeps its own-site cache and drops foreign rows', async () => {
        const db = getDb()
        await db.songs.bulkPut([
            { id: 'a', title: 'CRC song', normalizedTitle: 'crc song', orgId: 'crc' },
            { id: 'legacy', title: 'Legacy', normalizedTitle: 'legacy' },
            { id: 'b', title: 'BL song', normalizedTitle: 'bl song', orgId: 'brotherslazaroff' },
        ])
        const { adapter } = manualAdapter()
        const stop = subscribeSongsLibrary({ db, firestore: adapter, orgId: 'crc', uid: 'u1' })
        await waitFor(async () => expect((await db.songs.toArray()).map((s) => s.id).sort()).toEqual(['a', 'legacy']), { timeout: 5000 })
        stop()
    })

    it('a delivery that arrives after unsubscribe writes nothing', async () => {
        const { adapter, calls } = manualAdapter()
        const stop = subscribeSongsLibrary({ db: getDb(), firestore: adapter, orgId: 'crc', uid: 'u1' })
        stop()
        expect(calls[0].stopped).toBe(true)
        calls[0].push([{ type: 'added', id: 'late', data: { title: 'Late', orgId: 'crc' } }])
        await flush()
        expect(await getDb().songs.count()).toBe(0)
    })
})
