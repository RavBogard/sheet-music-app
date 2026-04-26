import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { act, render, screen, waitFor } from '@testing-library/react'
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

        const rows = await screen.findAllByRole('row')
        // 1 header row + 3 data rows
        expect(rows).toHaveLength(4)

        const dataRows = rows.slice(1)
        expect(dataRows[0]).toHaveAttribute('data-row-id', 't-1')
        expect(dataRows[1]).toHaveAttribute('data-row-id', 't-2')
        expect(dataRows[2]).toHaveAttribute('data-row-id', 't-3')

        expect(dataRows[0]).toHaveTextContent('Adon Olam')
        expect(dataRows[1]).toHaveTextContent('Lecha Dodi')
        expect(dataRows[2]).toHaveTextContent('Aleinu')
    })

    it('reactively picks up a new track inserted directly into Dexie', async () => {
        await seedTracks('set-2', [
            { id: 't-1', order: 0, title: 'Adon Olam' },
        ])

        render(<SetlistGrid setlistId="set-2" name="Friday Service" />)

        // Wait for initial render to settle.
        await screen.findByText('Adon Olam')
        const initial = screen.getAllByRole('row')
        expect(initial).toHaveLength(2) // header + 1 data row

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
        const updated = screen.getAllByRole('row')
        expect(updated).toHaveLength(3) // header + 2 data rows
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
