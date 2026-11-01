/**
 * Re-audit P1 (2026-10-31): the Perform setlist page must go quiet when idle.
 *
 * It used to re-render without end: the parent rebuilt its chart-id array on
 * every render, SaveOfflineButton re-counted the offline store on each new
 * array, the count set fresh Set/Map state, and `onReadyChange` pushed those
 * into the parent, which rendered again. Each pass opened IndexedDB (about
 * 320 opens a second on a real iPad). This test lets the page sit idle and
 * asserts both the commit count and the offline-store reads stop growing.
 */
import 'fake-indexeddb/auto'
import { Profiler } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'

import { resetDbForTests } from '@/lib/local/schema'
import { OFFLINE_STORE_CHANGED_EVENT } from '@/lib/offline-idb'

const idb = vi.hoisted(() => ({ listCalls: 0, saved: ["f1"] as string[] }))

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
    useSafeFirestoreSync: () => ({ data: null, loading: false, error: null }),
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
vi.mock('@/lib/offline-idb', async (orig) => {
    const real = await orig<typeof import('@/lib/offline-idb')>()
    return {
        ...real,
        listFileIds: async () => {
            idb.listCalls++
            // In memory: real IDB under jsdom is slow enough to hide a loop.
            return idb.saved.slice()
        },
    }
})
// No network in jsdom: the precache passes resolve at once, saving nothing.
vi.mock('@/lib/prefetch', async (orig) => ({
    ...(await orig<typeof import('@/lib/prefetch')>()),
    prefetchSetlistPDFs: vi.fn(async () => {}),
}))

import { SetlistPerformClient } from '@/app/perform/setlist/[id]/SetlistPerformClient'
import type { Setlist, SetlistTrack } from '@/types/models'

const ID = 'idle-setlist'
const ssr = { id: ID, name: 'Friday', eventDate: '2026-05-15', musicians: [], trackCount: 3, version: 1 } as unknown as Setlist
const rows: SetlistTrack[] = [
    { id: 't1', title: 'Adonai Sfatai', fileId: 'f1' } as SetlistTrack,
    { id: 't2', title: 'Mi Chamocha', fileId: 'f2' } as SetlistTrack,
    { id: 't3', title: 'Oseh Shalom', fileId: 'f3' } as SetlistTrack,
]

const idle = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('Perform setlist page at idle', () => {
    beforeEach(async () => {
        idb.listCalls = 0
        idb.saved = ['f1']
        await resetDbForTests()
    })
    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('stops rendering and stops reading the offline store once settled', async () => {
        let commits = 0
        render(
            <Profiler id="perform" onRender={() => { commits++ }}>
                <SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />
            </Profiler>,
        )
        expect(screen.getByTestId('save-offline')).toBeTruthy()

        // Let mount, the entry precache, the offline count and Dexie settle.
        await idle(600)
        const commitsSettled = commits
        const readsSettled = idb.listCalls

        // A further idle second must add (almost) nothing.
        await idle(1000)
        expect(commits - commitsSettled).toBeLessThanOrEqual(5)
        expect(idb.listCalls - readsSettled).toBeLessThanOrEqual(2)

        // And the whole load stays bounded.
        expect(commits).toBeLessThanOrEqual(40)
        expect(idb.listCalls).toBeLessThanOrEqual(10)
    })

    it('still moves the N/M count when a chart is saved outside a precache pass', async () => {
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        await waitFor(() => expect(screen.getByTestId('save-offline').getAttribute('data-state')).toBe('partial'))

        // e.g. opening a chart in the viewer saves it to the store.
        idb.saved = ['f1', 'f2', 'f3']
        act(() => { window.dispatchEvent(new Event(OFFLINE_STORE_CHANGED_EVENT)) })
        await waitFor(() => expect(screen.getByTestId('save-offline').getAttribute('data-state')).toBe('saved'))
    })
})
