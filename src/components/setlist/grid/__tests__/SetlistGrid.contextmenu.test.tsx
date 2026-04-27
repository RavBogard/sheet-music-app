import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom doesn't ship ResizeObserver or Element.scrollIntoView; cmdk uses
// both. Stub before any cmdk-using component renders.
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

// Mock useMediaQuery so we can flip pointer-coarse on/off per test.
// Default false (= desktop / pointer-fine). The global stub in
// src/test-setup.ts provides matchMedia for any tests that don't
// explicitly mock useMediaQuery — we override with a callable mock here
// so individual cases can verify the coarse branch.
vi.mock('@/hooks/use-media-query', () => ({
    useMediaQuery: vi.fn(() => false),
}))

import { useMediaQuery } from '@/hooks/use-media-query'

const mockedUseMediaQuery = vi.mocked(useMediaQuery)

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalSong, LocalTrack } from '@/lib/local/types'

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: mockBack, push: vi.fn(), refresh: vi.fn() }),
}))

const propagateSpy = vi.fn()
vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: (...args: unknown[]) => propagateSpy(...args),
    seedTrackFromSong: vi.fn(async () => ({})),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

import { DeleteConfirmProvider } from '../DeleteConfirmProvider'
import { SetlistGrid } from '../SetlistGrid'

async function seedTracks(setlistId: string, rows: Partial<LocalTrack>[]) {
    const db = getDb()
    const docs: LocalTrack[] = rows.map((r, i) => ({
        id: r.id ?? `${setlistId}-track-${i}`,
        setlistId,
        order: r.order ?? i,
        ...r,
    }))
    await db.tracks.bulkPut(docs)
}

async function seedSongs(songs: Partial<LocalSong>[]) {
    const db = getDb()
    const docs = songs.map((s, i) => ({
        id: s.id ?? `song-${i}`,
        title: s.title ?? `Song ${i}`,
        ...s,
    })) as LocalSong[]
    await db.songs.bulkPut(docs)
}

async function rowEl(trackId: string): Promise<HTMLElement> {
    // Wait for live query to populate at least one row.
    await screen.findAllByTestId('drag-handle')
    const el = document.querySelector(
        `[data-row-id="${trackId}"]`,
    ) as HTMLElement | null
    if (!el) throw new Error(`Row ${trackId} not found`)
    return el
}

function openContextMenu(target: HTMLElement) {
    fireEvent.contextMenu(target)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('SetlistGrid — right-click ContextMenu + long-press for touch', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockBack.mockClear()
        propagateSpy.mockClear()
        mockedUseMediaQuery.mockReset()
        mockedUseMediaQuery.mockReturnValue(false) // default: desktop
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('AC-4: right-click on a row opens ContextMenu with 4 items', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        openContextMenu(await rowEl('t-0'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-edit'),
            ).toBeInTheDocument()
        })
        expect(
            screen.getByTestId('row-context-menu-bind-chart'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('row-context-menu-duplicate'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('row-context-menu-delete'),
        ).toBeInTheDocument()

        // Verify the 4 expected labels appear.
        expect(
            screen.getByText(/Edit row/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Bind chart/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Duplicate row/i),
        ).toBeInTheDocument()
        expect(
            screen.getByText(/Delete row/i),
        ).toBeInTheDocument()
    })

    it('AC-5: in-selection right-click → bulk Delete dialog with count copy', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'Row 2' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const handles = await screen.findAllByTestId('drag-handle')
        fireEvent.click(handles[0], { metaKey: true })
        fireEvent.click(handles[1], { metaKey: true })
        fireEvent.click(handles[2], { metaKey: true })

        openContextMenu(await rowEl('t-1'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-bulk-label'),
            ).toHaveTextContent('3 rows selected')
        })

        expect(screen.getByTestId('row-context-menu-edit')).toHaveAttribute(
            'data-disabled',
        )
        expect(
            screen.getByTestId('row-context-menu-bind-chart'),
        ).toHaveAttribute('data-disabled')
        expect(
            screen.getByTestId('row-context-menu-duplicate'),
        ).toHaveAttribute('data-disabled')

        fireEvent.click(screen.getByTestId('row-context-menu-delete'))

        const dialog = await screen.findByRole('alertdialog')
        expect(
            within(dialog).getByText(/Delete 3 rows\?/i),
        ).toBeInTheDocument()

        await act(async () => {
            fireEvent.click(within(dialog).getByText('Delete'))
        })

        await waitFor(async () => {
            const remaining = await getDb().tracks.toArray()
            expect(remaining).toHaveLength(0)
        })
    })

    it('AC-5: out-of-selection right-click → single-row Delete dialog', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'My Song' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const handles = await screen.findAllByTestId('drag-handle')
        fireEvent.click(handles[0], { metaKey: true })
        fireEvent.click(handles[1], { metaKey: true })

        openContextMenu(await rowEl('t-2'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-edit'),
            ).toBeInTheDocument()
        })
        expect(
            screen.queryByTestId('row-context-menu-bulk-label'),
        ).toBeNull()

        // Edit / Bind / Duplicate are ENABLED in the out-of-selection
        // case.
        expect(
            screen.getByTestId('row-context-menu-edit'),
        ).not.toHaveAttribute('data-disabled')

        fireEvent.click(screen.getByTestId('row-context-menu-delete'))

        const dialog = await screen.findByRole('alertdialog')
        expect(within(dialog).getByText(/Delete row\?/i)).toBeInTheDocument()
        expect(within(dialog).getByText(/My Song/i)).toBeInTheDocument()

        await act(async () => {
            fireEvent.click(within(dialog).getByText('Delete'))
        })

        await waitFor(async () => {
            const ids = (await getDb().tracks.toArray())
                .map((t) => t.id)
                .sort()
            expect(ids).toEqual(['t-0', 't-1'])
        })
    })

    it('AC-6: Edit row → focuses Title cell of the right-clicked row', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        openContextMenu(await rowEl('t-1'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-edit'),
            ).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('row-context-menu-edit'))

        // TextCell button has aria-label "Track title"; the row 1 button
        // is the second one. The isFocused prop drives a useEffect that
        // calls .focus() on the button after a 0ms timeout.
        await waitFor(() => {
            const focused = document.activeElement
            expect(focused?.getAttribute('aria-label')).toBe('Track title')
        })
    })

    it('AC-6: Bind chart → opens ChartBindPopover for the right-clicked row', async () => {
        await seedSongs([
            { id: 'song-a', title: 'Song Alpha' },
            { id: 'song-b', title: 'Song Beta' },
        ])
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        openContextMenu(await rowEl('t-0'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-bind-chart'),
            ).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('row-context-menu-bind-chart'))

        await waitFor(() => {
            expect(
                screen.getByTestId('chart-bind-popover'),
            ).toBeInTheDocument()
        })
        expect(screen.getByText('Song Alpha')).toBeInTheDocument()
    })

    it('AC-6: Duplicate row → clones row data + cascades order', async () => {
        await seedTracks('set-a', [
            {
                id: 't-0',
                order: 0,
                title: 'Source',
                key: 'D',
                bpm: 120,
                leadMusician: 'Daniel',
                type: 'song',
                songId: 'song-a',
                notes: 'tight',
            },
            { id: 't-1', order: 1, title: 'After' },
            { id: 't-2', order: 2, title: 'Last' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        openContextMenu(await rowEl('t-0'))

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-duplicate'),
            ).toBeInTheDocument()
        })

        await act(async () => {
            fireEvent.click(
                screen.getByTestId('row-context-menu-duplicate'),
            )
        })

        await waitFor(async () => {
            const tracks = await getDb().tracks.toArray()
            expect(tracks).toHaveLength(4)
        })

        const tracks = (await getDb().tracks.toArray()).sort(
            (a, b) => a.order - b.order,
        )
        expect(tracks[0].id).toBe('t-0')
        expect(tracks[0].order).toBe(0)
        // Clone at order 1, new id, all other fields preserved.
        expect(tracks[1].id).not.toBe('t-0')
        expect(tracks[1].order).toBe(1)
        expect(tracks[1].title).toBe('Source')
        expect(tracks[1].key).toBe('D')
        expect(tracks[1].bpm).toBe(120)
        expect(tracks[1].leadMusician).toBe('Daniel')
        expect(tracks[1].songId).toBe('song-a')
        expect(tracks[1].notes).toBe('tight')
        // Cascade: t-1 from order 1 → 2.
        expect(tracks[2].id).toBe('t-1')
        expect(tracks[2].order).toBe(2)
        // Cascade: t-2 from order 2 → 3.
        expect(tracks[3].id).toBe('t-2')
        expect(tracks[3].order).toBe(3)
    })

    it('AC-7: long-press 500ms on touch opens ContextMenu', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const tr = await rowEl('t-0')

        fireEvent.pointerDown(tr, {
            pointerType: 'touch',
            clientX: 100,
            clientY: 100,
        })

        // Real timers — wait a smidge over 500ms.
        await sleep(550)

        await waitFor(() => {
            expect(
                screen.getByTestId('row-context-menu-edit'),
            ).toBeInTheDocument()
        })
    })

    it('AC-7: long-press cancels on movement > 10px', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const tr = await rowEl('t-0')

        fireEvent.pointerDown(tr, {
            pointerType: 'touch',
            clientX: 100,
            clientY: 100,
        })
        fireEvent.pointerMove(tr, {
            pointerType: 'touch',
            clientX: 115, // dx = 15, > 10px threshold
            clientY: 100,
        })

        await sleep(600)

        expect(screen.queryByTestId('row-context-menu-edit')).toBeNull()
    })

    it('AC-7: long-press cancels on quick release before 500ms', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const tr = await rowEl('t-0')

        fireEvent.pointerDown(tr, {
            pointerType: 'touch',
            clientX: 100,
            clientY: 100,
        })
        await sleep(200)
        fireEvent.pointerUp(tr, {
            pointerType: 'touch',
            clientX: 100,
            clientY: 100,
        })
        await sleep(400)

        expect(screen.queryByTestId('row-context-menu-edit')).toBeNull()
    })

    it('AC-7: long-press is touch-only — mouse pointerdown does NOT start timer', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const tr = await rowEl('t-0')

        fireEvent.pointerDown(tr, {
            pointerType: 'mouse',
            clientX: 100,
            clientY: 100,
        })

        await sleep(600)

        expect(screen.queryByTestId('row-context-menu-edit')).toBeNull()
    })

    it('AC-1 sanity (cell dropdown): renders Sheet on (pointer: coarse)', async () => {
        // Query-string-aware: coarse=true (touch), mobile=false (desktop
        // viewport). v50-05-05 introduces a mobile-narrow branch keyed on
        // `(max-width: 767px)`; we need it false here so the desktop table
        // (and its DropdownCell) renders.
        mockedUseMediaQuery.mockImplementation((query: string) => {
            if (query.includes('pointer: coarse')) return true
            return false
        })

        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0', key: 'D' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const buttons = await screen.findAllByTestId('dropdown-cell-button')
        fireEvent.click(buttons[0])

        // Sheet variant renders with role="dialog"; Popover variant does
        // NOT (it uses a portal but no dialog role).
        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument()
        })
    })
})
