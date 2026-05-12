import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import { TextCell } from '../TextCell'

const mockedUseMediaQuery = vi.mocked(useMediaQuery)

afterEach(() => {
    cleanup()
    mockedUseMediaQuery.mockReset()
})

function Harness({
    isFocused = false,
    onFocus = vi.fn(),
    onCommit = vi.fn(),
    value = 'Hello',
}: {
    isFocused?: boolean
    onFocus?: () => void
    onCommit?: (next: string) => void
    value?: string
}) {
    return (
        <TextCell
            value={value}
            onCommit={onCommit}
            isFocused={isFocused}
            onFocus={onFocus}
            ariaLabel="Test cell"
        />
    )
}

describe('TextCell — v52-02-02 single-tap-to-edit on coarse pointer', () => {
    it('on (pointer: coarse), tapping the button enters edit mode and renders the input', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        const onFocus = vi.fn()

        render(<Harness onFocus={onFocus} />)

        const button = screen.getByTestId('text-cell-button')
        fireEvent.click(button)

        // After tap on coarse pointer: button is replaced by the
        // editing input.
        await waitFor(() => {
            expect(screen.queryByTestId('text-cell-button')).toBeNull()
        })
        const input = screen.getByTestId('text-cell-input')
        expect(input).toBeInTheDocument()

        // Input has autoFocus → document.activeElement is the input
        // (so the iPad system keyboard pops in real browser).
        await waitFor(() => {
            expect(document.activeElement).toBe(input)
        })

        // Parent grid focus tracking still updates — onFocus called.
        expect(onFocus).toHaveBeenCalledTimes(1)
    })

    it('on (pointer: fine), clicking the button only focuses; does NOT enter edit mode', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const onFocus = vi.fn()

        render(<Harness onFocus={onFocus} />)

        const button = screen.getByTestId('text-cell-button')
        fireEvent.click(button)

        // Desktop: button is still rendered; no input swap.
        // Wait a tick to confirm no async state change brings up the input.
        await new Promise((r) => setTimeout(r, 25))
        expect(screen.getByTestId('text-cell-button')).toBeInTheDocument()
        expect(screen.queryByTestId('text-cell-input')).toBeNull()

        // onFocus still fired (cell focus tracking still updates).
        expect(onFocus).toHaveBeenCalledTimes(1)
    })

    it('on (pointer: fine), double-click still enters edit mode (desktop path preserved)', async () => {
        mockedUseMediaQuery.mockReturnValue(false)

        render(<Harness />)

        const button = screen.getByTestId('text-cell-button')
        fireEvent.doubleClick(button)

        // The existing onDoubleClick handler is unchanged → entering
        // edit mode still works on desktop.
        await waitFor(() => {
            expect(screen.queryByTestId('text-cell-button')).toBeNull()
        })
        expect(screen.getByTestId('text-cell-input')).toBeInTheDocument()
    })
})

describe('TextCell — v60-02 pagehide / visibilitychange commit', () => {
    it('pagehide while editing commits the in-flight draft once and exits edit mode', async () => {
        mockedUseMediaQuery.mockReturnValue(true) // coarse → single-tap to edit
        const onCommit = vi.fn()

        render(<Harness onCommit={onCommit} value="old" />)

        fireEvent.click(screen.getByTestId('text-cell-button'))
        const input = await screen.findByTestId('text-cell-input')
        fireEvent.change(input, { target: { value: 'new' } })

        fireEvent(window, new Event('pagehide'))

        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('new')

        // Editing state cleared → button is back in the DOM.
        await waitFor(() => {
            expect(screen.queryByTestId('text-cell-input')).toBeNull()
        })
        expect(screen.getByTestId('text-cell-button')).toBeInTheDocument()
    })

    it('visibilitychange→hidden while editing commits the draft', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        const onCommit = vi.fn()

        render(<Harness onCommit={onCommit} value="old" />)

        fireEvent.click(screen.getByTestId('text-cell-button'))
        const input = await screen.findByTestId('text-cell-input')
        fireEvent.change(input, { target: { value: 'new' } })

        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true,
        })
        fireEvent(document, new Event('visibilitychange'))

        expect(onCommit).toHaveBeenCalledTimes(1)
        expect(onCommit).toHaveBeenCalledWith('new')
    })

    it('pagehide while NOT editing does not call onCommit (listener gated on editing)', async () => {
        mockedUseMediaQuery.mockReturnValue(false) // desktop, button-resting
        const onCommit = vi.fn()

        render(<Harness onCommit={onCommit} value="old" />)

        // No edit-mode entry — fire pagehide directly.
        fireEvent(window, new Event('pagehide'))

        expect(onCommit).not.toHaveBeenCalled()
    })

    it('pagehide with unchanged draft does not call onCommit (commit() guard)', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        const onCommit = vi.fn()

        render(<Harness onCommit={onCommit} value="old" />)

        fireEvent.click(screen.getByTestId('text-cell-button'))
        await screen.findByTestId('text-cell-input')
        // No fireEvent.change — draft still equals value.

        fireEvent(window, new Event('pagehide'))

        expect(onCommit).not.toHaveBeenCalled()
    })
})
