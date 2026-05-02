import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
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

import { AddRowPlaceholder } from '../AddRowPlaceholder'

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

describe('AddRowPlaceholder', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('renders the v53-03-01 trigger with "Song" label and indigo Plus icon', () => {
        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        const trigger = screen.getByTestId('add-row-trigger')
        expect(trigger).toHaveTextContent('Song')
        expect(trigger).not.toHaveTextContent('Add a song or section')
        const icon = trigger.querySelector('svg')
        expect(icon?.getAttribute('class') ?? '').toMatch(/text-indigo-300/)
    })

    it('opens the picker on trigger click and lists library songs alphabetically', async () => {
        await seedSongs([
            { id: 's-2', title: 'Lecha Dodi' },
            { id: 's-1', title: 'Adon Olam' },
        ])

        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(2)
        })

        await userEvent.click(screen.getByTestId('add-row-trigger'))

        await waitFor(() => {
            expect(screen.getByText('Library')).toBeInTheDocument()
        })

        const libraryHeading = screen.getByText('Library')
        const libraryGroup = libraryHeading.closest('[cmdk-group]')
        expect(libraryGroup).not.toBeNull()
        const items = libraryGroup?.querySelectorAll('[cmdk-item]') ?? []
        const titles = Array.from(items).map((el) =>
            el.textContent?.trim() ?? '',
        )
        expect(titles).toEqual(['Adon Olam', 'Lecha Dodi'])
    })

    it('calls onPickSong with id+title when a library item is selected', async () => {
        await seedSongs([{ id: 'song-x', title: 'Hineh Ma Tov' }])
        const onPickSong = vi.fn()

        render(
            <AddRowPlaceholder
                onPickSong={onPickSong}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(1)
        })

        await userEvent.click(screen.getByTestId('add-row-trigger'))

        await waitFor(() => {
            expect(screen.getByText('Hineh Ma Tov')).toBeInTheDocument()
        })

        await userEvent.click(screen.getByText('Hineh Ma Tov'))

        expect(onPickSong).toHaveBeenCalledWith({
            id: 'song-x',
            title: 'Hineh Ma Tov',
        })
    })

    it('renders Custom CommandGroup with "Create new track" item when filter is non-empty', async () => {
        const onCreateFreeText = vi.fn()

        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={onCreateFreeText}
            />,
        )

        await userEvent.click(screen.getByTestId('add-row-trigger'))

        const input = await screen.findByPlaceholderText(
            /Type a song title/i,
        )
        await userEvent.type(input, 'My New Track')

        await waitFor(() => {
            expect(screen.getByText('Custom')).toBeInTheDocument()
        })

        // Source uses curly quotes ("…") around the typed filter; locate
        // the Custom CommandGroup directly and click its sole CommandItem.
        const customGroup = screen
            .getByText('Custom')
            .closest('[cmdk-group]') as HTMLElement
        const customItem = customGroup.querySelector(
            '[cmdk-item]',
        ) as HTMLElement
        expect(customItem.textContent).toContain('My New Track')
        await userEvent.click(customItem)

        expect(onCreateFreeText).toHaveBeenCalledWith('My New Track')
    })

    it('opens automatically when autoOpen is true (EmptyState path)', async () => {
        await seedSongs([{ id: 's-1', title: 'Adon Olam' }])

        render(
            <AddRowPlaceholder
                autoOpen
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(() => {
            expect(screen.getByText('Library')).toBeInTheDocument()
        })
    })

    it('preserves data-testid="add-row-placeholder" wrapper + add-row-trigger button (boundary lock)', () => {
        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        expect(screen.getByTestId('add-row-placeholder')).toBeInTheDocument()
        expect(screen.getByTestId('add-row-trigger')).toBeInTheDocument()
    })
})

describe('AddRowPlaceholder v53-03-01: Recent section', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('renders Recent group above Library when songs have recent[]; caps at 5; sorted desc', async () => {
        // 7 songs total; 6 with recent[]; cap to top 5.
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam', performedAt: 1_000 },
            { id: 's-b', title: 'Lecha Dodi', performedAt: 7_000 },
            { id: 's-c', title: 'Mi Chamocha', performedAt: 5_000 },
            { id: 's-d', title: 'Hineh Ma Tov', performedAt: 6_000 },
            { id: 's-e', title: 'Shalom Aleichem', performedAt: 3_000 },
            { id: 's-f', title: 'Heveinu Shalom', performedAt: 4_000 },
            { id: 's-g', title: 'Yedid Nefesh' /* no recent */ },
        ])

        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(7)
        })

        await userEvent.click(screen.getByTestId('add-row-trigger'))

        // Recent CommandGroup must exist; cap of 5; desc by performedAt.
        // Adon Olam (1_000) is the lowest performedAt and falls below cap.
        const recentHeading = await screen.findByText('Recent')
        const recentGroup = recentHeading.closest('[cmdk-group]')
        expect(recentGroup).not.toBeNull()
        const recentItems =
            recentGroup?.querySelectorAll('[cmdk-item]') ?? []
        expect(recentItems).toHaveLength(5)
        const recentTitles = Array.from(recentItems).map(
            (el) => el.textContent?.trim() ?? '',
        )
        expect(recentTitles).toEqual([
            'Lecha Dodi',
            'Hineh Ma Tov',
            'Mi Chamocha',
            'Heveinu Shalom',
            'Shalom Aleichem',
        ])

        // Library group still shows ALL 7 alphabetically (Apple-Music /
        // Spotify pattern — recent songs appear in both groups).
        const libraryHeading = screen.getByText('Library')
        const libraryGroup = libraryHeading.closest('[cmdk-group]')
        const libraryItems =
            libraryGroup?.querySelectorAll('[cmdk-item]') ?? []
        expect(libraryItems).toHaveLength(7)
    })

    it('hides the Recent group entirely when no song has recent[] history', async () => {
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam' /* no recent */ },
            { id: 's-b', title: 'Lecha Dodi' /* no recent */ },
            { id: 's-c', title: 'Mi Chamocha' /* no recent */ },
        ])

        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(3)
        })

        await userEvent.click(screen.getByTestId('add-row-trigger'))

        // Wait for Library to render so we know the picker has populated
        // before asserting Recent is absent.
        await waitFor(() => {
            expect(screen.getByText('Library')).toBeInTheDocument()
        })
        expect(screen.queryByText('Recent')).not.toBeInTheDocument()
    })

    it('cmdk filter narrows BOTH Recent and Library groups when typing', async () => {
        await seedWithRecents([
            { id: 's-a', title: 'Adon Olam', performedAt: 5_000 },
            { id: 's-b', title: 'Lecha Dodi', performedAt: 4_000 },
            { id: 's-c', title: 'Mi Chamocha', performedAt: 3_000 },
            { id: 's-d', title: 'Hineh Ma Tov' /* no recent */ },
        ])

        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        await waitFor(async () => {
            expect((await getDb().songs.toArray()).length).toBe(4)
        })

        await userEvent.click(screen.getByTestId('add-row-trigger'))
        const input = await screen.findByPlaceholderText(
            /Type a song title/i,
        )
        await userEvent.type(input, 'Lecha')

        // Only "Lecha Dodi" should remain visible across BOTH groups.
        await waitFor(() => {
            const recentGroup = screen
                .queryByText('Recent')
                ?.closest('[cmdk-group]')
            // Recent group may be hidden by cmdk if no items match; if
            // present, it should contain only Lecha Dodi.
            if (recentGroup) {
                const items = within(
                    recentGroup as HTMLElement,
                ).getAllByText(/Lecha Dodi/)
                expect(items.length).toBeGreaterThan(0)
            }
            const libraryGroup = screen
                .getByText('Library')
                .closest('[cmdk-group]') as HTMLElement
            const libraryTitles = within(libraryGroup)
                .getAllByText(/.+/)
                .map((el) => el.textContent?.trim() ?? '')
            expect(
                libraryTitles.some((t) => t.includes('Lecha Dodi')),
            ).toBe(true)
            expect(
                libraryTitles.some((t) => t.includes('Adon Olam')),
            ).toBe(false)
        })
    })
})

describe('AddRowPlaceholder v53-03-01: long-press disambiguation', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('preventDefaults the contextmenu event on the trigger button', async () => {
        render(
            <AddRowPlaceholder
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
            />,
        )

        const trigger = screen.getByTestId('add-row-trigger')
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })
        trigger.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
    })
})
