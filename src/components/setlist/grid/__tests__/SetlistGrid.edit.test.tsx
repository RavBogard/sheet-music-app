import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const propagateSpy = vi.fn()
vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: (...args: unknown[]) => propagateSpy(...args),
    seedTrackFromSong: vi.fn(),
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

async function getOutboxRows() {
    return getDb().outbox.toArray()
}

async function clearOutbox() {
    await getDb().outbox.clear()
}

describe('SetlistGrid (cell-edit interactions)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        propagateSpy.mockClear()
        mockBack.mockClear()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('AC-3: Title cell commit fires applyEdit on Tab', async () => {
        await seedTracks('set-1', [
            { id: 't-1', order: 0, title: 'Adon Olam', key: 'Dm' },
        ])
        render(<SetlistGrid setlistId="set-1" name="Friday" />)

        await screen.findByText('Adon Olam')
        await clearOutbox()

        const titleButton = screen.getByLabelText('Track title')
        const user = userEvent.setup()
        await user.click(titleButton)
        // Click triggers focus + onClick (selects). Press Enter to enter edit.
        await user.keyboard('{Enter}')

        const input = await screen.findByTestId('text-cell-input')
        // Type appended; input is uncontrolled-driven (controlled state in component).
        await user.type(input, ' Slow{Tab}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.length).toBeGreaterThanOrEqual(1)
        })
        const rows = await getOutboxRows()
        const row = rows[rows.length - 1]
        expect(row.collection).toBe('tracks')
        expect(row.docId).toBe('t-1')
        expect(row.op).toBe('update')
        expect(row.payload).toMatchObject({ title: 'Adon Olam Slow' })
    })

    it('AC-4: Esc discards in-flight edit', async () => {
        await seedTracks('set-2', [
            { id: 't-1', order: 0, title: 'Adon Olam' },
        ])
        render(<SetlistGrid setlistId="set-2" />)

        await screen.findByText('Adon Olam')
        await clearOutbox()

        const titleButton = screen.getByLabelText('Track title')
        const user = userEvent.setup()
        await user.click(titleButton)
        await user.keyboard('{Enter}')

        const input = await screen.findByTestId('text-cell-input')
        await user.type(input, 'X{Escape}')

        // No applyEdit fired.
        const rows = await getOutboxRows()
        expect(rows).toHaveLength(0)

        // Cell returned to display mode showing original value.
        await waitFor(() => {
            expect(screen.getByLabelText('Track title')).toHaveTextContent(
                'Adon Olam',
            )
        })
    })

    it('AC-5: Key cell commit fires applyEdit + propagateTrackEditToSong when songId present', async () => {
        await seedTracks('set-3', [
            {
                id: 't-1',
                order: 0,
                title: 'Adon Olam',
                key: 'Dm',
                songId: 'song-adon-olam',
            },
        ])
        render(<SetlistGrid setlistId="set-3" />)

        await screen.findByText('Adon Olam')
        await clearOutbox()

        const keyButton = screen.getByLabelText('Track key')
        const user = userEvent.setup()
        // Click on the dropdown cell (Popover.Trigger) opens the combobox.
        // §6.3: dropdown cells open on click — they do NOT have a separate
        // "selected" state like text cells.
        await user.click(keyButton)

        // Popover open: cmdk input visible. Filter to "G" then Enter to select.
        const filterInput = await screen.findByPlaceholderText(/pick key/i)
        await user.type(filterInput, 'G')
        await user.keyboard('{Enter}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.length).toBeGreaterThanOrEqual(1)
        })
        const rows = await getOutboxRows()
        const row = rows[rows.length - 1]
        expect(row.collection).toBe('tracks')
        expect(row.payload).toMatchObject({ key: 'G' })

        expect(propagateSpy).toHaveBeenCalledWith(
            'song-adon-olam',
            { key: 'G' },
            'set-3',
        )
    })

    it('Key cell does NOT propagate when track has no songId', async () => {
        await seedTracks('set-4', [
            { id: 't-1', order: 0, title: 'Custom track', key: 'Dm' },
        ])
        render(<SetlistGrid setlistId="set-4" />)

        await screen.findByText('Custom track')
        await clearOutbox()

        const keyButton = screen.getByLabelText('Track key')
        const user = userEvent.setup()
        await user.click(keyButton)
        const filterInput = await screen.findByPlaceholderText(/pick key/i)
        await user.type(filterInput, 'F')
        await user.keyboard('{Enter}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.length).toBeGreaterThanOrEqual(1)
        })
        expect(propagateSpy).not.toHaveBeenCalled()
    })

    it('Lead cell aliases helper key (lead) from track field (leadMusician)', async () => {
        await seedTracks('set-5', [
            {
                id: 't-1',
                order: 0,
                title: 'Adon Olam',
                songId: 'song-adon-olam',
            },
        ])
        render(<SetlistGrid setlistId="set-5" />)

        await screen.findByText('Adon Olam')
        await clearOutbox()

        const leadButton = screen.getByLabelText('Track lead musician')
        const user = userEvent.setup()
        await user.click(leadButton)
        const filterInput = await screen.findByPlaceholderText(/pick lead/i)
        await user.type(filterInput, 'Rabbi D')
        // Free-text "+ Add" item is presented because no match.
        await user.keyboard('{Enter}')

        await waitFor(async () => {
            const rows = await getOutboxRows()
            expect(rows.length).toBeGreaterThanOrEqual(1)
        })
        const rows = await getOutboxRows()
        expect(rows[rows.length - 1].payload).toMatchObject({
            leadMusician: 'Rabbi D',
        })
        expect(propagateSpy).toHaveBeenCalledWith(
            'song-adon-olam',
            { lead: 'Rabbi D' },
            'set-5',
        )
    })

    it('Arrow Down moves cell focus to next row, same column', async () => {
        await seedTracks('set-6', [
            { id: 't-1', order: 0, title: 'Adon Olam', key: 'Dm' },
            { id: 't-2', order: 1, title: 'Lecha Dodi', key: 'G' },
            { id: 't-3', order: 2, title: 'Aleinu', key: 'F' },
        ])
        render(<SetlistGrid setlistId="set-6" />)

        await screen.findByText('Lecha Dodi')

        const titleButtons = screen.getAllByLabelText('Track title')
        expect(titleButtons).toHaveLength(3)

        const user = userEvent.setup()
        await user.click(titleButtons[0]) // focus row 0
        await user.keyboard('{ArrowDown}')

        // Row 1's title cell should now be the only one with tabIndex=0.
        await waitFor(() => {
            const buttons = screen.getAllByLabelText('Track title')
            expect(buttons[0]).toHaveAttribute('tabIndex', '-1')
            expect(buttons[1]).toHaveAttribute('tabIndex', '0')
            expect(buttons[2]).toHaveAttribute('tabIndex', '-1')
        })
    })
})
