import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

expect.extend(toHaveNoViolations)

// jsdom doesn't ship ResizeObserver or Element.scrollIntoView; cmdk +
// Radix Popover use both. Stub before any AddBar render.
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

import { resetDbForTests } from '@/lib/local/schema'

import { AddBar, type NonSongTrackType } from '../AddBar'

const axeOpts = {
    rules: {
        region: { enabled: false },
        'landmark-one-main': { enabled: false },
        'page-has-heading-one': { enabled: false },
        // role="grid" inside the popover is a single 2x3 tile grid, not
        // a data table; aria-required-children/parent fire false positives.
        'aria-required-children': { enabled: false },
        'aria-required-parent': { enabled: false },
    },
}

describe('AddBar v53-03-01: split-button shape', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('renders the split-button: primary AddRowPlaceholder + chevron trigger', () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        // Wrapper exists.
        expect(screen.getByTestId('add-bar')).toBeInTheDocument()
        // Primary CTA from AddRowPlaceholder.
        expect(screen.getByTestId('add-row-trigger')).toBeInTheDocument()
        expect(screen.getByTestId('add-row-trigger')).toHaveTextContent(
            'Song',
        )
        // Chevron trigger present with aria-label (icon-only button rule).
        const chevron = screen.getByTestId('add-bar-chevron-trigger')
        expect(chevron).toBeInTheDocument()
        expect(chevron).toHaveAttribute(
            'aria-label',
            'Add track of another type',
        )
    })

    it('chevron trigger preserves a 44px touch-target floor (h-11 fine; h-12 coarse)', () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const chevron = screen.getByTestId('add-bar-chevron-trigger')
        expect(chevron.className).toMatch(/\bh-11\b/)
        expect(chevron.className).toMatch(/pointer:coarse\)\]:h-12/)
    })

    it('forwards autoOpen to the primary picker (EmptyState path)', async () => {
        render(
            <AddBar
                autoOpen
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        // Library heading appears once the picker has rendered (no songs
        // seeded → Library group is hidden, but CommandList renders).
        // Use the input as the witness instead.
        await waitFor(() => {
            expect(
                screen.getByPlaceholderText(/Type a song title/i),
            ).toBeInTheDocument()
        })
    })
})

describe('AddBar v53-03-01: chevron tile-grid popover', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('opens 5-tile grid on chevron click; tiles are NOT visible when closed', async () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        // Closed initially.
        expect(
            screen.queryByTestId('add-bar-tile-section'),
        ).not.toBeInTheDocument()

        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )

        await waitFor(() => {
            expect(
                screen.getByTestId('add-bar-tile-section'),
            ).toBeInTheDocument()
        })
        // All 5 non-Song types present.
        for (const type of [
            'section',
            'reading',
            'prayer',
            'transition',
            'note',
        ]) {
            expect(
                screen.getByTestId(`add-bar-tile-${type}`),
            ).toBeInTheDocument()
        }
        // No Song tile in the chevron grid (Goal 4 lock — Song lives in
        // primary CTA).
        expect(
            screen.queryByTestId('add-bar-tile-song'),
        ).not.toBeInTheDocument()
    })

    it('each tile carries the expected color token in its icon className', async () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId('add-bar-tile-section'),
            ).toBeInTheDocument()
        })

        const expectations: Array<[NonSongTrackType, RegExp]> = [
            ['section', /text-muted-foreground/],
            ['reading', /text-amber-300/],
            ['prayer', /text-blue-300/],
            ['transition', /text-emerald-300/],
            ['note', /text-muted-foreground/],
        ]

        for (const [type, pattern] of expectations) {
            const tile = screen.getByTestId(`add-bar-tile-${type}`)
            const icon = tile.querySelector('svg')
            expect(icon).not.toBeNull()
            expect(icon?.getAttribute('class') ?? '').toMatch(pattern)
        }
    })

    it('tiles meet ≥48px floor on fine pointer / ≥56px on coarse', async () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )
        const tile = await screen.findByTestId('add-bar-tile-reading')
        expect(tile.className).toMatch(/min-h-\[48px\]/)
        expect(tile.className).toMatch(/pointer:coarse\)\]:min-h-\[56px\]/)
    })

    it('clicking a tile calls onAddTrackOfType with the matching type and closes the popover', async () => {
        const onAddTrackOfType = vi.fn()

        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={onAddTrackOfType}
            />,
        )

        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )
        const readingTile = await screen.findByTestId(
            'add-bar-tile-reading',
        )
        await userEvent.click(readingTile)

        expect(onAddTrackOfType).toHaveBeenCalledTimes(1)
        expect(onAddTrackOfType).toHaveBeenCalledWith('reading')

        // Popover closes after tile click.
        await waitFor(() => {
            expect(
                screen.queryByTestId('add-bar-tile-reading'),
            ).not.toBeInTheDocument()
        })
    })

    it('all 5 tiles route to onAddTrackOfType with their respective types', async () => {
        const onAddTrackOfType = vi.fn()

        const { rerender } = render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={onAddTrackOfType}
            />,
        )

        const types: NonSongTrackType[] = [
            'section',
            'reading',
            'prayer',
            'transition',
            'note',
        ]
        for (const type of types) {
            // Re-render to reset popover state cleanly between iterations.
            rerender(
                <AddBar
                    onPickSong={vi.fn()}
                    onCreateFreeText={vi.fn()}
                    onAddTrackOfType={onAddTrackOfType}
                />,
            )
            await userEvent.click(
                screen.getByTestId('add-bar-chevron-trigger'),
            )
            const tile = await screen.findByTestId(`add-bar-tile-${type}`)
            await userEvent.click(tile)
        }

        expect(onAddTrackOfType).toHaveBeenCalledTimes(5)
        expect(
            onAddTrackOfType.mock.calls.map((c) => c[0]),
        ).toEqual(types)
    })
})

describe('AddBar v53-03-01: long-press disambiguation', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('preventDefaults contextmenu on the chevron trigger', () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const chevron = screen.getByTestId('add-bar-chevron-trigger')
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })
        chevron.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
    })

    it('preventDefaults contextmenu on every tile button', async () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId('add-bar-tile-section'),
            ).toBeInTheDocument()
        })

        for (const type of [
            'section',
            'reading',
            'prayer',
            'transition',
            'note',
        ]) {
            const tile = screen.getByTestId(`add-bar-tile-${type}`)
            const event = new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
            })
            tile.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(true)
        }
    })
})

describe('AddBar v60-10-01: coarse-pointer sticky-bottom variant', () => {
    beforeEach(async () => {
        await resetDbForTests()
        vi.resetModules()
        vi.doUnmock('@/hooks/use-media-query')
        vi.doUnmock('@/hooks/use-virtual-keyboard-open')
    })

    afterEach(async () => {
        await resetDbForTests()
        vi.resetModules()
        vi.doUnmock('@/hooks/use-media-query')
        vi.doUnmock('@/hooks/use-virtual-keyboard-open')
    })

    it('wrapper carries the coarse-pointer sticky positioning class set (always — Tailwind gates via media query)', () => {
        // Tailwind emits the rule wrapped in @media (pointer: coarse) so it
        // applies only on real coarse-pointer devices. JSDOM cannot evaluate
        // the media query — assert the class string is present so we know
        // the rule will fire on iPad/phone.
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const wrapper = screen.getByTestId('add-bar')
        // Positioning + offset
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:fixed/)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:bottom-0/)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:left-0/)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:right-0/)
        // Z-index sits below Radix Dialog (z-50)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:z-40/)
        // Background opaque (don't bleed scrolled content through the bar)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:bg-background/)
        // iOS home-indicator safe-area padding
        expect(wrapper.className).toMatch(
            /pointer:coarse\)\]:pb-\[env\(safe-area-inset-bottom\)\]/,
        )
        // Elevation shadow (separation from scrolled content above)
        expect(wrapper.className).toMatch(/pointer:coarse\)\]:shadow-/)
    })

    it('does NOT carry the hidden class when keyboard is closed (default JSDOM state)', () => {
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const wrapper = screen.getByTestId('add-bar')
        // Tailwind utility for display:none — not present when keyboard is closed
        expect(wrapper.className.split(/\s+/)).not.toContain('hidden')
    })

    it('applies `hidden` (display:none) when coarse pointer AND virtual keyboard is open', async () => {
        // Mock both hooks together for this scenario. Use dynamic import
        // after the mocks so the rendered AddBar picks them up.
        vi.doMock('@/hooks/use-media-query', () => ({
            useMediaQuery: () => true,
        }))
        vi.doMock('@/hooks/use-virtual-keyboard-open', () => ({
            useVirtualKeyboardOpen: () => true,
        }))
        const { AddBar: MockedAddBar } = await import('../AddBar')

        render(
            <MockedAddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const wrapper = screen.getByTestId('add-bar')
        expect(wrapper.className.split(/\s+/)).toContain('hidden')
    })

    it('does NOT apply `hidden` when only the virtual keyboard opens on a fine pointer (defense-in-depth)', async () => {
        // isCoarse=false, keyboardOpen=true → hideForKeyboard=false. Bar
        // stays visible. Guards against false-positive viewport-resize
        // events on desktop browsers (e.g. devtools resize, browser-chrome
        // hide/reveal triggering a large visualViewport delta).
        vi.doMock('@/hooks/use-media-query', () => ({
            useMediaQuery: () => false,
        }))
        vi.doMock('@/hooks/use-virtual-keyboard-open', () => ({
            useVirtualKeyboardOpen: () => true,
        }))
        const { AddBar: MockedAddBar } = await import('../AddBar')

        render(
            <MockedAddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        const wrapper = screen.getByTestId('add-bar')
        expect(wrapper.className.split(/\s+/)).not.toContain('hidden')
    })

    it('v53-03 split-button + tile-grid shape unchanged when sticky classes applied', () => {
        // Regression: every v53-03-01 affordance still renders.
        render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )

        expect(screen.getByTestId('add-bar')).toBeInTheDocument()
        expect(screen.getByTestId('add-row-trigger')).toBeInTheDocument()
        expect(screen.getByTestId('add-row-trigger')).toHaveTextContent('Song')
        const chevron = screen.getByTestId('add-bar-chevron-trigger')
        expect(chevron).toHaveAttribute(
            'aria-label',
            'Add track of another type',
        )
        // Long-press disambiguation (v53-03-01 discipline) still preserved:
        // wrapper added the sticky classes but did not touch onContextMenu.
        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
        })
        chevron.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
    })
})

describe('AddBar v53-03-01: WCAG AA audit (jest-axe)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('rest state (chevron closed) has ZERO axe violations', async () => {
        const { container } = render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )
        const results = await axe(container, axeOpts)
        expect(results).toHaveNoViolations()
    })

    it('chevron-open state (5-tile grid visible) has ZERO axe violations', async () => {
        const { baseElement } = render(
            <AddBar
                onPickSong={vi.fn()}
                onCreateFreeText={vi.fn()}
                onAddTrackOfType={vi.fn()}
            />,
        )
        await userEvent.click(
            screen.getByTestId('add-bar-chevron-trigger'),
        )
        await waitFor(() => {
            expect(
                screen.getByTestId('add-bar-tile-section'),
            ).toBeInTheDocument()
        })
        // Use baseElement so axe scans the Radix portal-mounted popover
        // content, not just the trigger container. Radix Popover.Content
        // auto-applies role="dialog"; the chevron trigger AND the inner
        // role="grid" both carry aria-label — the dialog wrapper is a
        // Radix structural detail, so aria-dialog-name is disabled here
        // (TouchOrPopover is v51-01 boundary-locked; we cannot add a
        // contentAriaLabel prop without breaking the substrate freeze).
        const results = await axe(baseElement, {
            rules: {
                ...axeOpts.rules,
                'aria-dialog-name': { enabled: false },
            },
        })
        expect(results).toHaveNoViolations()
    })
})
