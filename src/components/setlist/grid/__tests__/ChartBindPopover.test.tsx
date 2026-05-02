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

async function seedWithRecents(
    rows: Array<{ id: string; title: string; performedAt?: number }>,
) {
    const db = getDb()
    const docs: LocalSong[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        normalizedTitle: r.title.toLowerCase(),
        recent:
            r.performedAt !== undefined
                ? [{ setlistId: 'sl-1', performedAt: r.performedAt }]
                : undefined,
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

describe('ChartBindPopover v53-02-01: cmdk value-format fix', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('typing a title substring narrows results to matching songs only', async () => {
        await seedSongs([
            { id: 'song-1', title: 'Adon Olam' },
            { id: 'song-2', title: 'Lecha Dodi' },
            { id: 'song-3', title: 'Hineh Mah Tov' },
        ])

        render(
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(3)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        // Type a substring of "Lecha Dodi" — only that row should match.
        await userEvent.type(
            screen.getByLabelText('Bind a chart'),
            'lecha',
        )

        await waitFor(() => {
            expect(screen.getByText('Lecha Dodi')).toBeInTheDocument()
            expect(screen.queryByText('Adon Olam')).not.toBeInTheDocument()
            expect(
                screen.queryByText('Hineh Mah Tov'),
            ).not.toBeInTheDocument()
        })
    })

    it('typing a pure id substring (no title overlap) does NOT match any song', async () => {
        // Pre-cmdk-fix: value=`${title} ${id}` polluted the filter so
        // typing the id would surface the row. Post-fix: value=title only;
        // id substrings should miss entirely.
        await seedSongs([{ id: 'songABC', title: 'Adon Olam' }])

        render(
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(1)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        await userEvent.type(
            screen.getByLabelText('Bind a chart'),
            'songabc',
        )

        await waitFor(() => {
            expect(screen.queryByText('Adon Olam')).not.toBeInTheDocument()
            expect(screen.getByText('No matches.')).toBeInTheDocument()
        })
    })
})

describe('ChartBindPopover v53-02-01: Recent section', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('renders a Recent group above Library, capped at 5 items, sorted by performedAt desc', async () => {
        // 7 songs total; 6 with recent[]; cap to top 5.
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam', performedAt: 1_000 },
            { id: 's-b', title: 'Lecha Dodi', performedAt: 6_000 },
            { id: 's-c', title: 'Hineh Mah Tov', performedAt: 5_000 },
            { id: 's-d', title: 'Mi Chamocha', performedAt: 4_000 },
            { id: 's-e', title: 'Oseh Shalom', performedAt: 3_000 },
            { id: 's-f', title: 'Shalom Aleichem', performedAt: 2_000 },
            { id: 's-g', title: 'Yedid Nefesh' /* no recent */ },
        ])

        render(
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(7)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        // Both group headings present.
        expect(await screen.findByText('Recent')).toBeInTheDocument()
        expect(screen.getByText('Library')).toBeInTheDocument()

        // Recent group renders exactly 5 items (the lowest-performedAt
        // recent entry — Adon Olam at 1_000 — falls below the cap and is
        // NOT in the Recent group, but still appears in Library).
        const recentHeading = screen.getByText('Recent')
        const recentGroup = recentHeading.closest('[cmdk-group]')
        expect(recentGroup).not.toBeNull()
        const recentItems =
            recentGroup?.querySelectorAll('[cmdk-item]') ?? []
        expect(recentItems).toHaveLength(5)

        // Order: 6_000 → 5_000 → 4_000 → 3_000 → 2_000 (desc).
        const recentTitles = Array.from(recentItems).map(
            (el) => el.textContent?.trim() ?? '',
        )
        expect(recentTitles).toEqual([
            'Lecha Dodi',
            'Hineh Mah Tov',
            'Mi Chamocha',
            'Oseh Shalom',
            'Shalom Aleichem',
        ])
    })

    it('hides the Recent group entirely when no song has recent[] history', async () => {
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam' },
            { id: 's-b', title: 'Lecha Dodi' },
            { id: 's-c', title: 'Hineh Mah Tov' },
        ])

        render(
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(3)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        expect(screen.queryByText('Recent')).not.toBeInTheDocument()
        expect(screen.getByText('Library')).toBeInTheDocument()
    })

    it('renders Recent group with all entries when count is under the cap', async () => {
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam', performedAt: 3_000 },
            { id: 's-b', title: 'Lecha Dodi', performedAt: 1_000 },
            { id: 's-c', title: 'Hineh Mah Tov', performedAt: 2_000 },
            { id: 's-d', title: 'Mi Chamocha' /* no recent */ },
        ])

        render(
            <ChartBindPopover onBind={vi.fn()}>
                <ChartCell hasChart={false} />
            </ChartBindPopover>,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(4)
        })

        await userEvent.click(screen.getByTestId('chart-cell'))
        await screen.findByTestId('chart-bind-popover')

        const recentHeading = await screen.findByText('Recent')
        const recentGroup = recentHeading.closest('[cmdk-group]')
        expect(recentGroup).not.toBeNull()
        const recentItems =
            recentGroup?.querySelectorAll('[cmdk-item]') ?? []
        expect(recentItems).toHaveLength(3)
    })
})
