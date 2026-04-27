import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalSetlist, LocalTrack } from '@/lib/local/types'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

// v50-06-03: hydrator mounts a Firestore-backed snapshot listener after
// hydration. Mock the module so existing tests don't try to boot Firebase;
// the listener-wiring behavior is covered by an explicit test below + the
// dedicated snapshot-listener.test.ts.
vi.mock('@/lib/sync/snapshot-listener', () => ({
    startSnapshotListener: vi.fn(() => () => {}),
}))

import { SetlistGridHydrator } from '../SetlistGridHydrator'

const SETLIST_ID = 'set-hyd-1'

function makeSetlist(updatedAt: number): LocalSetlist {
    return {
        id: SETLIST_ID,
        ownerId: 'user-1',
        name: 'Friday Service',
        updatedAt,
    }
}

function makeTracks(setlistUpdatedAt: number): LocalTrack[] {
    return [
        {
            id: 't-1',
            setlistId: SETLIST_ID,
            order: 0,
            title: 'Adon Olam',
            key: 'Dm',
            updatedAt: setlistUpdatedAt,
        },
        {
            id: 't-2',
            setlistId: SETLIST_ID,
            order: 1,
            title: 'Lecha Dodi',
            key: 'G',
            updatedAt: setlistUpdatedAt,
        },
    ]
}

describe('SetlistGridHydrator', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        // Unmount React tree first so the SetlistGrid live query stops
        // observing Dexie before we close the DB (avoids DatabaseClosedError
        // teardown race).
        cleanup()
        await resetDbForTests()
    })

    it('hydrates setlist + tracks into Dexie when local is empty', async () => {
        const updatedAt = 1_700_000_000_000
        const setlist = makeSetlist(updatedAt)
        const tracks = makeTracks(updatedAt)

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={setlist}
                initialTracks={tracks}
            />,
        )

        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            expect(local?.updatedAt).toBe(updatedAt)
            const localTracks = await getDb()
                .tracks.where('setlistId')
                .equals(SETLIST_ID)
                .toArray()
            expect(localTracks).toHaveLength(2)
            expect(localTracks.map((t) => t.id).sort()).toEqual([
                't-1',
                't-2',
            ])
        })
    })

    it('does NOT enqueue outbox rows for hydrated data', async () => {
        const updatedAt = 1_700_000_000_000

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={makeTracks(updatedAt)}
            />,
        )

        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            expect(local).toBeDefined()
        })

        const outbox = await getDb().outbox.toArray()
        expect(outbox).toHaveLength(0)
    })

    it('skips put for tracks whose local.updatedAt is newer than server (idempotent)', async () => {
        const serverUpdatedAt = 1_700_000_000_000
        const newerLocalUpdatedAt = serverUpdatedAt + 5_000

        // Pre-seed Dexie with a newer local copy of t-1.
        await getDb().tracks.put({
            id: 't-1',
            setlistId: SETLIST_ID,
            order: 0,
            title: 'Adon Olam (LOCAL EDIT)',
            key: 'Em',
            updatedAt: newerLocalUpdatedAt,
        })

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(serverUpdatedAt)}
                initialTracks={makeTracks(serverUpdatedAt)}
            />,
        )

        // Wait for hydration to settle (t-2 should land).
        await waitFor(async () => {
            const t2 = await getDb().tracks.get('t-2')
            expect(t2).toBeDefined()
        })

        // t-1 should still be the local edit; server's older row did not overwrite it.
        const t1 = await getDb().tracks.get('t-1')
        expect(t1?.title).toBe('Adon Olam (LOCAL EDIT)')
        expect(t1?.key).toBe('Em')
        expect(t1?.updatedAt).toBe(newerLocalUpdatedAt)
    })

    it('overwrites local setlist when server.updatedAt is newer', async () => {
        const oldUpdatedAt = 1_700_000_000_000
        const newUpdatedAt = oldUpdatedAt + 60_000

        await getDb().setlists.put({
            id: SETLIST_ID,
            ownerId: 'user-1',
            name: 'Stale Local Name',
            updatedAt: oldUpdatedAt,
        })

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    id: SETLIST_ID,
                    ownerId: 'user-1',
                    name: 'Fresh Server Name',
                    updatedAt: newUpdatedAt,
                }}
                initialTracks={[]}
            />,
        )

        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            expect(local?.name).toBe('Fresh Server Name')
            expect(local?.updatedAt).toBe(newUpdatedAt)
        })
    })

    it('renders the SetlistGrid host with the setlistId prop', async () => {
        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(1_700_000_000_000)}
                initialTracks={[]}
            />,
        )

        const host = await findByTestId('setlist-grid-hydrator')
        expect(host).toBeInTheDocument()

        // Drain pending live queries (SetlistGrid's tracks query) before
        // teardown so they don't throw DatabaseClosedError after Dexie closes.
        await findByTestId('setlist-grid-empty-state')
    })

    // v50-06-03: hydrator mounts the snapshot listener after hydration
    // completes, and unmounts it on cleanup. Wiring-only — listener
    // behavior is covered by snapshot-listener.test.ts.
    it('starts the snapshot listener after hydration; unsubscribes on unmount', async () => {
        const stopFn = vi.fn()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const startFn = vi.fn((_opts: any) => stopFn)

        const { findByTestId, unmount } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(1_700_000_000_000)}
                initialTracks={[]}
                startSnapshotListener={startFn}
            />,
        )

        // Drain SetlistGrid's live query so teardown is clean.
        await findByTestId('setlist-grid-empty-state')

        await waitFor(() => {
            expect(startFn).toHaveBeenCalledTimes(1)
        })

        const callArgs = startFn.mock.calls[0]?.[0] as
            | { setlistId: string; db: unknown }
            | undefined
        expect(callArgs?.setlistId).toBe(SETLIST_ID)
        expect(callArgs?.db).toBeDefined()

        unmount()
        expect(stopFn).toHaveBeenCalledTimes(1)
    })
})
