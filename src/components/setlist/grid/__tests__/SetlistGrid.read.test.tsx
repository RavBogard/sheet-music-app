import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: mockBack, push: vi.fn(), refresh: vi.fn() }),
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

describe('SetlistGrid (read path)', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockBack.mockClear()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('renders the empty state when no tracks exist for the setlist', async () => {
        render(<SetlistGrid setlistId="set-empty" name="New Setlist" />)
        await waitFor(() =>
            expect(
                screen.getByTestId('setlist-grid-empty-state'),
            ).toBeInTheDocument(),
        )
    })

    it('renders rows from Dexie sorted by order', async () => {
        await seedTracks('set-1', [
            { id: 't-2', order: 1, title: 'Lecha Dodi', key: 'G' },
            { id: 't-3', order: 2, title: 'Aleinu', key: 'F' },
            { id: 't-1', order: 0, title: 'Adon Olam', key: 'Dm' },
        ])

        render(<SetlistGrid setlistId="set-1" name="Friday Service" />)

        // Wait for the live query to resolve and rows to render.
        await screen.findByText('Adon Olam')
        await screen.findByText('Lecha Dodi')
        await screen.findByText('Aleinu')

        // SetlistGrid renders the stacked mobile-card list (the desktop
        // TanStack table was deleted in 0ec6773c); cards are <li> items in
        // track-order.
        const list = screen.getByTestId('mobile-card-list')
        const cards = within(list).getAllByRole('listitem')
        expect(cards).toHaveLength(3)

        const rowId = (li: HTMLElement) =>
            li.querySelector('[data-row-id]')?.getAttribute('data-row-id')
        expect(rowId(cards[0])).toBe('t-1')
        expect(rowId(cards[1])).toBe('t-2')
        expect(rowId(cards[2])).toBe('t-3')

        expect(cards[0]).toHaveTextContent('Adon Olam')
        expect(cards[1]).toHaveTextContent('Lecha Dodi')
        expect(cards[2]).toHaveTextContent('Aleinu')
    })

    it('reactively picks up a new track inserted directly into Dexie', async () => {
        await seedTracks('set-2', [
            { id: 't-1', order: 0, title: 'Adon Olam' },
        ])

        render(<SetlistGrid setlistId="set-2" name="Friday Service" />)

        // Wait for initial render to settle.
        await screen.findByText('Adon Olam')
        const list = screen.getByTestId('mobile-card-list')
        expect(within(list).getAllByRole('listitem')).toHaveLength(1)

        await act(async () => {
            await getDb().tracks.put({
                id: 't-2',
                setlistId: 'set-2',
                order: 1,
                title: 'Yigdal',
                key: 'Em',
            })
        })

        await screen.findByText('Yigdal')
        expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    })

    it('back button calls router.back()', async () => {
        const { findByLabelText } = render(
            <SetlistGrid setlistId="set-3" name="Test" />,
        )
        const back = await findByLabelText('Back')
        back.click()
        expect(mockBack).toHaveBeenCalledTimes(1)
    })
})
