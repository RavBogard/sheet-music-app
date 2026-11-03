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

// v60-09-01: same mock posture for the songs subscription — production
// default calls onSnapshot(collection(firestoreDb,'songs')) which would
// fail against the empty firebase mock. Tests that assert subscribe-wiring
// behavior pass an explicit `subscribeSongsLibrary` prop spy below.
vi.mock('@/lib/songs/subscribe', () => ({
    subscribeSongsLibrary: vi.fn(() => () => {}),
}))

// R-0919-audit-2 (2026-09-20): the snapshot listener now mounts only for a
// signed-in reader, because its tracks query is denied signed out. Tests
// default to a signed-in user; the signed-out case sets `mockUser = null`
// and asserts the listener never mounts.
let mockUser: { uid: string } | null = { uid: 'leader-1' }
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({
        user: mockUser,
        profile: null,
        cachedUser: null,
        loading: false,
        isAdmin: false,
        isBandLeader: true,
        isMusician: false,
        isMember: true,
        isSoundEngineer: false,
        canUpload: false,
    }),
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
    it('starts the snapshot listener after hydration when signed in; unsubscribes on unmount', async () => {
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
            | { setlistId: string; db: unknown; orgId?: string }
            | undefined
        expect(callArgs?.setlistId).toBe(SETLIST_ID)
        expect(callArgs?.db).toBeDefined()
        // The tracks query needs the tenant (unstamped setlist -> host tenant).
        expect(callArgs?.orgId).toBe('crc')

        unmount()
        expect(stopFn).toHaveBeenCalledTimes(1)
    })

    // R-0919-audit-2 (2026-09-20). `list` on /tracks requires sign-in, so a
    // signed-out Perform view that mounted this listener would get one
    // `Missing or insufficient permissions` per load and nothing it could
    // use — there is no cross-leader edit for an anonymous reader to see.
    // The page renders from the server slice and the public tracks route
    // either way; this asserts we stop asking for what we cannot have.
    //
    // THIS TEST CARRIES ITS OWN POSITIVE CONTROL, on purpose. A bare
    // "assert it was never called" passes for two very different reasons:
    // because sign-out suppressed the listener, or because the render never
    // got as far as subscribing. Those are indistinguishable from the
    // assertion, and the second one would keep passing if the gate were
    // deleted. So the signed-in case runs FIRST, in the same file under the
    // same load, and must mount the listener before the signed-out case is
    // allowed to mean anything.
    //
    // The waits are explicit and generous for the same reason the emulator
    // config documents a contention ceiling: the first version of this test
    // used findByTestId's 1s default, passed alone and in its own directory,
    // and failed in the full 402-file suite. A negative assertion behind a
    // short wait is a test that reports machine load as a code defect.
    it('does NOT start the snapshot listener when signed out', async () => {
        const previous = mockUser
        try {
            // ── Positive control: signed in, the listener mounts. ──
            mockUser = { uid: 'leader-1' }
            const stopIn = vi.fn()
            const startIn = vi.fn((_opts: any) => stopIn)
            const signedIn = render(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={makeSetlist(1_700_000_000_000)}
                    initialTracks={[]}
                    startSnapshotListener={startIn}
                />,
            )
            await waitFor(() => expect(startIn).toHaveBeenCalledTimes(1), {
                timeout: 15_000,
            })
            signedIn.unmount()
            cleanup()

            // ── The case under test: signed out, same harness. ──
            mockUser = null
            const stopOut = vi.fn()
            const startOut = vi.fn((_opts: any) => stopOut)
            const signedOut = render(
                <SetlistGridHydrator
                    setlistId={SETLIST_ID}
                    initialSetlist={makeSetlist(1_700_000_000_000)}
                    initialTracks={[]}
                    startSnapshotListener={startOut}
                />,
            )

            // Hydration must actually COMPLETE before the assertion means
            // anything — the control above proves that subscribing happens
            // strictly after this same point.
            await signedOut.findByTestId('setlist-grid-empty-state', undefined, {
                timeout: 15_000,
            })

            expect(startOut).not.toHaveBeenCalled()

            signedOut.unmount()
            expect(stopOut).not.toHaveBeenCalled()
        } finally {
            mockUser = previous
        }
    })

    // Setlist sync PR 3: the hydrator writes nothing. The server frame goes to
    // the grid (the view shows it until a live set arrives); Dexie and the
    // outbox stay untouched.
    it('shows the server frame without writing Dexie or the outbox', async () => {
        const setlist = makeSetlist(1_700_000_000_000)
        const { findByTestId } = render(
            <SetlistGridHydrator
                setlistId={SETLIST_ID}
                initialSetlist={setlist}
                initialTracks={makeTracks(1_700_000_000_000)}
            />,
        )
        await findByTestId('mobile-card-t-1')
        await findByTestId('mobile-card-t-2')
        const db = getDb()
        expect(await db.tracks.count()).toBe(0)
        expect(await db.setlists.count()).toBe(0)
        expect(await db.outbox.count()).toBe(0)
        expect(await db.intents.count()).toBe(0)
    })
})
