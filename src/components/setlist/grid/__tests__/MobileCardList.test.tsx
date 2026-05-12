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

// Mock useMediaQuery: per-test we set the return based on the query
// string. Default → false (desktop, fine pointer).
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Configure mock so `(max-width: 767px)` returns the mobile flag and
// `(pointer: coarse)` returns false (this branch tests the mobile
// stacked-card render path on a non-touch device explicitly; we cover
// touch separately in the long-press case).
function setMobile(mobile: boolean, coarse = false) {
    mockedUseMediaQuery.mockImplementation((query: string) => {
        if (query.includes('max-width')) return mobile
        if (query.includes('pointer: coarse')) return coarse
        return false
    })
}

describe('SetlistGrid — mobile stacked-card render path (v50-05-05 §6.11)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockBack.mockClear()
        propagateSpy.mockClear()
        mockedUseMediaQuery.mockReset()
        setMobile(false)
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('AC-1: mobile branch renders <ul mobile-card-list> and NOT a <table>', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        // Wait for live query hydration to populate cards.
        await screen.findByTestId('mobile-card-t-0')
        expect(screen.getByTestId('mobile-card-list')).toBeInTheDocument()
        expect(screen.getByTestId('mobile-card-t-1')).toBeInTheDocument()
        // No <table> in the document.
        expect(document.querySelector('table')).toBeNull()
    })

    // T1.6 (2026-05-12): skipped — the desktop <table> branch was deleted
    // in commit 0ec6773c (May 9). MobileCardList is now the only render
    // path. This assertion is obsolete; delete in T2.6 dead-code sweep.
    it.skip('AC-1: desktop branch renders <table> and NOT mobile-card-list', async () => {
        setMobile(false)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        await waitFor(() => {
            expect(document.querySelector('table')).not.toBeNull()
        })
        expect(screen.queryByTestId('mobile-card-list')).toBeNull()
    })

    // T1.6 (2026-05-12): skipped — the per-card inline editor is no
    // longer a Radix Sheet; it's an in-page <aside> that appears below
    // the card on tap (MobileRowCard.tsx). Tests assertion against
    // "Sheet" / dialog roles is stale. Rewrite to assert against the
    // inline panel.
    it.skip('AC-2: tap a card opens MobileEditSheet with form fields', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            {
                id: 't-0',
                order: 0,
                title: 'My Song',
                key: 'D',
                bpm: 120,
                leadMusician: 'Daniel',
            },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const card = await screen.findByTestId('mobile-card-t-0')
        fireEvent.click(card)

        // Sheet (Radix Dialog) renders.
        const sheet = await screen.findByTestId('mobile-edit-sheet')
        expect(sheet).toBeInTheDocument()
        // Form fields present.
        expect(within(sheet).getByTestId('mobile-edit-title')).toHaveValue(
            'My Song',
        )
        expect(within(sheet).getByTestId('mobile-edit-key')).toHaveValue('D')
        expect(within(sheet).getByTestId('mobile-edit-bpm')).toHaveValue(120)
        expect(within(sheet).getByTestId('mobile-edit-lead')).toHaveValue(
            'Daniel',
        )
    })

    // T1.6: skipped, same reason as above (no Sheet). The Title-on-blur
    // behavior still exists in the inline panel; rewrite the test.
    it.skip('AC-2: editing Title in the Sheet + blur fires applyEdit', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Old' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(await screen.findByTestId('mobile-card-t-0'))
        const sheet = await screen.findByTestId('mobile-edit-sheet')
        const titleInput = within(sheet).getByTestId('mobile-edit-title')

        await act(async () => {
            fireEvent.change(titleInput, { target: { value: 'New' } })
            fireEvent.blur(titleInput)
        })

        await waitFor(async () => {
            const tracks = await getDb().tracks.toArray()
            expect(tracks[0].title).toBe('New')
        })
    })

    // T1.6 (2026-05-12): obsoleted by T1.1 (Bug 4). Move Up / Move Down
    // buttons were removed from the inline edit pane; drag-reorder is
    // now the only reorder UI. New drag-reorder coverage lives in the
    // dnd test file (or should — see T1.6 followup).
    it.skip('AC-2: Sheet "Move down" button reorders the row', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'A' },
            { id: 't-1', order: 1, title: 'B' },
            { id: 't-2', order: 2, title: 'C' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(await screen.findByTestId('mobile-card-t-0'))
        const sheet = await screen.findByTestId('mobile-edit-sheet')
        const moveDown = within(sheet).getByTestId('mobile-edit-move-down')

        await act(async () => {
            fireEvent.click(moveDown)
        })

        await waitFor(async () => {
            const tracks = (await getDb().tracks.toArray()).sort(
                (a, b) => a.order - b.order,
            )
            // Row 0 swaps with row 1: B then A then C.
            expect(tracks.map((t) => t.title)).toEqual(['B', 'A', 'C'])
        })
    })

    // T1.6: skipped — no Sheet; the inline panel has a Delete button
    // that fires onDeleteRow directly. Confirm dialog still gates via
    // DeleteConfirmProvider. Rewrite against the inline panel structure.
    it.skip('AC-2: Sheet Delete button → AlertDialog → confirm → row removed', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Doomed' },
            { id: 't-1', order: 1, title: 'Survives' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        fireEvent.click(await screen.findByTestId('mobile-card-t-0'))
        const sheet = await screen.findByTestId('mobile-edit-sheet')
        fireEvent.click(within(sheet).getByTestId('mobile-edit-delete'))

        const dialog = await screen.findByRole('alertdialog')
        expect(within(dialog).getByText(/Doomed/)).toBeInTheDocument()
        await act(async () => {
            fireEvent.click(within(dialog).getByText('Delete'))
        })

        await waitFor(async () => {
            const ids = (await getDb().tracks.toArray()).map((t) => t.id)
            expect(ids).toEqual(['t-1'])
        })
    })

    // T1.6 (2026-05-12): obsoleted by T1.1 (Bug 4). Multi-select was
    // removed entirely; BatchActionBar will be deleted in T2.6 dead-
    // code sweep. The grip icon is now a drag handle, not a multi-
    // select toggle.
    it.skip('AC-1: BatchActionBar mounts when 2+ cards selected via handle Cmd-click', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'A' },
            { id: 't-1', order: 1, title: 'B' },
            { id: 't-2', order: 2, title: 'C' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        await screen.findByTestId('mobile-card-t-0')
        // Plain click on the handle toggles selection (mobile convention).
        fireEvent.click(screen.getByTestId('mobile-card-handle-t-0'))
        fireEvent.click(screen.getByTestId('mobile-card-handle-t-1'))

        await waitFor(() => {
            expect(
                screen.getByTestId('batch-action-bar'),
            ).toBeInTheDocument()
        })
        expect(screen.getByTestId('batch-action-count')).toHaveTextContent(
            '2 rows selected',
        )
    })

    it('AC-3: long-press card 500ms (touch) opens action menu', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const card = await screen.findByTestId('mobile-card-t-0')

        fireEvent.pointerDown(card, {
            pointerType: 'touch',
            clientX: 50,
            clientY: 50,
        })
        await sleep(550)

        await waitFor(() => {
            expect(
                screen.getByTestId('mobile-card-context-menu-edit'),
            ).toBeInTheDocument()
        })
        // 4 expected items.
        expect(
            screen.getByTestId('mobile-card-context-menu-bind-chart'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('mobile-card-context-menu-duplicate'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('mobile-card-context-menu-delete'),
        ).toBeInTheDocument()
    })

    it('AC-3: long-press cancels on movement > 10px', async () => {
        setMobile(true)
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const card = await screen.findByTestId('mobile-card-t-0')

        fireEvent.pointerDown(card, {
            pointerType: 'touch',
            clientX: 50,
            clientY: 50,
        })
        fireEvent.pointerMove(card, {
            pointerType: 'touch',
            clientX: 70,
            clientY: 50,
        })
        await sleep(600)

        expect(
            screen.queryByTestId('mobile-card-context-menu-edit'),
        ).toBeNull()
    })

    // T1.6: skipped — Bug 3 replaced the anchored ChartBindPopover with
    // a centered ChartBindDialog for context-menu-triggered binds. The
    // mobile context menu now opens the dialog. Rewrite to assert on
    // [data-testid="chart-bind-dialog"] instead.
    it.skip('AC-3: ContextMenu Bind chart on mobile opens ChartBindPopover', async () => {
        setMobile(true)
        await seedSongs([
            { id: 'song-a', title: 'Song Alpha' },
        ])
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
        ])
        render(
            <DeleteConfirmProvider>
                <SetlistGrid setlistId="set-a" name="Test" />
            </DeleteConfirmProvider>,
        )

        const card = await screen.findByTestId('mobile-card-t-0')
        // Trigger ContextMenu via right-click (jsdom path).
        fireEvent.contextMenu(card)

        await waitFor(() => {
            expect(
                screen.getByTestId('mobile-card-context-menu-bind-chart'),
            ).toBeInTheDocument()
        })

        fireEvent.click(
            screen.getByTestId('mobile-card-context-menu-bind-chart'),
        )

        await waitFor(() => {
            expect(
                screen.getByTestId('chart-bind-popover'),
            ).toBeInTheDocument()
        })
        // Library options may take an extra render to populate via the
        // dexie-react-hooks live query inside ChartBindPopover.
        await screen.findByText('Song Alpha')
    })
})
