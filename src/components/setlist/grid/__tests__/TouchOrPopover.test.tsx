import '@testing-library/jest-dom'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom doesn't ship ResizeObserver or scrollIntoView. Stub before
// any component renders.
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

vi.mock('@/hooks/use-media-query', () => ({
    useMediaQuery: vi.fn(),
}))

import { useMediaQuery } from '@/hooks/use-media-query'

import { TouchOrPopover } from '../TouchOrPopover'

const mockedUseMediaQuery = vi.mocked(useMediaQuery)

afterEach(() => {
    cleanup()
    mockedUseMediaQuery.mockReset()
})

function Harness({
    open = false,
    suppressAutoFocus,
}: {
    open?: boolean
    suppressAutoFocus?: boolean
}) {
    return (
        <TouchOrPopover
            open={open}
            onOpenChange={() => {}}
            contentTestId="dropdown-content"
            suppressAutoFocus={suppressAutoFocus}
            trigger={<button data-testid="trigger">Open</button>}
        >
            <div data-testid="inner-content">
                {/* No autoFocus attribute — focus lands here only if
                    Radix Popover's open-autofocus puts it there. */}
                <input data-testid="inner-input" placeholder="Search…" />
            </div>
        </TouchOrPopover>
    )
}

describe('TouchOrPopover (v51-01-01: always-anchored Popover)', () => {
    it('renders Popover content on (pointer: fine) when open', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open />)

        const content = await screen.findByTestId('dropdown-content')
        expect(content).toBeInTheDocument()
    })

    it('renders Popover content on (pointer: coarse) when open — NO bottom Sheet', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness open />)

        // Same Popover content surface on touch — no Sheet branch.
        // Radix Popover Content has data-state="open" + a popover-
        // specific data attribute; pre-rewrite Sheet would have
        // rendered with side="bottom" + sr-only SheetTitle heading.
        const content = await screen.findByTestId('dropdown-content')
        expect(content).toBeInTheDocument()
        // Pre-rewrite Sheet variant rendered a SheetTitle heading
        // ("Pick something" was the prior fixture). New Popover
        // surface has no such heading — assert there is no heading
        // descendant inside the content surface.
        expect(content.querySelector('h1, h2, h3')).toBeNull()
    })

    it('does not render content when open=false', () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open={false} />)

        expect(screen.queryByTestId('dropdown-content')).toBeNull()
        expect(screen.queryByTestId('inner-content')).toBeNull()
        expect(screen.getByTestId('trigger')).toBeInTheDocument()
    })

    it('calls onOpenChange when trigger is clicked', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const onOpenChange = vi.fn()
        render(
            <TouchOrPopover
                open={false}
                onOpenChange={onOpenChange}
                trigger={<button data-testid="trigger">Open</button>}
            >
                <div>content</div>
            </TouchOrPopover>,
        )

        fireEvent.click(screen.getByTestId('trigger'))
        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(true)
        })
    })

    it('v52-02-01 default (no suppressAutoFocus prop) on (pointer: coarse): input IS focused so iPad keyboard pops on open', async () => {
        // v52-02-01: opt-in suppression. Default false means searchable
        // pickers (Lead/ChartBind/Bulk-Lead) inherit Radix's default
        // open-autofocus on coarse pointer → cmdk CommandInput focuses
        // → iPad system keyboard pops → user can immediately type to
        // filter. This is the v52-02 fix for Issue 3.
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness open />)

        const input = await screen.findByTestId('inner-input')
        await waitFor(() => {
            expect(document.activeElement).toBe(input)
        })
    })

    it('v52-02-01 opt-in (suppressAutoFocus={true}) on (pointer: coarse): input is NOT focused so iPad keyboard stays hidden', async () => {
        // v52-02-01: discrete pickers (Key/Type/AddRow/Bulk-Key/
        // Bulk-Type) opt in via suppressAutoFocus={true}. There's no
        // input inside the popover to type into, so suppressing auto-
        // focus keeps the iPad keyboard from popping spuriously on
        // open. This preserves the v51-01-01 design intent for
        // discrete pickers.
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness open suppressAutoFocus />)

        await screen.findByTestId('inner-input')
        // Wait for Radix's open-autofocus to fire (and our
        // preventDefault to suppress it).
        await new Promise((r) => setTimeout(r, 50))

        const input = screen.getByTestId('inner-input')
        expect(document.activeElement).not.toBe(input)
    })

    it('v52-02-01 opt-in (suppressAutoFocus={true}) on (pointer: fine) DESKTOP: input IS focused — isCoarse gate scopes suppression to touch only', async () => {
        // The isCoarse gate ensures suppression only applies on touch.
        // Desktop users always get default Radix focus behavior, even
        // when a discrete-mode caller opts in.
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open suppressAutoFocus />)

        const input = await screen.findByTestId('inner-input')
        await waitFor(() => {
            expect(document.activeElement).toBe(input)
        })
    })

    it('on (pointer: fine), Radix open-autofocus lands on the first focusable (the input)', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open />)

        const input = await screen.findByTestId('inner-input')
        // Desktop: Radix Popover's default open-autofocus puts focus
        // on the first focusable inside the content (our input).
        await waitFor(() => {
            expect(document.activeElement).toBe(input)
        })
    })
})
