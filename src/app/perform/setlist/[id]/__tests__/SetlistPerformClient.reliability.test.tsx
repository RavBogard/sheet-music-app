/**
 * PERF-06 / PERF-07: signed-out Perform reliability.
 *  - the "Setlist updated" strip appears when the live doc moves past the SSR frame
 *  - an empty SSR frame is healed from the public tracks endpoint
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

import { resetDbForTests } from '@/lib/local/schema'

const live = vi.hoisted(() => ({ data: null as unknown }))
const fetchTracks = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase', () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn(() => () => {}),
}))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), Timestamp: class {} }))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ user: null, isAdmin: false, isBandLeader: false, isMusician: false }),
}))
vi.mock('@/hooks/use-safe-firestore-sync', () => ({
    useSafeFirestoreSync: () => ({ data: live.data, loading: false, error: null }),
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
vi.mock('@/lib/musician-profile', () => ({ subscribeToMusicianProfile: vi.fn(() => vi.fn()) }))
vi.mock('@/lib/sync/snapshot-listener', () => ({ startSnapshotListener: vi.fn(() => () => {}) }))
vi.mock('@/lib/client-tracks', async (orig) => ({
    ...(await orig<typeof import('@/lib/client-tracks')>()),
    fetchTracksForSetlistClient: fetchTracks,
}))

import { SetlistPerformClient } from '@/app/perform/setlist/[id]/SetlistPerformClient'
import type { Setlist, SetlistTrack } from '@/types/models'

const ID = 'rel-setlist'
const base = { id: ID, name: 'Friday', eventDate: '2026-05-15', musicians: [], trackCount: 1 }
const ssr = { ...base, version: 3 } as unknown as Setlist
const rows: SetlistTrack[] = [{ id: 't1', title: 'Adonai Sfatai', fileId: 'f1' } as SetlistTrack]

describe('Perform reliability (signed out)', () => {
    beforeEach(async () => {
        live.data = null
        fetchTracks.mockReset()
        await resetDbForTests()
    })
    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('shows the strip only once the live version moves past the SSR frame', () => {
        live.data = { ...base, version: 3 }
        const { unmount } = render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        expect(screen.queryByTestId('setlist-updated-strip')).toBeNull()
        unmount()

        live.data = { ...base, version: 4 }
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        expect(screen.getByTestId('setlist-updated-strip')).toBeTruthy()
    })

    it('fetches rows from the public endpoint when the SSR frame is empty', async () => {
        fetchTracks.mockResolvedValue(rows)
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={[]} />)
        await waitFor(() => expect(screen.getByText('Adonai Sfatai')).toBeTruthy())
        expect(fetchTracks).toHaveBeenCalledTimes(1)
    })

    it('does not refetch when the SSR frame has rows', () => {
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        expect(fetchTracks).not.toHaveBeenCalled()
    })
})
