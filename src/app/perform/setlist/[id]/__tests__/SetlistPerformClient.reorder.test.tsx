/**
 * Live reorder on the Perform page (Daniel, 2026-10-31).
 *  - Reorder shows for band leaders and admins only
 *  - a move shows at once and goes through the server reorder path
 *  - a failed write rolls the order back and says so
 *  - a receiving iPad with a chart open keeps that chart; its queue follows
 *    the new order, and the list highlights the moved row
 *  - a stale write re-applies the move on the server's order and retries once
 *  - the Swap sheet stays on its row through a reorder
 *  - an open row that is removed closes to the list with a note
 */
import 'fake-indexeddb/auto'
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent, waitFor, within } from '@testing-library/react'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'

const who = vi.hoisted(() => ({ role: 'musician' as 'signed-out' | 'musician' | 'band_leader' | 'admin' }))
const commit = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase', () => ({
    db: {},
    auth: { currentUser: null },
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn(() => () => {}),
}))
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), Timestamp: class {} }))
vi.mock('@/lib/auth-context', () => ({
    useAuth: () => ({
        user: who.role === 'signed-out' ? null : { uid: 'u1' },
        loading: false,
        isAdmin: who.role === 'admin',
        isBandLeader: who.role === 'band_leader' || who.role === 'admin',
        isMusician: who.role !== 'signed-out',
    }),
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
vi.mock('@/lib/performance/tonight-client', () => ({
    subscribeTonight: vi.fn(() => () => {}),
    commitTonightReset: vi.fn(),
}))
vi.mock('@/hooks/use-library', () => ({ useLibrary: vi.fn() }))
vi.mock('@/lib/prefetch', async (orig) => ({
    ...(await orig<typeof import('@/lib/prefetch')>()),
    prefetchSetlistPDFs: vi.fn(async () => {}),
}))
vi.mock('@/lib/performance/live-reorder-client', () => ({ commitLiveReorder: commit }))
vi.mock('@/components/performance/TonightSwapSheet', () => ({
    TonightSwapSheet: ({ track }: { track: { id: string } }) => <div data-testid="stub-swap-sheet" data-track-id={track.id} />,
}))

// The chart viewer stands in as a stub that shows which row is open and what
// Next would be (the queue is every row with a chart, in setlist order).
vi.mock('@/lib/perform-chart-loaders', () => {
    type Row = { id: string; fileId?: string }
    function StubOverlay({ track, tracks, currentIndex }: { track: Row; tracks: Row[]; currentIndex: number }) {
        const queue = tracks.filter((t) => !!t.fileId)
        const pos = queue.findIndex((t) => t.id === tracks[currentIndex]?.id)
        return (
            <div
                data-testid="stub-overlay"
                data-track-id={track.id}
                data-current-id={tracks[currentIndex]?.id}
                data-next-id={queue[pos + 1]?.id ?? ''}
            />
        )
    }
    return { loadPDFOverlay: async () => ({ PDFOverlay: StubOverlay }) }
})

import { SetlistPerformClient } from '@/app/perform/setlist/[id]/SetlistPerformClient'
import type { Setlist, SetlistTrack } from '@/types/models'

const ID = 'reorder-setlist'
const ssr = { id: ID, name: 'Friday', eventDate: '2026-05-15', musicians: [], trackCount: 3, version: 1 } as unknown as Setlist
const rows: SetlistTrack[] = [
    { id: 't1', title: 'Adonai Sfatai', fileId: 'f1' } as SetlistTrack,
    { id: 't2', title: 'Mi Chamocha', fileId: 'f2' } as SetlistTrack,
    { id: 't3', title: 'Oseh Shalom', fileId: 'f3' } as SetlistTrack,
]

async function seedLive(order: string[]) {
    const byId = new Map(rows.map((r) => [r.id, r]))
    await getDb().tracks.bulkPut(
        order.map((id, i) => ({ ...byId.get(id)!, setlistId: ID, order: i }) as unknown as LocalTrack),
    )
}

const rowOrder = () => screen.getAllByTestId('perform-row').map((el) => el.getAttribute('data-row-id'))
const reorderOrder = () => screen.getAllByTestId('perform-reorder-row').map((el) => el.getAttribute('data-row-id'))
const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)))

describe('Perform live reorder', () => {
    beforeEach(async () => {
        commit.mockReset()
        commit.mockResolvedValue({ ok: true })
        await resetDbForTests()
    })
    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it.each(['signed-out', 'musician'] as const)('offers no Reorder to a %s device', async (role) => {
        who.role = role
        if (role !== 'signed-out') await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        await wait(50)
        expect(screen.queryByTestId('perform-reorder-toggle')).toBeNull()
    })

    it.each(['band_leader', 'admin'] as const)('lets a %s move a row, shown at once and written through the reorder path', async (role) => {
        who.role = role
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        fireEvent.click(await screen.findByTestId('perform-reorder-toggle'))

        const first = screen.getAllByTestId('perform-reorder-row')[0]
        expect(within(first).getByTestId('perform-reorder-up')).toHaveProperty('disabled', true)
        fireEvent.click(within(first).getByTestId('perform-reorder-down'))

        expect(reorderOrder()).toEqual(['t2', 't1', 't3'])
        // Gated on the version this page saw (the server frame's, here).
        await waitFor(() => expect(commit).toHaveBeenCalledWith(ID, ['t2', 't1', 't3'], 1))

        // Done returns to the list, still in the new order.
        fireEvent.click(screen.getByTestId('perform-reorder-toggle'))
        expect(rowOrder()).toEqual(['t2', 't1', 't3'])
    })

    it('rolls the order back and says so when the write fails', async () => {
        who.role = 'band_leader'
        commit.mockResolvedValue({ ok: false, reason: 'rejected' })
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        fireEvent.click(await screen.findByTestId('perform-reorder-toggle'))

        const last = screen.getAllByTestId('perform-reorder-row')[2]
        fireEvent.click(within(last).getByTestId('perform-reorder-up'))

        const alert = await screen.findByTestId('perform-reorder-error')
        expect(alert.getAttribute('data-reason')).toBe('rejected')
        expect(alert.getAttribute('role')).toBe('alert')
        expect(reorderOrder()).toEqual(['t1', 't2', 't3'])
    })

    it('does not move anything while the leader is offline', async () => {
        who.role = 'band_leader'
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        fireEvent.click(await screen.findByTestId('perform-reorder-toggle'))
        const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        try {
            fireEvent.click(within(screen.getAllByTestId('perform-reorder-row')[0]).getByTestId('perform-reorder-down'))
            expect(screen.getByTestId('perform-reorder-error').getAttribute('data-reason')).toBe('offline')
            expect(reorderOrder()).toEqual(['t1', 't2', 't3'])
            expect(commit).not.toHaveBeenCalled()
        } finally {
            onLine.mockRestore()
        }
    })

    it('keeps an open chart on a receiving iPad, moves its queue, and highlights the moved row', async () => {
        who.role = 'musician'
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} initialTrackId="t2" />)
        const overlay = await screen.findByTestId('stub-overlay')
        expect(overlay.getAttribute('data-track-id')).toBe('t2')
        expect(overlay.getAttribute('data-next-id')).toBe('t3')

        // Past the settle window, another leader moves Oseh Shalom to the top.
        await wait(1600)
        await act(async () => { await seedLive(['t3', 't1', 't2']) })

        await waitFor(() => expect(rowOrder()).toEqual(['t3', 't1', 't2']))
        const after = screen.getByTestId('stub-overlay')
        expect(after.getAttribute('data-track-id')).toBe('t2')
        expect(after.getAttribute('data-current-id')).toBe('t2')
        expect(after.getAttribute('data-next-id')).toBe('')

        const moved = screen.getAllByTestId('perform-row').filter((el) => el.hasAttribute('data-moved'))
        expect(moved.map((el) => el.getAttribute('data-row-id'))).toEqual(['t3'])
        // The highlight is brief.
        await wait(2100)
        expect(screen.getAllByTestId('perform-row').some((el) => el.hasAttribute('data-moved'))).toBe(false)
    }, 10_000)

    it('re-applies the move on the server order and retries once when the setlist changed first', async () => {
        who.role = 'band_leader'
        commit
            .mockResolvedValueOnce({ ok: false, reason: 'stale', currentVersion: 4, currentOrder: ['t1', 't3', 't2'] })
            .mockResolvedValueOnce({ ok: true })
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        fireEvent.click(await screen.findByTestId('perform-reorder-toggle'))

        // Move Adonai Sfatai down one; meanwhile someone else swapped t2 and t3.
        fireEvent.click(within(screen.getAllByTestId('perform-reorder-row')[0]).getByTestId('perform-reorder-down'))

        await waitFor(() => expect(commit).toHaveBeenCalledTimes(2))
        expect(commit.mock.calls[0]).toEqual([ID, ['t2', 't1', 't3'], 1])
        expect(commit.mock.calls[1]).toEqual([ID, ['t3', 't1', 't2'], 4])
        await waitFor(() => expect(reorderOrder()).toEqual(['t3', 't1', 't2']))
        expect(screen.queryByTestId('perform-reorder-error')).toBeNull()
    })

    it('says the setlist changed when the retry is stale too, and rolls back without a highlight', async () => {
        who.role = 'band_leader'
        commit.mockResolvedValue({ ok: false, reason: 'stale', currentVersion: 5, currentOrder: ['t1', 't2', 't3'] })
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        fireEvent.click(await screen.findByTestId('perform-reorder-toggle'))
        await wait(1600)

        fireEvent.click(within(screen.getAllByTestId('perform-reorder-row')[2]).getByTestId('perform-reorder-up'))

        const alert = await screen.findByTestId('perform-reorder-error')
        expect(alert.getAttribute('data-reason')).toBe('conflict')
        expect(commit).toHaveBeenCalledTimes(2)
        expect(reorderOrder()).toEqual(['t1', 't2', 't3'])
        expect(screen.getAllByTestId('perform-reorder-row').some((el) => el.hasAttribute('data-moved'))).toBe(false)
    })

    it('keeps the Swap sheet on its row when the order changes under it', async () => {
        who.role = 'band_leader'
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        await waitFor(() => expect(screen.getAllByTestId('tonight-swap-button')).toHaveLength(3))
        fireEvent.click(screen.getAllByTestId('tonight-swap-button')[1])
        expect(screen.getByTestId('stub-swap-sheet').getAttribute('data-track-id')).toBe('t2')

        await act(async () => { await seedLive(['t3', 't1', 't2']) })
        await waitFor(() => expect(rowOrder()).toEqual(['t3', 't1', 't2']))
        expect(screen.getByTestId('stub-swap-sheet').getAttribute('data-track-id')).toBe('t2')
    })

    it('closes an open chart whose row was removed, and says so', async () => {
        who.role = 'musician'
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} initialTrackId="t2" />)
        expect((await screen.findByTestId('stub-overlay')).getAttribute('data-track-id')).toBe('t2')

        await act(async () => { await getDb().tracks.delete('t2') })

        await waitFor(() => expect(screen.queryByTestId('stub-overlay')).toBeNull())
        expect(screen.getByTestId('perform-open-row-removed')).toBeTruthy()
        expect(rowOrder()).toEqual(['t1', 't3'])
    })

    it('holds an incoming reorder while a finger is on the list, then applies it', async () => {
        who.role = 'musician'
        await seedLive(['t1', 't2', 't3'])
        render(<SetlistPerformClient setlistId={ID} initialSetlist={ssr} initialTracks={rows} />)
        await waitFor(() => expect(rowOrder()).toEqual(['t1', 't2', 't3']))

        fireEvent.touchStart(screen.getAllByTestId('perform-row')[0])
        await act(async () => { await seedLive(['t3', 't1', 't2']) })
        await wait(200)
        expect(rowOrder()).toEqual(['t1', 't2', 't3'])

        fireEvent.touchEnd(screen.getAllByTestId('perform-row')[0])
        await waitFor(() => expect(rowOrder()).toEqual(['t3', 't1', 't2']))
    })
})
