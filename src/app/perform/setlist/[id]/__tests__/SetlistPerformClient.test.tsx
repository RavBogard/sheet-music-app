/**
 * UNAUTH-009 (cycle-4 supplement, CRITICAL) — SSR contract test.
 *
 * The parent server component (`page.tsx`) fetches the setlist + tracks
 * via Admin SDK and hands them to `SetlistPerformClient` as initial
 * props. Critical assertion: when initial props are present, the
 * component renders the track titles + setlist name + musicians
 * SYNCHRONOUSLY on the first render — no spinner, no `await`. This is
 * what makes the SSR'd HTML contain the band member's setlist on FCP
 * (slow-3G band-member journey, the load-bearing path).
 *
 * This is a component test, not a real Next.js SSR test. It uses
 * `@testing-library/react`'s synchronous `render()` (which under jsdom
 * is the same code path React uses to build the SSR'd HTML modulo the
 * hydration shim). A regression that makes the first render of the
 * client component return the loading spinner instead of the track
 * list would surface here even though TypeScript doesn't catch it.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { resetDbForTests } from '@/lib/local/schema'

// ── Mocks (mirror the hook test's stubs) ─────────────────────────────

vi.mock('@/lib/firebase', () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => (() => void) | void) => {
        const u = setup({})
        return typeof u === 'function' ? u : () => {}
    }),
}))
vi.mock('firebase/firestore', () => ({ doc: vi.fn() }))

vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({
        user: null,
        isAdmin: false,
        isBandLeader: false,
        isMusician: false,
    }),
}))

// useSafeFirestoreSync returns loading:true — i.e. the realtime
// subscription hasn't delivered anything yet. The whole point of the
// SSR-primed branch is that the component renders content REGARDLESS,
// because initialSetlist + initialTracks already give it a frame.
vi.mock('@/hooks/use-safe-firestore-sync', () => ({
    useSafeFirestoreSync: () => ({ data: null, loading: true, error: null }),
}))

vi.mock('@/hooks/use-wake-lock', () => ({
    useWakeLock: () => ({
        isSupported: true,
        isLocked: false,
        lastError: null,
        requestWakeLock: vi.fn(),
        releaseWakeLock: vi.fn(),
        dismissWakeLockError: vi.fn(),
    }),
}))

vi.mock('@/lib/musician-profile', () => ({
    subscribeToMusicianProfile: vi.fn(() => vi.fn()),
}))

vi.mock('@/lib/sync/snapshot-listener', () => ({
    startSnapshotListener: vi.fn(() => () => {}),
}))

// react-pdf is dynamic-imported by PDFOverlay, which is itself
// dynamic-imported by the client component. We never activate it in
// this test (no song tap), so no stub needed. The dynamic() import
// resolves lazily.

import { SetlistPerformClient } from '@/app/perform/setlist/[id]/SetlistPerformClient'
import type { Setlist, SetlistTrack } from '@/types/models'

const SETLIST_ID = 'ssr-test-setlist'

const initialSetlist = {
    id: SETLIST_ID,
    name: '5/15 — Shir Shabbat',
    date: '2026-05-15',
    eventDate: '2026-05-15',
    serviceNotes: 'Wear blue',
    musicians: [
        { uid: 'm1', name: 'Daniel B.', email: 'd@x', instrument: 'guitar' },
        { uid: 'm2', name: 'David L.', email: 'l@x', instrument: 'piano' },
    ],
    rabbi: 'Daniel',
    trackCount: 3,
} as unknown as Setlist

const initialTracks: SetlistTrack[] = [
    { id: 't1', title: 'Adonai Sfatai', key: 'D', fileId: 'upload-1' },
    { id: 't2', title: 'Dodi Li', key: 'Am', fileId: 'upload-2' },
    { id: 'h1', title: 'Maariv', type: 'header' },
    { id: 't3', title: 'Ana B\'Koach', key: 'C', fileId: 'upload-3' },
    // c12-fix-section-divider-url-behavior fixture: the SetlistGrid TypeCell
    // picker writes `'section'` for "Section header"; canonical TrackType
    // union uses `'header'`. Both appear in real setlist data. Cast through
    // `Partial<SetlistTrack>` to bypass the union literal narrowing.
    ({ id: 'sec1', title: 'Torah Service', type: 'section' } as unknown) as SetlistTrack,
]

describe('SetlistPerformClient — SSR contract (UNAUTH-009)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('renders setlist name + track titles + musicians synchronously when initial props are provided', () => {
        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
            />,
        )

        // No loading spinner — content paints immediately.
        expect(screen.queryByText(/Loading setlist/i)).toBeNull()

        // Setlist name in the header.
        expect(screen.getByRole('heading', { name: '5/15 — Shir Shabbat' })).toBeTruthy()

        // Track titles in the body — this is the band-member-on-slow-3G
        // payload: every song title visible on FCP, no JS required for paint.
        expect(screen.getByText('Adonai Sfatai')).toBeTruthy()
        expect(screen.getByText('Dodi Li')).toBeTruthy()
        expect(screen.getByText("Ana B'Koach")).toBeTruthy()

        // Header row (Maariv section) — non-song track type also rendered.
        expect(screen.getByText('Maariv')).toBeTruthy()

        // Musicians strip — first names appear in chips.
        expect(screen.getByText('Daniel')).toBeTruthy()
        expect(screen.getByText('David')).toBeTruthy()

        // Song count derived from SSR data (3 songs, 4 total items).
        expect(screen.getByText(/3 songs/)).toBeTruthy()
    })

    it('c11-fix-perform-track-position-in-url: bare path (no initialTrackId) does NOT touch window.history', () => {
        const replaceSpy = vi.spyOn(window.history, 'replaceState')
        try {
            // Start with the bare-path URL so the URL-sync effect sees
            // currentPath === desiredPath and no-ops.
            window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}`)
            replaceSpy.mockClear()

            render(
                <SetlistPerformClient
                    setlistId={SETLIST_ID}
                    initialSetlist={initialSetlist}
                    initialTracks={initialTracks}
                />,
            )

            expect(replaceSpy).not.toHaveBeenCalled()
        } finally {
            replaceSpy.mockRestore()
        }
    })

    it('c11-fix-perform-track-position-in-url: initialTrackId for a known track rewrites the URL to the sub-route', () => {
        // Start at the bare path; the URL-sync effect should rewrite to
        // /perform/setlist/<id>/track/t2 on mount.
        window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}`)

        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                initialTrackId="t2"
            />,
        )

        expect(window.location.pathname).toBe(`/perform/setlist/${SETLIST_ID}/track/t2`)
    })

    it('c11-fix-perform-track-position-in-url: unknown initialTrackId falls back to bare path (no overlay)', () => {
        // Start at a stale sub-route; an unknown trackId seeds null and
        // the URL-sync effect rewrites back to the bare path.
        window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}/track/does-not-exist`)

        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                initialTrackId="does-not-exist"
            />,
        )

        expect(window.location.pathname).toBe(`/perform/setlist/${SETLIST_ID}`)
    })

    it('c12-fix-section-divider-url-behavior (F-C12-R2-010): type="header" section bookmark falls back to bare path', () => {
        // Decision (b): section dividers are labels, not chart destinations.
        // Bookmarking `/track/<sectionId>` rewrites to bare path so the URL
        // doesn't silently drift to track-0 via the PDFOverlay queue cascade
        // (queueStart=-1 → Math.max(0,-1)=0 → onNavigate(0)).
        window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}/track/h1`)

        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                initialTrackId="h1"
            />,
        )

        expect(window.location.pathname).toBe(`/perform/setlist/${SETLIST_ID}`)
        // The Maariv header label still renders in the setlist body — section
        // is visible as a label, just not a chart destination.
        expect(screen.getByText('Maariv')).toBeTruthy()
    })

    it('c12-fix-section-divider-url-behavior (F-C12-R2-010): type="section" section bookmark falls back to bare path', () => {
        // Same as the type:"header" case above but exercises the legacy
        // TypeCell picker's `'section'` literal — both appear in real data
        // per `SetlistGrid.tsx:168` `isSectionRow`.
        window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}/track/sec1`)

        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                initialTrackId="sec1"
            />,
        )

        expect(window.location.pathname).toBe(`/perform/setlist/${SETLIST_ID}`)
        expect(screen.getByText('Torah Service')).toBeTruthy()
    })

    it('c11-fix-perform-track-position-in-url: preserves search + hash when rewriting', () => {
        window.history.replaceState(null, '', `/perform/setlist/${SETLIST_ID}?foo=bar#sec`)

        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                initialTrackId="t1"
            />,
        )

        expect(window.location.pathname).toBe(`/perform/setlist/${SETLIST_ID}/track/t1`)
        expect(window.location.search).toBe('?foo=bar')
        expect(window.location.hash).toBe('#sec')
    })

    it('falls back to loading state when no initial props (Admin SDK unavailable / dev mode)', () => {
        render(
            <SetlistPerformClient
                setlistId={SETLIST_ID}
                initialSetlist={null}
                initialTracks={[]}
            />,
        )

        // Without SSR frame, the legacy loading spinner shows while
        // useSafeFirestoreSync resolves. This is the dev-without-creds
        // branch — no regression vs pre-UNAUTH-009 behavior.
        expect(screen.getByText(/Loading setlist/i)).toBeTruthy()
    })
})
