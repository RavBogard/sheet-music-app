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

vi.mock('@/lib/firebase', () => ({ db: {} }))
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
        requestWakeLock: vi.fn(),
        releaseWakeLock: vi.fn(),
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
