// v50-06-03 Task 1 — startSnapshotListener: Firestore onSnapshot →
// Dexie direct-put with outbox-pending guard + LWW guard. Uses an
// injectable SnapshotSubscriber so the unit tests don't need a live
// Firestore (or even firebase-admin).

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalDb, resetDbForTests } from '../../local/schema'
import {
    type SetlistDelivery,
    type SnapshotSubscriber,
    type TrackChange,
    startSnapshotListener,
} from '../snapshot-listener'

// ─── Hand-rolled subscriber harness ────────────────────────────────────────

interface SubscriberHandle {
    deliverSetlist(delivery: SetlistDelivery | null): void
    deliverTracks(changes: TrackChange[]): void
    raiseSetlistError(err: Error): void
    raiseTracksError(err: Error): void
    setlistUnsubCount: number
    tracksUnsubCount: number
}

function makeSubscriberHarness(): {
    subscriber: SnapshotSubscriber
    handle: SubscriberHandle
} {
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
        subscribeTracks(_setlistId, onChanges, onError) {
            handle.deliverTracks = (changes) => onChanges(changes)
            handle.raiseTracksError = (e) => onError(e)
            return () => {
                handle.tracksUnsubCount += 1
            }
        },
    }

    return { subscriber, handle }
}

async function flush(rounds = 4): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

// Fresh per-test Dexie instance to keep tests hermetic.
const TEST_DB = 'crc-snap-listener'

describe('v50-06-03: startSnapshotListener', () => {
    let db: LocalDb
    let logger: { warn: ReturnType<typeof vi.fn> }

    beforeEach(async () => {
        await resetDbForTests()
        db = new LocalDb(TEST_DB)
        await db.outbox.count() // force open
        logger = { warn: vi.fn() }
    })

    afterEach(async () => {
        try {
            db.close()
        } catch {
            // ignore
        }
        try {
            const Dexie = (await import('dexie')).default
            await Dexie.delete(TEST_DB)
        } catch {
            // ignore
        }
    })

    it('AC-1: writes remote setlist + track deliveries directly to Dexie (no outbox row created)', async () => {
        await db.setlists.put({
            id: 's1',
            updatedAt: 1000,
            ownerId: 'u1',
            name: 'baseline',
        })
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'F',
            title: 'song-1',
            updatedAt: 1000,
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        handle.deliverSetlist({
            data: { id: 's1', name: 'remote-name', ownerId: 'u1' },
            updatedAt: 2000,
        })
        handle.deliverTracks([
            {
                type: 'modified',
                docId: 't1',
                data: { id: 't1', setlistId: 's1', order: 0, key: 'G', title: 'song-1' },
                updatedAt: 2000,
            },
        ])

        await flush()

        const sl = await db.setlists.get('s1')
        const tr = await db.tracks.get('t1')
        expect(sl?.name).toBe('remote-name')
        expect(sl?.updatedAt).toBe(2000)
        expect(tr?.key).toBe('G')
        expect(tr?.updatedAt).toBe(2000)

        // Critical: NO outbox row created.
        expect(await db.outbox.count()).toBe(0)

        stop()
    })

    it('AC-2: skips writes when outbox has a pending row for the docId', async () => {
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'A',
            updatedAt: 1000,
        })
        // Pending local edit — engine hasn't drained it yet.
        await db.outbox.add({
            status: 'pending',
            scheduledFor: Date.now(),
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { key: 'A' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: Date.now(),
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        // Remote echo of someone else's competing edit — listener must NOT
        // clobber local 'A' (the engine drain + ReconciliationProvider
        // own conflict resolution).
        handle.deliverTracks([
            {
                type: 'modified',
                docId: 't1',
                data: { id: 't1', setlistId: 's1', order: 0, key: 'G' },
                updatedAt: 1500,
            },
        ])

        await flush()

        const tr = await db.tracks.get('t1')
        expect(tr?.key).toBe('A') // local edit preserved
        expect(tr?.updatedAt).toBe(1000)

        stop()
    })

    it('AC-3: LWW guard — stale snapshot delivery does not overwrite a fresher local row', async () => {
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'C',
            updatedAt: 2000,
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        handle.deliverTracks([
            {
                type: 'modified',
                docId: 't1',
                data: { id: 't1', setlistId: 's1', order: 0, key: 'OLD' },
                updatedAt: 1500,
            },
        ])

        await flush()

        const tr = await db.tracks.get('t1')
        expect(tr?.key).toBe('C')
        expect(tr?.updatedAt).toBe(2000)

        stop()
    })

    it('removed track: deletes from local Dexie when no pending outbox row exists', async () => {
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            updatedAt: 1000,
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        handle.deliverTracks([
            { type: 'removed', docId: 't1', data: {}, updatedAt: 0 },
        ])

        await flush()

        expect(await db.tracks.get('t1')).toBeUndefined()
        expect(await db.outbox.count()).toBe(0)

        stop()
    })

    it('removed track: preserves local row if a pending outbox row exists for that docId', async () => {
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'F',
            updatedAt: 1000,
        })
        await db.outbox.add({
            status: 'pending',
            scheduledFor: Date.now(),
            op: 'set',
            collection: 'tracks',
            docId: 't1',
            payload: { id: 't1', setlistId: 's1', order: 0, key: 'F' },
            attempts: 0,
            createdAt: Date.now(),
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        handle.deliverTracks([
            { type: 'removed', docId: 't1', data: {}, updatedAt: 0 },
        ])

        await flush()

        const tr = await db.tracks.get('t1')
        expect(tr).toBeDefined() // pending insert preserved
        expect(tr?.key).toBe('F')

        stop()
    })

    it('listener errors: logged via opts.logger.warn, no throw out of callback', async () => {
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        handle.raiseSetlistError(new Error('permission-denied'))
        handle.raiseTracksError(new Error('unavailable'))

        await flush()

        expect(logger.warn).toHaveBeenCalledTimes(2)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('setlist subscription error'),
            expect.any(Error),
        )
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('tracks subscription error'),
            expect.any(Error),
        )

        stop()
    })

    it('returned unsubscribe stops both setlist and tracks subscriptions', async () => {
        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        stop()

        expect(handle.setlistUnsubCount).toBe(1)
        expect(handle.tracksUnsubCount).toBe(1)
    })

    it('post-unsubscribe deliveries are ignored (cancelled flag)', async () => {
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'F',
            updatedAt: 1000,
        })

        const { subscriber, handle } = makeSubscriberHarness()
        const stop = startSnapshotListener({
            setlistId: 's1',
            db,
            subscriber,
            logger,
        })

        stop()

        // Even if the test harness still routes a delivery (real Firestore
        // would have torn down by now, but be defensive), the listener's
        // `cancelled` flag drops it.
        handle.deliverTracks([
            {
                type: 'modified',
                docId: 't1',
                data: { id: 't1', setlistId: 's1', order: 0, key: 'CHANGED' },
                updatedAt: 5000,
            },
        ])

        await flush()

        const tr = await db.tracks.get('t1')
        expect(tr?.key).toBe('F')
        expect(tr?.updatedAt).toBe(1000)
    })
})
