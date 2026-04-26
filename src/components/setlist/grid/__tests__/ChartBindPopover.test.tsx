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
import type { LocalSong } from '@/lib/local/types'

import { ChartBindPopover } from '../ChartBindPopover'
import { ChartCell } from '../cells/ChartCell'

async function seedSongs(rows: Pick<LocalSong, 'id' | 'title'>[]) {
    const db = getDb()
    const docs: LocalSong[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        normalizedTitle: r.title.toLowerCase(),
    }))
    await db.songs.bulkPut(docs)
}

describe('ChartBindPopover', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('opens on trigger click and lists library songs', async () => {
        await seedSongs([
            { id: 'song-1', title: 'Adon Olam' },
            { id: 'song-2', title: 'Lecha Dodi' },
        ])

        const onBind = vi.fn()
        render(
            <ChartBindPopover onBind={onBind}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        // Wait for the Dexie live query to resolve before opening so the
        // CommandList renders with options on first paint.
        await waitFor(async () => {
            const songs = await getDb().songs.toArray()
            expect(songs).toHaveLength(2)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))

        await waitFor(() => {
            expect(screen.getByTestId('chart-bind-popover')).toBeInTheDocument()
        })
        expect(screen.getByText('Adon Olam')).toBeInTheDocument()
        expect(screen.getByText('Lecha Dodi')).toBeInTheDocument()
    })

    it('selecting a library entry fires onBind with songId + title and closes', async () => {
        await seedSongs([{ id: 'song-1', title: 'Adon Olam' }])
        const onBind = vi.fn()

        render(
            <ChartBindPopover onBind={onBind}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            const songs = await getDb().songs.toArray()
            expect(songs).toHaveLength(1)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByText('Adon Olam')
        await userEvent.click(screen.getByText('Adon Olam'))

        expect(onBind).toHaveBeenCalledTimes(1)
        expect(onBind).toHaveBeenCalledWith({
            songId: 'song-1',
            title: 'Adon Olam',
        })

        await waitFor(() => {
            expect(
                screen.queryByTestId('chart-bind-popover'),
            ).not.toBeInTheDocument()
        })
    })

    it('Escape closes without firing onBind', async () => {
        await seedSongs([{ id: 'song-1', title: 'Adon Olam' }])
        const onBind = vi.fn()

        render(
            <ChartBindPopover onBind={onBind}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(1)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        await userEvent.keyboard('{Escape}')

        await waitFor(() => {
            expect(
                screen.queryByTestId('chart-bind-popover'),
            ).not.toBeInTheDocument()
        })
        expect(onBind).not.toHaveBeenCalled()
    })

    it('marks the currentSongId entry with data-current="true" for re-bind preselect', async () => {
        await seedSongs([
            { id: 'song-1', title: 'Adon Olam' },
            { id: 'song-2', title: 'Lecha Dodi' },
        ])

        render(
            <ChartBindPopover currentSongId="song-2" onBind={vi.fn()}>
                <ChartCell hasChart={true} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(2)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))

        const lechaDodiItem = await screen.findByText('Lecha Dodi')
        // The CommandItem wraps the title text — walk up to find the row.
        const item = lechaDodiItem.closest('[data-current]')
        expect(item).not.toBeNull()
        expect(item).toHaveAttribute('data-current', 'true')

        const adonItem = screen.getByText('Adon Olam').closest('[data-current]')
        // Adon Olam should NOT carry data-current (only the matching one does)
        expect(adonItem).toBeNull()
    })
})
