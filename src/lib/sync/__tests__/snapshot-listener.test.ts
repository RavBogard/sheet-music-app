// startSnapshotListener (setlist sync PR 3): each live (non-cache) tracks
// snapshot is the FULL server set for the setlist; the Dexie cache is
// replaced by it and ghosts are pruned. Uses an injectable SnapshotSubscriber
// so no Firestore is needed.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { captureSyncFailure } = vi.hoisted(() => ({ captureSyncFailure: vi.fn() }))
vi.mock('../sentry-capture', () => ({ captureSyncFailure }))

import { LocalDb, resetDbForTests } from '../../local/schema'
import { _resetServerCacheMemory, applyOpsRows } from '../../setlist-ops-client/server-cache'
import { useLiveFlags } from '../../setlist-ops-client/freshness'
import {
    type SetlistDelivery,
    type SnapshotSubscriber,
    type TracksDelivery,
    startSnapshotListener,
} from '../snapshot-listener'

interface SubscriberHandle {
    deliverSetlist(delivery: SetlistDelivery | null): void
    deliverTracks(delivery: TracksDelivery): void
    raiseSetlistError(err: Error): void
    raiseTracksError(err: Error): void
    setlistUnsubCount: number
    tracksUnsubCount: number
}

function makeSubscriberHarness(): { subscriber: SnapshotSubscriber; handle: SubscriberHandle } {
    const handle: SubscriberHandle = {
        deliverSetlist: () => {},
        deliverTracks: () => {},
        raiseSetlistError: () => {},
        raiseTracksError: () => {},
        setlistUnsubCount: 0,
        tracksUnsubCount: 0,
    }
    const subscriber: SnapshotSubscriber = {
        subscribeSetlist(_setlistId, onNext, onError) {
            handle.deliverSetlist = (d) => onNext(d)
            handle.raiseSetlistError = (e) => onError(e)
            return () => {
                handle.setlistUnsubCount += 1
            }
        },
        subscribeTracks(_setlistId, onSet, onError) {
            handle.deliverTracks = (d) => onSet(d)
            handle.raiseTracksError = (e) => onError(e)
            return () => {
                handle.tracksUnsubCount += 1
            }
        },
    }
    return { subscriber, handle }
}

async function flush(rounds = 6): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

const row = (id: string, order: number, extra: Record<string, unknown> = {}) => ({
    id,
    data: { id, setlistId: 's1', orgId: 'crc', order, title: `T ${id}`, version: 1, updatedAt: 1000, ...extra },
})

const TEST_DB = 'crc-snap-listener'
const ready = () => Promise.resolve()

describe('startSnapshotListener: the server cache', () => {
    let db: LocalDb
    let logger: { warn: ReturnType<typeof vi.fn> }

    beforeEach(async () => {
        await resetDbForTests()
        _resetServerCacheMemory()
        useLiveFlags.setState({ rows: {}, setlist: {} })
        db = new LocalDb(TEST_DB)
        await db.outbox.count()
        logger = { warn: vi.fn() }
    })

    afterEach(async () => {
        try {
            db.close()
        } catch {
            // ignore
        }
        const Dexie = (await import('dexie')).default
        await Dexie.delete(TEST_DB).catch(() => {})
    })

    it('a live tracks snapshot replaces the cached set: ghosts are pruned, rows updated, nothing queued', async () => {
        await db.tracks.bulkPut([
            { id: 'a', setlistId: 's1', order: 0, title: 'old a', updatedAt: 1 },
            { id: 'ghost', setlistId: 's1', order: 1, title: 'browser only', updatedAt: 1 },
            { id: 'other', setlistId: 's2', order: 0, title: 'another setlist', updatedAt: 1 },
        ])
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready })

        handle.deliverTracks({ fromCache: false, rows: [row('a', 0, { title: 'new a' }), row('b', 1)] })
        await flush()

        const s1 = (await db.tracks.where('setlistId').equals('s1').toArray()).sort((x, y) => x.order - y.order)
        expect(s1.map((r) => r.id)).toEqual(['a', 'b'])
        expect(s1[0].title).toBe('new a')
        expect(s1[0].updatedAt).toBe(1000)
        expect(await db.tracks.get('other')).toBeDefined()
        expect(await db.outbox.count()).toBe(0)
        expect(await db.intents.count()).toBe(0)
        expect(useLiveFlags.getState().rows.s1).toBe(true)
        stop()
    })

    it('a snapshot from the local Firestore cache is ignored', async () => {
        await db.tracks.put({ id: 'a', setlistId: 's1', order: 0, title: 'kept', updatedAt: 1 })
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready })

        handle.deliverTracks({ fromCache: true, rows: [] })
        await flush()

        expect((await db.tracks.get('a'))?.title).toBe('kept')
        expect(useLiveFlags.getState().rows.s1).toBeUndefined()
        stop()
    })

    it('never lowers a row version, and keeps a row an /ops answer just wrote', async () => {
        await applyOpsRows(db, 's1', [{ ...row('a', 0, { title: 'mine', version: 5 }).data, id: 'a' }, { ...row('new', 1).data, id: 'new' }], [])
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready })

        // A snapshot taken before the write: older version of a, no `new` yet.
        handle.deliverTracks({ fromCache: false, rows: [row('a', 0, { title: 'stale', version: 4 })] })
        await flush()

        expect((await db.tracks.get('a'))?.title).toBe('mine')
        expect(await db.tracks.get('new')).toBeDefined()
        stop()
    })

    it('waits for `ready` (the old-outbox migration) before pruning', async () => {
        await db.tracks.put({ id: 'ghost', setlistId: 's1', order: 0, updatedAt: 1 })
        let release: () => void = () => {}
        const gate = new Promise<void>((r) => (release = r))
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready: () => gate })

        handle.deliverTracks({ fromCache: false, rows: [] })
        await flush()
        expect(await db.tracks.get('ghost')).toBeDefined()

        release()
        await flush()
        expect(await db.tracks.get('ghost')).toBeUndefined()
        stop()
    })

    it('the setlist doc: a live delivery is cached; an older version never replaces a newer one', async () => {
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready })

        handle.deliverSetlist({ data: { name: 'v3', version: 3, ownerId: 'u' }, updatedAt: 3000, fromCache: false })
        await flush()
        handle.deliverSetlist({ data: { name: 'v2', version: 2, ownerId: 'u' }, updatedAt: 2000, fromCache: false })
        handle.deliverSetlist({ data: { name: 'cached', version: 9, ownerId: 'u' }, updatedAt: 9000, fromCache: true })
        await flush()

        const s = await db.setlists.get('s1')
        expect(s?.name).toBe('v3')
        expect(s?.updatedAt).toBe(3000)
        expect(useLiveFlags.getState().setlist.s1).toBe(true)
        stop()
    })

    it('listener errors: logged at error level with the Firestore code, no throw, no re-subscribe', async () => {
        const { subscriber, handle } = makeSubscriberHarness()
        const tracksSpy = vi.spyOn(subscriber, 'subscribeTracks')
        const errorLogger = { warn: vi.fn(), error: vi.fn() }
        const stop = startSnapshotListener({ setlistId: 's1', db, orgId: 'crc', subscriber, logger: errorLogger, ready })

        const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
        handle.raiseSetlistError(new Error('unavailable'))
        handle.raiseTracksError(denied)
        await flush()

        expect(errorLogger.error).toHaveBeenCalledTimes(2)
        expect(errorLogger.error).toHaveBeenCalledWith(expect.stringMatching(/tracks subscription.*code=permission-denied/), denied)
        expect(tracksSpy).toHaveBeenCalledTimes(1)
        expect(tracksSpy.mock.calls[0]?.[3]).toBe('crc')
        stop()
    })

    it('a handled permission-denied calls onTracksRefused at info level and skips Sentry; other errors do not', async () => {
        for (const [code, refused] of [['permission-denied', true], ['unavailable', false]] as const) {
            captureSyncFailure.mockClear()
            const { subscriber, handle } = makeSubscriberHarness()
            const onTracksRefused = vi.fn()
            const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
            const stop = startSnapshotListener({
                setlistId: 's1',
                db,
                orgId: 'brotherslazaroff',
                subscriber,
                logger: log,
                onTracksRefused,
                ready,
            })
            handle.raiseTracksError(Object.assign(new Error(code), { code }))
            await flush()
            expect(onTracksRefused).toHaveBeenCalledTimes(refused ? 1 : 0)
            expect(log.info).toHaveBeenCalledTimes(refused ? 1 : 0)
            expect(log.error).toHaveBeenCalledTimes(refused ? 0 : 1)
            expect(captureSyncFailure).toHaveBeenCalledTimes(refused ? 0 : 1)
            stop()
        }
    })

    it('unsubscribe stops both subscriptions, and later deliveries are dropped', async () => {
        await db.tracks.put({ id: 't1', setlistId: 's1', order: 0, key: 'F', updatedAt: 1000 })
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({ setlistId: 's1', db, subscriber, logger, ready })
        stop()
        expect(handle.setlistUnsubCount).toBe(1)
        expect(handle.tracksUnsubCount).toBe(1)

        handle.deliverTracks({ fromCache: false, rows: [] })
        await flush()
        expect((await db.tracks.get('t1'))?.key).toBe('F')
    })
})
