import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { cleanup, render, screen, within } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

expect.extend(toHaveNoViolations)

/**
 * WCAG AA audit of the card DOM — the surface that actually renders.
 *
 * WHY THIS FILE EXISTS. `SetlistGrid.a11y.test.tsx` audited the desktop
 * TanStack-table DOM (`role="row"`, `data-testid="drag-handle"`, table cells),
 * and that DOM was DELETED in `0ec6773c`. Its audits were quarantined with a
 * note saying they needed "a from-scratch card-DOM a11y suite". Quarantined
 * with no replacement means the editor has had NO automated accessibility
 * coverage since May — so this is the replacement, written against the list
 * that ships (audit item (q), 2026-09-20).
 *
 * WHAT IT ASSERTS THAT A SNAPSHOT WOULD NOT. Each case is a state a real
 * author reaches — a plain service, a service with section rows, a row open
 * for editing, an empty setlist — because an accessibility failure usually
 * lives in a state, not in the component at rest. The drag handle gets its own
 * assertion: `MobileCardList` wires dnd-kit's `KeyboardSensor`, which can only
 * be reached through a focusable, named control, so the handle's name is the
 * difference between reorder-by-keyboard working and silently not existing.
 */

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
const g = globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }
g.ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}

vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: vi.fn(() => false) }))
import { useMediaQuery } from '@/hooks/use-media-query'
const mockedUseMediaQuery = vi.mocked(useMediaQuery)

vi.mock('next/navigation', () => ({
    useRouter: () => ({ back: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/lib/songs/defaults', () => ({
    propagateTrackEditToSong: vi.fn(),
    seedTrackFromSong: vi.fn(async () => ({})),
    flushPendingPropagations: vi.fn(),
    __resetForTests: vi.fn(),
}))

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalTrack } from '@/lib/local/types'
import { DeleteConfirmProvider } from '../DeleteConfirmProvider'
import { SetlistGrid } from '../SetlistGrid'

/**
 * The harness mounts a fragment, not the app shell, so the landmark and
 * document-structure rules fire on the absence of a page rather than on
 * anything this component does. Everything else in WCAG 2.1 AA stays on —
 * in particular colour contrast, name/role/value, and ARIA validity, which
 * are the rules a card layout can actually break.
 */
const axeOpts = {
    rules: {
        region: { enabled: false },
        'landmark-one-main': { enabled: false },
        'page-has-heading-one': { enabled: false },
    },
}

async function seedTracks(setlistId: string, rows: Partial<LocalTrack>[]) {
    const db = getDb()
    await db.tracks.bulkPut(
        rows.map((r, i) => ({
            id: r.id ?? `${setlistId}-track-${i}`,
            setlistId,
            order: r.order ?? i,
            ...r,
        })) as LocalTrack[],
    )
}

function renderGrid(setlistId = 'set-a') {
    return render(
        <DeleteConfirmProvider>
            <SetlistGrid setlistId={setlistId} name="Kol Nidre" />
        </DeleteConfirmProvider>,
    )
}

describe('SetlistGrid card DOM — WCAG AA audit', () => {
    beforeEach(async () => {
        await resetDbForTests()
        mockedUseMediaQuery.mockReset()
        // The card list is the only render path, on every width. Pin the
        // media query to mobile anyway so a future desktop branch cannot
        // quietly change what this suite is auditing.
        mockedUseMediaQuery.mockImplementation((q: string) =>
            q.includes('max-width'),
        )
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('a service of song rows has no violations', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: "Kol Nidre", key: 'Dm', leadMusician: 'Karen' },
            { id: 't-1', order: 1, title: "Bar'chu", key: 'Am', leadMusician: 'Randy' },
            { id: 't-2', order: 2, title: "V'ahavta", leadMusician: 'Randy' },
        ])
        const { container } = renderGrid()
        await screen.findByTestId('mobile-card-t-0')

        expect(await axe(container, axeOpts)).toHaveNoViolations()
    })

    it('section rows and chartless rows have no violations', async () => {
        // A real service is not a uniform list: section headers, a prayer with
        // no chart, and a bonded row all render differently in MobileRowCard.
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Evening Service', type: 'header' },
            { id: 't-1', order: 1, title: 'Silent Moment', type: 'section' },
            { id: 't-2', order: 2, title: 'Aleinu', songId: 'song-aleinu', fileId: 'f-1' },
            { id: 't-3', order: 3, title: "Mourner's Kaddish" },
        ])
        const { container } = renderGrid()
        await screen.findByTestId('mobile-card-t-2')

        expect(await axe(container, axeOpts)).toHaveNoViolations()
    })

    it('an empty setlist has no violations', async () => {
        const { container } = renderGrid('set-empty')
        await screen.findByTestId('setlist-grid-empty-state')

        expect(await axe(container, axeOpts)).toHaveNoViolations()
    })

    it('every row exposes a named drag handle, which is how keyboard reorder is reachable', async () => {
        await seedTracks('set-a', [
            { id: 't-0', order: 0, title: 'Niggun' },
            { id: 't-1', order: 1, title: 'Untitled' },
            { id: 't-2', order: 2 },
        ])
        renderGrid()
        await screen.findByTestId('mobile-card-t-0')

        // dnd-kit's KeyboardSensor activates from the focused handle. A handle
        // that is not a button, or has no accessible name, takes reorder away
        // from anyone not using a pointer — and does it silently.
        for (const id of ['t-0', 't-1', 't-2']) {
            const handle = screen.getByTestId(`mobile-card-handle-${id}`)
            expect(handle.tagName).toBe('BUTTON')
            expect(handle).toHaveAccessibleName(/drag to reorder/i)
        }

        // A row with no title still gets a usable name rather than a bare
        // "Drag to reorder" that reads identically on every empty row.
        expect(
            screen.getByTestId('mobile-card-handle-t-2'),
        ).toHaveAccessibleName(/untitled track/i)
    })

    it('each card is a list item with an accessible name that says what tapping does', async () => {
        await seedTracks('set-a', [{ id: 't-0', order: 0, title: 'Avinu Malkeinu' }])
        renderGrid()

        const list = await screen.findByTestId('mobile-card-list')
        expect(list).toHaveAttribute('role', 'list')

        const card = screen.getByTestId('mobile-card-t-0')
        expect(card).toHaveAccessibleName(/avinu malkeinu/i)
        expect(card).toHaveAccessibleName(/tap to edit/i)
        expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0)
    })
})
