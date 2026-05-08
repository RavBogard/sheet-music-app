import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom shims (cmdk + Radix Popover use both ResizeObserver and scrollIntoView).
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
const g = globalThis as unknown as {
    ResizeObserver?: typeof ResizeObserverStub
}
g.ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalSong, LocalTrack } from '@/lib/local/types'

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: vi.fn(),
    seedTrackFromSong: vi.fn().mockResolvedValue({}),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

import { SetlistGrid } from '../SetlistGrid'

async function seedSongs(rows: Array<Pick<LocalSong, 'id' | 'title'>>) {
    const db = getDb()
    const docs: LocalSong[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        normalizedTitle: r.title.toLowerCase(),
        // v54-01-01 bootstrap shape: songs/{id}.fileId === songs/{id}.id
        // (library_index doc id is reused as both). v54-01-02 fix relies
        // on this invariant — the consumer reads songId from the picker
        // and writes BOTH track.songId and track.fileId from the same value.
        fileId: r.id,
    }))
    await db.songs.bulkPut(docs)
}

async function getOutboxRows() {
    return getDb().outbox.toArray()
}

/**
 * v54-01-02 regression test (UAT 2026-05-08): Daniel reported "when I go
 * to perform for a setlist I just made I can't click on them to open the
 * charts." Root cause: SetlistRow.tsx:47 gates clickability on
 * `track.fileId`, but SetlistGrid.tsx's handlePickSong (and handleBindChart)
 * wrote tracks with `songId` only — never `fileId`. Pre-v54-01 the picker
 * was empty so this code path was dead; v54-01-01 enabled it and the gap
 * surfaced immediately.
 *
 * Per v54-01-01 locked decision, songs/{libId} uses library_index doc id
 * directly so songId === fileId. Both write paths (handlePickSong and
 * handleBindChart) MUST set fileId alongside songId.
 *
 * These tests assert on the outbox payload after triggering the picker /
 * chart-bind UI flows. Test fails on a693d23 (no fileId in payload),
 * passes after v54-01-02 fix lands.
 */
describe('SetlistGrid v54-01-02 — handlePickSong + handleBindChart write fileId so perform-view rows are clickable', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('handlePickSong: picking a library song writes track.fileId === song.id (so SetlistRow.hasFile === true)', async () => {
        await seedSongs([{ id: 'lib-adon-olam', title: 'Adon Olam' }])

        render(<SetlistGrid setlistId="set-pick-1" />)

        // Wait for songs library to be observable in Dexie (useLiveQuery).
        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(1)
        })

        const user = userEvent.setup()
        // Open the AddBar primary "+ Song" picker.
        await user.click(screen.getByTestId('add-row-trigger'))

        // Library item appears in the picker.
        await waitFor(() => {
            expect(screen.getByText('Adon Olam')).toBeInTheDocument()
        })

        // Click the library entry.
        await user.click(screen.getByText('Adon Olam'))

        // The applyEdit('set','tracks',doc) should land in the outbox with
        // BOTH songId and fileId set to the library id.
        await waitFor(async () => {
            const rows = await getOutboxRows()
            const setRow = rows.find(
                (r) => r.collection === 'tracks' && r.op === 'set',
            )
            expect(setRow).toBeDefined()
            const payload = setRow!.payload as Record<string, unknown>
            expect(payload.songId).toBe('lib-adon-olam')
            // FAILING IN a693d23 (PRE-FIX) — handlePickSong omitted fileId:
            expect(payload.fileId).toBe('lib-adon-olam')
            expect(payload.title).toBe('Adon Olam')
            expect(payload.type).toBe('song')
        })
    })

    it('handleBindChart: re-binding chart on an existing free-text track writes fileId via update patch', async () => {
        // Pre-existing track: free-text "Hinei" (no songId, no fileId — the
        // exact state of tracks Daniel created via Custom-create pre-v54-01).
        const db = getDb()
        await db.tracks.put({
            id: 't-hinei',
            setlistId: 'set-bind-1',
            order: 0,
            title: 'Hinei',
            type: 'song',
        } as LocalTrack)
        await seedSongs([{ id: 'lib-hinei', title: 'Hinei Ma Tov' }])

        render(<SetlistGrid setlistId="set-bind-1" />)

        await screen.findByText('Hinei')

        // Open the chart-cell ChartBindPopover for this track.
        // ChartCell renders a button that opens ChartBindPopover.
        // We locate it via the row's aria-rowindex-derived testid pattern.
        const chartCellButton = screen
            .getAllByRole('button')
            .find(
                (b) =>
                    b.getAttribute('aria-label')?.toLowerCase().includes('chart') ??
                    false,
            )
        expect(chartCellButton).toBeDefined()

        const user = userEvent.setup()
        await user.click(chartCellButton!)

        // Pick the library entry.
        await waitFor(() => {
            expect(screen.getByText('Hinei Ma Tov')).toBeInTheDocument()
        })
        await user.click(screen.getByText('Hinei Ma Tov'))

        // Outbox `update` op on tracks/{t-hinei} should patch BOTH songId and
        // fileId. FAILING in a693d23 (pre-fix) — handleBindChart omitted fileId.
        await waitFor(async () => {
            const rows = await getOutboxRows()
            const updateRow = rows.find(
                (r) =>
                    r.collection === 'tracks' &&
                    r.op === 'update' &&
                    r.docId === 't-hinei',
            )
            expect(updateRow).toBeDefined()
            const patch = updateRow!.payload as Record<string, unknown>
            expect(patch.songId).toBe('lib-hinei')
            expect(patch.fileId).toBe('lib-hinei')
            expect(patch.title).toBe('Hinei Ma Tov')
        })
    })
})
