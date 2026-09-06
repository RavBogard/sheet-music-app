import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type {
    EditDescriptor,
    LocalSetlist,
    LocalTrack,
} from '@/lib/local/types'
import {
    loadAdjusted,
    loadAdjustedDelay,
} from '@/test-utils/load-adjusted-timing'

type ApplyEditSpyArgs = [
    edit: EditDescriptor,
    options?: { withoutUndo?: boolean },
]
function makeApplyEditSpy(impl?: (edit: EditDescriptor) => Promise<void>) {
    return vi.fn<(...args: ApplyEditSpyArgs) => Promise<void>>(
        async (edit) => {
            if (impl) await impl(edit)
        },
    )
}

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

// v60-09-01: same mock posture for the songs subscription — production
// default calls onSnapshot(collection(firestoreDb,'songs')) which would
// fail against the empty firebase mock. Tests that assert subscribe-wiring
// behavior pass an explicit `subscribeSongsLibrary` prop spy below.
vi.mock('@/lib/songs/subscribe', () => ({
    subscribeSongsLibrary: vi.fn(() => () => {}),
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
                // v50-07-03: lazy-hydration would enqueue outbox rows for a
                // legacy setlist; this test verifies the steady-state priming
                // path emits zero, so explicitly mark already-hydrated.
                initialSetlist={{ ...makeSetlist(updatedAt), hydrated: true }}
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
                // v50-07-03: post-migration setlist; this test exercises the
                // LWW-priming idempotency, not the lazy-hydration cascade
                // (which would call applyEdit('set') and clobber the local edit).
                initialSetlist={{ ...makeSetlist(serverUpdatedAt), hydrated: true }}
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

    // v50-07-03: lazy-hydration fan-out — verifies the conditional gate
    // (legacy + not-yet-hydrated + has tracks) and the migration cascade
    // (N applyEdit('set','tracks',...) + 1 applyEdit('update','setlists',
    // {hydrated:true})). Tests the test-seam applyEdit prop, NOT the real
    // outbox path (covered separately by write.test.ts + drain tests).
    it('lazy-hydrates legacy tracks then marks the setlist hydrated', async () => {
        const updatedAt = 1_700_000_000_000
        const applyEditSpy = makeApplyEditSpy()

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={makeTracks(updatedAt)}
                applyEdit={applyEditSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        await waitFor(() => {
            expect(applyEditSpy).toHaveBeenCalledTimes(3)
        })

        const setCalls = applyEditSpy.mock.calls.filter(
            ([edit]) => edit.op === 'set' && edit.collection === 'tracks',
        )
        expect(setCalls).toHaveLength(2)
        for (const [, options] of setCalls) {
            expect(options).toEqual({ withoutUndo: true })
        }

        const updateCalls = applyEditSpy.mock.calls.filter(
            ([edit]) =>
                edit.op === 'update' && edit.collection === 'setlists',
        )
        expect(updateCalls).toHaveLength(1)
        const [updateEdit, updateOptions] = updateCalls[0]!
        if (updateEdit.op !== 'update') throw new Error('unreachable')
        expect(updateEdit.docId).toBe(SETLIST_ID)
        // P0 cascade-race fix (2026-05-12): trackCount is now folded into
        // the cascade's hydrated:true update so a parallel reconciler
        // write doesn't race the cascade on setlists/{S}.
        // v60-06-02: songCount + fileIds also folded in (same race-prevention
        // reasoning — denormalized fields land atomically with hydrated:true).
        expect(updateEdit.patch).toEqual({
            hydrated: true,
            trackCount: 2,
            songCount: 2,
            fileIds: [],
        })
        expect(updateEdit.expectedUpdatedAt).toBe(updatedAt)
        expect(updateOptions).toEqual({ withoutUndo: true })
    })

    it('skips lazy-hydration when the setlist is already hydrated', async () => {
        const updatedAt = 1_700_000_000_000
        const applyEditSpy = makeApplyEditSpy()

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{ ...makeSetlist(updatedAt), hydrated: true }}
                initialTracks={makeTracks(updatedAt)}
                applyEdit={applyEditSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        // Settle: even after hydration completes, no fan-out should fire.
        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            expect(local).toBeDefined()
        })
        expect(applyEditSpy).not.toHaveBeenCalled()
    })

    it('skips lazy-hydration when initialTracks is empty', async () => {
        const updatedAt = 1_700_000_000_000
        const applyEditSpy = makeApplyEditSpy()

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={[]}
                applyEdit={applyEditSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            expect(local).toBeDefined()
        })
        expect(applyEditSpy).not.toHaveBeenCalled()
    })

    it('does NOT mark the setlist hydrated when fan-out fails', async () => {
        const updatedAt = 1_700_000_000_000
        const applyEditSpy = makeApplyEditSpy(async (edit) => {
            // Fail the very first fan-out call (a 'set tracks').
            if (edit.op === 'set' && edit.collection === 'tracks') {
                throw new Error('fan-out boom')
            }
        })

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={makeTracks(updatedAt)}
                applyEdit={applyEditSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        await waitFor(() => {
            expect(applyEditSpy).toHaveBeenCalled()
        })

        // No update('setlists', {hydrated:true}) was made.
        const updateCalls = applyEditSpy.mock.calls.filter(
            ([edit]) =>
                edit.op === 'update' && edit.collection === 'setlists',
        )
        expect(updateCalls).toHaveLength(0)
    })

    it('fires lazy-hydration only once per mount (re-render does not retrigger)', async () => {
        const updatedAt = 1_700_000_000_000
        const applyEditSpy = makeApplyEditSpy()

        const { findByTestId, rerender } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={makeTracks(updatedAt)}
                applyEdit={applyEditSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        await waitFor(() => {
            expect(applyEditSpy).toHaveBeenCalledTimes(3)
        })

        // Force a re-render with a NEW initialSetlist reference but same
        // logical content — the guard ref must keep us from re-firing.
        rerender(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={makeSetlist(updatedAt)}
                initialTracks={makeTracks(updatedAt)}
                applyEdit={applyEditSpy}
            />,
        )

        // Drain microtasks; ensure no additional calls landed. Scaled by
        // VITEST_LOAD_FACTOR so suite-wide parallel CPU pressure can't
        // squeeze the drain below microtask quiescence.
        await loadAdjustedDelay(20)
        expect(applyEditSpy).toHaveBeenCalledTimes(3)
    })

    // v5h-01-02 fix (F): outbox-pending guard. Server priming must NOT
    // overwrite local rows that have an in-flight edit in the outbox
    // (status pending|sending|failed). Mirrors snapshot-listener.ts:197.
    // These tests reproduce Daniel's UAT save-loss path against the
    // Hydrator: a stuck-pending outbox row was being silently clobbered
    // by re-priming on every re-mount.
    it('skips setlist priming when outbox has a pending row for the same setlistId', async () => {
        const localUpdatedAt = 1_700_000_000_000
        const newerServerUpdatedAt = localUpdatedAt + 60_000

        // Pre-seed a stale local setlist + a pending outbox row for it.
        await getDb().setlists.put({
            id: SETLIST_ID,
            ownerId: 'user-1',
            name: 'Local Edit In Flight',
            updatedAt: localUpdatedAt,
        })
        await getDb().outbox.add({
            status: 'pending',
            scheduledFor: localUpdatedAt,
            op: 'update',
            collection: 'setlists',
            docId: SETLIST_ID,
            payload: { name: 'Local Edit In Flight' },
            attempts: 0,
            createdAt: localUpdatedAt,
        })

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    id: SETLIST_ID,
                    ownerId: 'user-1',
                    name: 'Server Wants To Win',
                    updatedAt: newerServerUpdatedAt,
                    hydrated: true,
                }}
                initialTracks={[]}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        // Wait for hydrate() to settle (snapshot listener mount happens
        // after hydration === 'done', so its mock firing is our signal).
        await waitFor(async () => {
            const local = await getDb().setlists.get(SETLIST_ID)
            // Local row preserved despite newer server payload.
            expect(local?.name).toBe('Local Edit In Flight')
            expect(local?.updatedAt).toBe(localUpdatedAt)
        })
    })

    it('skips track priming for tracks with pending outbox rows; primes the rest', async () => {
        const updatedAt = 1_700_000_000_000

        // Pre-seed a stale local t-1 + pending outbox row for it.
        await getDb().tracks.put({
            id: 't-1',
            setlistId: SETLIST_ID,
            order: 0,
            title: 'Adon Olam (LOCAL EDIT IN FLIGHT)',
            key: 'E',
            updatedAt,
        })
        await getDb().outbox.add({
            status: 'pending',
            scheduledFor: updatedAt,
            op: 'update',
            collection: 'tracks',
            docId: 't-1',
            payload: { key: 'E' },
            expectedUpdatedAt: updatedAt,
            attempts: 0,
            createdAt: updatedAt,
        })

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    ...makeSetlist(updatedAt),
                    hydrated: true,
                }}
                initialTracks={makeTracks(updatedAt)}
            />,
        )

        // t-2 lands from server priming.
        await waitFor(async () => {
            const t2 = await getDb().tracks.get('t-2')
            expect(t2).toBeDefined()
            expect(t2?.title).toBe('Lecha Dodi')
        })

        // t-1 still carries the local in-flight edit; server priming was skipped.
        const t1 = await getDb().tracks.get('t-1')
        expect(t1?.title).toBe('Adon Olam (LOCAL EDIT IN FLIGHT)')
        expect(t1?.key).toBe('E')
    })

    it('primes only the track without a pending outbox row when one of two locals is in flight', async () => {
        const updatedAt = 1_700_000_000_000

        // Both t-1 and t-2 are stale locally; only t-1 has a pending outbox row.
        await getDb().tracks.bulkPut([
            {
                id: 't-1',
                setlistId: SETLIST_ID,
                order: 0,
                title: 'Adon Olam (STALE WITH OUTBOX)',
                key: 'E',
                updatedAt: updatedAt - 10_000,
            },
            {
                id: 't-2',
                setlistId: SETLIST_ID,
                order: 1,
                title: 'Lecha Dodi (STALE NO OUTBOX)',
                key: 'F',
                updatedAt: updatedAt - 10_000,
            },
        ])
        await getDb().outbox.add({
            status: 'failed',
            scheduledFor: updatedAt,
            op: 'update',
            collection: 'tracks',
            docId: 't-1',
            payload: { key: 'E' },
            expectedUpdatedAt: updatedAt - 10_000,
            attempts: 3,
            lastError: 'permission-denied',
            createdAt: updatedAt - 10_000,
        })

        render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    ...makeSetlist(updatedAt),
                    hydrated: true,
                }}
                initialTracks={makeTracks(updatedAt)}
            />,
        )

        // t-2 (no outbox row) updated to server payload; t-1 preserved.
        await waitFor(async () => {
            const t2 = await getDb().tracks.get('t-2')
            expect(t2?.title).toBe('Lecha Dodi')
            expect(t2?.updatedAt).toBe(updatedAt)
        })
        const t1 = await getDb().tracks.get('t-1')
        expect(t1?.title).toBe('Adon Olam (STALE WITH OUTBOX)')
        expect(t1?.key).toBe('E')
    })

    // v60-09-01: library subscription runs once after Dexie hydration completes.
    // Replaces the v53-02-01 prime tests. Test-seam injection
    // (`subscribeSongsLibrary` prop) avoids booting Firestore.
    it('v60-09-01: calls subscribeSongsLibrary once after hydration completes', async () => {
        const stopSpy = vi.fn()
        const subscribeSpy = vi.fn(() => stopSpy)

        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    ...makeSetlist(1_700_000_000_000),
                    hydrated: true,
                }}
                initialTracks={[]}
                subscribeSongsLibrary={subscribeSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')

        await waitFor(() => {
            expect(subscribeSpy).toHaveBeenCalledTimes(1)
        })
    })

    it('v60-09-01: does NOT re-subscribe on re-render (sentinel guard)', async () => {
        const stopSpy = vi.fn()
        const subscribeSpy = vi.fn(() => stopSpy)
        const setlist = {
            ...makeSetlist(1_700_000_000_000),
            hydrated: true,
        }

        const { findByTestId, rerender } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={setlist}
                initialTracks={[]}
                subscribeSongsLibrary={subscribeSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')
        await waitFor(() => {
            expect(subscribeSpy).toHaveBeenCalledTimes(1)
        })

        rerender(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={setlist}
                initialTracks={[]}
                subscribeSongsLibrary={subscribeSpy}
            />,
        )

        await new Promise((r) => setTimeout(r, 20))
        expect(subscribeSpy).toHaveBeenCalledTimes(1)
    })

    it('v60-09-01: calls unsubscribe on unmount', async () => {
        const stopSpy = vi.fn()
        const subscribeSpy = vi.fn(() => stopSpy)

        const { findByTestId, unmount } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={{
                    ...makeSetlist(1_700_000_000_000),
                    hydrated: true,
                }}
                initialTracks={[]}
                subscribeSongsLibrary={subscribeSpy}
            />,
        )

        await findByTestId('setlist-grid-empty-state')
        await waitFor(() => {
            expect(subscribeSpy).toHaveBeenCalledTimes(1)
        })

        unmount()
        expect(stopSpy).toHaveBeenCalledTimes(1)
    })

    // v50-06-03: hydrator mounts the snapshot listener after hydration
    // completes, and unmounts it on cleanup. Wiring-only — listener
    // behavior is covered by snapshot-listener.test.ts.
    it('starts the snapshot listener after hydration; unsubscribes on unmount', async () => {
        const stopFn = vi.fn()

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

    // v60-13-06: content-hash dedup. The hydrator's hydrate() effect runs once
    // per [setlistId, initialSetlist, initialTracks] dep change. When the page
    // re-renders with new prop references whose CONTENT is unchanged but
    // `updatedAt` has advanced (cached → network snapshot delivering the same
    // payload with a fresher serverTimestamp), the prior LWW guard would let
    // the put through and re-fire useLiveQuery — perceived by Daniel as a
    // mid-edit "auto refresh". Dedup-by-content-hash skips that put.
    describe('v60-13-06 content-hash dedup', () => {
        it('skips redundant Dexie writes when re-rendered with identical content but newer updatedAt', async () => {
            const updatedAt = 1_700_000_000_000
            const setlist = { ...makeSetlist(updatedAt), hydrated: true }
            const tracks = makeTracks(updatedAt)

            const setlistsPutSpy = vi.spyOn(getDb().setlists, 'put')
            const tracksBulkPutSpy = vi.spyOn(getDb().tracks, 'bulkPut')

            const { findByTestId, rerender } = render(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={setlist}
                    initialTracks={tracks}
                />,
            )

            await findByTestId('setlist-grid-empty-state')
            await waitFor(async () => {
                const local = await getDb().setlists.get(SETLIST_ID)
                expect(local).toBeDefined()
            })

            const initialSetlistsPuts = setlistsPutSpy.mock.calls.length
            const initialTracksBulkPuts = tracksBulkPutSpy.mock.calls.length
            expect(initialSetlistsPuts).toBeGreaterThanOrEqual(1)
            expect(initialTracksBulkPuts).toBeGreaterThanOrEqual(1)

            // Re-render with NEW object references and a NEWER updatedAt but
            // identical content (simulates Firestore cached → network emission
            // delivering the same payload with a refreshed serverTimestamp).
            const newerUpdatedAt = updatedAt + 1000
            rerender(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={{ ...makeSetlist(newerUpdatedAt), hydrated: true }}
                    initialTracks={makeTracks(newerUpdatedAt)}
                />,
            )

            // Allow the hydrate() effect to run + settle without firing puts.
            await new Promise((r) => setTimeout(r, 50))

            expect(setlistsPutSpy.mock.calls.length).toBe(initialSetlistsPuts)
            expect(tracksBulkPutSpy.mock.calls.length).toBe(initialTracksBulkPuts)

            // Genuine content delta still propagates (AC-2): re-render with a
            // DIFFERENT setlist name + a different track title.
            const newestUpdatedAt = newerUpdatedAt + 1000
            const changedSetlist = {
                ...makeSetlist(newestUpdatedAt),
                name: 'Renamed Service',
                hydrated: true,
            }
            const changedTracks: LocalTrack[] = [
                {
                    id: 't-1',
                    setlistId: SETLIST_ID,
                    order: 0,
                    title: 'Adon Olam (renamed)',
                    key: 'Dm',
                    updatedAt: newestUpdatedAt,
                },
                {
                    id: 't-2',
                    setlistId: SETLIST_ID,
                    order: 1,
                    title: 'Lecha Dodi',
                    key: 'G',
                    updatedAt: newestUpdatedAt,
                },
            ]
            rerender(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={changedSetlist}
                    initialTracks={changedTracks}
                />,
            )

            await waitFor(async () => {
                const local = await getDb().setlists.get(SETLIST_ID)
                expect(local?.name).toBe('Renamed Service')
                const t1 = await getDb().tracks.get('t-1')
                expect(t1?.title).toBe('Adon Olam (renamed)')
            })

            expect(setlistsPutSpy.mock.calls.length).toBeGreaterThan(
                initialSetlistsPuts,
            )
            expect(tracksBulkPutSpy.mock.calls.length).toBeGreaterThan(
                initialTracksBulkPuts,
            )

            setlistsPutSpy.mockRestore()
            tracksBulkPutSpy.mockRestore()
        })
    })

    // v54-01-03 trackCount reconciler — fires applyEdit on setlists/{id}
    // whenever the live Dexie tracks-by-setlistId count drifts from
    // initialSetlist.trackCount. Fixes the dashboard "0 songs" display
    // for v50-05+ setlists where trackCount was only set at create-time
    // from the (empty) initial tracks array.
    describe('v54-01-03 trackCount reconciliation', () => {
        it('patches setlist.trackCount when Dexie count differs from initial snapshot', async () => {
            const setlist: LocalSetlist = {
                id: SETLIST_ID,
                ownerId: 'user-1',
                name: 'Friday Service',
                updatedAt: 1_700_000_000_000,
                trackCount: 0,        // stored on doc — stale
                hydrated: true,        // skip lazy-hydration cascade
            }
            // 3 tracks in Dexie but setlist.trackCount = 0 → reconciler should patch to 3
            const tracks: LocalTrack[] = [0, 1, 2].map((i) => ({
                id: `t-${i}`,
                setlistId: SETLIST_ID,
                order: i,
                title: `Track ${i}`,
                updatedAt: 1_700_000_000_000,
            }))
            await getDb().setlists.put(setlist)
            await getDb().tracks.bulkPut(tracks)

            const applyEditSpy = makeApplyEditSpy()

            render(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={setlist}
                    initialTracks={tracks}
                    applyEdit={applyEditSpy}
                />,
            )

            // Reconciler is debounced 800ms; allow up to 3s for the spy to fire.
            // Scaled by VITEST_LOAD_FACTOR so suite-wide parallel CPU pressure
            // doesn't squeeze the (3000 - 800) ≈ 2200ms buffer below the
            // debounce + applyEdit settlement window.
            await waitFor(
                () => {
                    const trackCountCall = applyEditSpy.mock.calls.find(
                        ([edit]) =>
                            edit.op === 'update' &&
                            edit.collection === 'setlists' &&
                            edit.docId === SETLIST_ID &&
                            (edit.patch as Record<string, unknown>)?.trackCount === 3,
                    )
                    expect(trackCountCall).toBeDefined()
                },
                { timeout: loadAdjusted(3000) },
            )
        })

        it('does NOT patch when trackCount already matches', async () => {
            const setlist: LocalSetlist = {
                id: SETLIST_ID,
                ownerId: 'user-1',
                name: 'Friday Service',
                updatedAt: 1_700_000_000_000,
                trackCount: 2,        // matches
                hydrated: true,
            }
            const tracks: LocalTrack[] = [0, 1].map((i) => ({
                id: `t-${i}`,
                setlistId: SETLIST_ID,
                order: i,
                title: `Track ${i}`,
                updatedAt: 1_700_000_000_000,
            }))
            await getDb().setlists.put(setlist)
            await getDb().tracks.bulkPut(tracks)

            const applyEditSpy = makeApplyEditSpy()

            render(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={setlist}
                    initialTracks={tracks}
                    applyEdit={applyEditSpy}
                />,
            )

            // Wait past the debounce window. No trackCount patch should fire.
            // 1200ms vs 800ms debounce → only 400ms cushion; scaled by
            // VITEST_LOAD_FACTOR so parallel-load timer drift can't fire the
            // debounce later than our absence-assertion window.
            await loadAdjustedDelay(1200)
            const trackCountCalls = applyEditSpy.mock.calls.filter(
                ([edit]) =>
                    edit.op === 'update' &&
                    edit.collection === 'setlists' &&
                    edit.docId === SETLIST_ID &&
                    (edit.patch as Record<string, unknown>)?.trackCount !== undefined,
            )
            expect(trackCountCalls).toHaveLength(0)
        })
    })
})
