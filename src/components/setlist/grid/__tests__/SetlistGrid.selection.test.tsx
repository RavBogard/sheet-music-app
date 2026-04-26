import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: mockBack, push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: vi.fn(),
    seedTrackFromSong: vi.fn(async () => ({})),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

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

async function rowDragHandles() {
    // Wait for the live query to populate.
    await screen.findAllByTestId('drag-handle')
    return screen.getAllByTestId('drag-handle')
}

describe('SetlistGrid — multi-select via drag-handle modifier-clicks', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockBack.mockClear()
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('AC-1: Cmd-click on drag handle toggles aria-pressed=true on that row only', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'Row 2' },
        ])
        render(<SetlistGrid setlistId="set-a" name="Test" />)

        const handles = await rowDragHandles()
        expect(handles).toHaveLength(3)

        fireEvent.click(handles[0], { metaKey: true })
        await waitFor(() =>
            expect(handles[0]).toHaveAttribute('aria-pressed', 'true'),
        )
        expect(handles[1]).not.toHaveAttribute('aria-pressed')
        expect(handles[2]).not.toHaveAttribute('aria-pressed')
    })

    it('AC-1: multiple Cmd-clicks toggle non-contiguous rows', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'Row 2' },
        ])
        render(<SetlistGrid setlistId="set-a" name="Test" />)

        const handles = await rowDragHandles()
        fireEvent.click(handles[0], { metaKey: true })
        fireEvent.click(handles[2], { metaKey: true })
        await waitFor(() => {
            expect(handles[0]).toHaveAttribute('aria-pressed', 'true')
            expect(handles[2]).toHaveAttribute('aria-pressed', 'true')
        })
        expect(handles[1]).not.toHaveAttribute('aria-pressed')
    })

    it('AC-2: Shift-click after Cmd-click extends inclusive range', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'Row 2' },
            { id: 't-3', order: 3, title: 'Row 3' },
            { id: 't-4', order: 4, title: 'Row 4' },
        ])
        render(<SetlistGrid setlistId="set-a" name="Test" />)

        const handles = await rowDragHandles()
        fireEvent.click(handles[1], { metaKey: true })
        fireEvent.click(handles[4], { shiftKey: true })

        await waitFor(() => {
            expect(handles[1]).toHaveAttribute('aria-pressed', 'true')
            expect(handles[2]).toHaveAttribute('aria-pressed', 'true')
            expect(handles[3]).toHaveAttribute('aria-pressed', 'true')
            expect(handles[4]).toHaveAttribute('aria-pressed', 'true')
        })
        expect(handles[0]).not.toHaveAttribute('aria-pressed')
    })

    it('AC-3: Esc clears the selection', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        const { container } = render(
            <SetlistGrid setlistId="set-a" name="Test" />,
        )

        const handles = await rowDragHandles()
        fireEvent.click(handles[0], { metaKey: true })
        fireEvent.click(handles[1], { metaKey: true })
        await waitFor(() =>
            expect(handles[0]).toHaveAttribute('aria-pressed', 'true'),
        )

        const root = container.querySelector(
            '[data-testid="setlist-grid"]',
        ) as HTMLElement
        fireEvent.keyDown(root, { key: 'Escape' })

        await waitFor(() => {
            expect(handles[0]).not.toHaveAttribute('aria-pressed')
            expect(handles[1]).not.toHaveAttribute('aria-pressed')
        })
    })

    it('plain click (no modifiers) does NOT set aria-pressed (selection untouched)', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
        ])
        render(<SetlistGrid setlistId="set-a" name="Test" />)

        const handles = await rowDragHandles()
        fireEvent.click(handles[0]) // no modifiers

        // Give React a microtask tick.
        await new Promise((r) => setTimeout(r, 0))
        expect(handles[0]).not.toHaveAttribute('aria-pressed')
    })

    it('stale-row prune: deleting a selected row drops it from the selection', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Row 0' },
            { id: 't-1', order: 1, title: 'Row 1' },
            { id: 't-2', order: 2, title: 'Row 2' },
        ])
        render(<SetlistGrid setlistId="set-a" name="Test" />)

        const handlesBefore = await rowDragHandles()
        fireEvent.click(handlesBefore[0], { metaKey: true })
        fireEvent.click(handlesBefore[1], { metaKey: true })
        fireEvent.click(handlesBefore[2], { metaKey: true })
        await waitFor(() =>
            expect(handlesBefore[1]).toHaveAttribute('aria-pressed', 'true'),
        )

        // Remote-delete row 1 directly via Dexie (bypasses applyEdit — the
        // outbox is irrelevant for this test; we want to simulate the
        // live-query removing a row from under the editor). Wrap in act so
        // the live-query → React re-render path is observable.
        await act(async () => {
            await getDb().tracks.delete('t-1')
        })

        await waitFor(async () => {
            const handlesAfter = await screen.findAllByTestId('drag-handle')
            expect(handlesAfter).toHaveLength(2)
            // Surviving rows 0 and 2 should still be selected (anchor was on
            // 't-2', the last toggle, which is still valid).
            expect(handlesAfter[0]).toHaveAttribute('aria-pressed', 'true')
            expect(handlesAfter[1]).toHaveAttribute('aria-pressed', 'true')
        })

        // Drain pending live-query subscription before teardown to avoid
        // unhandled-rejection noise (per v50-05-02 hydrator-test pattern).
        await screen.findAllByTestId('drag-handle')
    })
})
