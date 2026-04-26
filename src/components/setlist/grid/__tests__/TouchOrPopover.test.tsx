import '@testing-library/jest-dom'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom doesn't ship ResizeObserver or scrollIntoView (cmdk uses these
// when wrapped). Stub before any component renders.
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

function Harness({ open = false }: { open?: boolean }) {
    return (
        <TouchOrPopover
            open={open}
            onOpenChange={() => {}}
            sheetTitle="Pick something"
            contentTestId="dropdown-content"
            trigger={<button data-testid="trigger">Open</button>}
        >
            <div data-testid="inner-content">inner content</div>
        </TouchOrPopover>
    )
}

describe('TouchOrPopover', () => {
    it('renders Popover content on (pointer: fine) when open', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open />)

        // Popover.Content renders portaled — use the testId we passed in.
        const content = await screen.findByTestId('dropdown-content')
        expect(content).toBeInTheDocument()
        // Sheet variant has its own dialog role + a SheetTitle "Pick
        // something". Verify the Popover variant does NOT show that
        // role-dialog wrapper structure (sheet uses h2 in SheetTitle).
        expect(screen.queryByRole('heading', { name: 'Pick something' })).toBeNull()
    })

    it('renders Sheet content on (pointer: coarse) when open', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness open />)

        // Sheet (Radix Dialog) renders with role="dialog".
        const dialog = await screen.findByRole('dialog')
        expect(dialog).toBeInTheDocument()
        // SheetTitle renders the sr-only-or-visible heading; with no
        // srOnlyTitle prop, it's visible.
        expect(
            screen.getByRole('heading', { name: 'Pick something' }),
        ).toBeInTheDocument()
        // Inner cmdk-style content still passes through.
        expect(screen.getByTestId('inner-content')).toBeInTheDocument()
    })

    it('does not render content when open=false (Popover variant)', () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness open={false} />)

        expect(screen.queryByTestId('dropdown-content')).toBeNull()
        expect(screen.queryByTestId('inner-content')).toBeNull()
        // Trigger always rendered.
        expect(screen.getByTestId('trigger')).toBeInTheDocument()
    })

    it('does not render content when open=false (Sheet variant)', () => {
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness open={false} />)

        expect(screen.queryByRole('dialog')).toBeNull()
        expect(screen.queryByTestId('inner-content')).toBeNull()
        expect(screen.getByTestId('trigger')).toBeInTheDocument()
    })

    it('calls onOpenChange when trigger is clicked (Popover variant)', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const onOpenChange = vi.fn()
        render(
            <TouchOrPopover
                open={false}
                onOpenChange={onOpenChange}
                sheetTitle="Pick"
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

    it('renders sr-only title when srOnlyTitle=true (Sheet variant)', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        render(
            <TouchOrPopover
                open={true}
                onOpenChange={() => {}}
                sheetTitle="Hidden but accessible"
                srOnlyTitle
                trigger={<button data-testid="trigger">Open</button>}
            >
                <div>content</div>
            </TouchOrPopover>,
        )

        const heading = await screen.findByRole('heading', {
            name: 'Hidden but accessible',
        })
        // Title is in the DOM (accessible to screen readers) but
        // visually-hidden via sr-only.
        expect(heading).toBeInTheDocument()
        expect(heading).toHaveClass('sr-only')
    })
})
