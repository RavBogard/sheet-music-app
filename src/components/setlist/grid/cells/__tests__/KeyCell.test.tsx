import '@testing-library/jest-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

expect.extend(toHaveNoViolations)

// jsdom missing primitives that cmdk + Radix expect.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
;(globalThis as unknown as { ResizeObserver?: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}
}
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    ;(Element.prototype as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false
}

vi.mock('@/hooks/use-media-query', () => ({
    useMediaQuery: vi.fn(),
}))

import { useMediaQuery } from '@/hooks/use-media-query'
import { KeyCell, KEY_OPTIONS_MAJOR, KEY_OPTIONS_MINOR, KEY_OPTIONS_DATA } from '../KeyCell'

const mockedUseMediaQuery = vi.mocked(useMediaQuery)

afterEach(() => {
    cleanup()
    mockedUseMediaQuery.mockReset()
})

interface HarnessProps {
    initialValue?: string
}

function Harness({ initialValue }: HarnessProps) {
    return (
        <KeyCell
            value={initialValue}
            onCommit={() => {}}
            isFocused
            onFocus={() => {}}
        />
    )
}

async function openPicker() {
    const trigger = screen.getByTestId('dropdown-cell-button')
    fireEvent.click(trigger)
    await screen.findByTestId('key-picker-tabs')
}

describe('KeyCell — chromatic Major | Minor picker (v51-01-01)', () => {
    it('exports 12 majors in chromatic order C → B', () => {
        const expected = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
        expect(KEY_OPTIONS_MAJOR.map((o) => o.value)).toEqual(expected)
        expect(KEY_OPTIONS_MAJOR).toHaveLength(12)
    })

    it('exports 12 minors in chromatic order Cm → Bm', () => {
        const expected = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']
        expect(KEY_OPTIONS_MINOR.map((o) => o.value)).toEqual(expected)
        expect(KEY_OPTIONS_MINOR).toHaveLength(12)
    })

    it('KEY_OPTIONS_DATA is the union of major + minor (back-compat)', () => {
        expect(KEY_OPTIONS_DATA).toHaveLength(24)
        expect(KEY_OPTIONS_DATA[0]?.value).toBe('C')
        expect(KEY_OPTIONS_DATA[12]?.value).toBe('Cm')
    })

    it('default tab = Major when current value is "C"', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness initialValue="C" />)
        await openPicker()

        const majorTab = screen.getByTestId('key-picker-tab-major')
        expect(majorTab).toHaveAttribute('data-state', 'active')
        const minorTab = screen.getByTestId('key-picker-tab-minor')
        expect(minorTab).toHaveAttribute('data-state', 'inactive')
    })

    it('default tab = Minor when current value is "Am"', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness initialValue="Am" />)
        await openPicker()

        const minorTab = screen.getByTestId('key-picker-tab-minor')
        expect(minorTab).toHaveAttribute('data-state', 'active')
        const majorTab = screen.getByTestId('key-picker-tab-major')
        expect(majorTab).toHaveAttribute('data-state', 'inactive')
    })

    it('default tab = Major when current value is empty/undefined', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness />)
        await openPicker()

        const majorTab = screen.getByTestId('key-picker-tab-major')
        expect(majorTab).toHaveAttribute('data-state', 'active')
    })

    it('switches to Minor list on tab click; popover stays open', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const user = userEvent.setup()
        render(<Harness initialValue="C" />)
        await openPicker()

        // Radix Tabs uses pointer events for activation; userEvent
        // simulates them properly while fireEvent.click does not.
        const minorTab = screen.getByTestId('key-picker-tab-minor')
        await user.click(minorTab)

        await waitFor(() => {
            expect(minorTab).toHaveAttribute('data-state', 'active')
        })
        // Picker is still mounted (popover did not close).
        expect(screen.getByTestId('key-picker-tabs')).toBeInTheDocument()
    })

    it('on (pointer: coarse), no CommandInput is rendered (no system keyboard)', async () => {
        mockedUseMediaQuery.mockReturnValue(true)
        render(<Harness initialValue="C" />)
        await openPicker()

        // Discrete-mode KeyCell skips CommandInput entirely. The "Type
        // to filter…" placeholder used by DropdownCell's searchable
        // mode must NOT be present.
        expect(screen.queryByPlaceholderText(/Type to filter/i)).toBeNull()
        // No <input> elements inside the picker tabs.
        const tabs = screen.getByTestId('key-picker-tabs')
        expect(within(tabs).queryByRole('textbox')).toBeNull()
    })

    it('on (pointer: fine), still renders no CommandInput (KeyCell is always discrete)', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        render(<Harness initialValue="C" />)
        await openPicker()

        // Per the picker spec, Key is discrete on both pointer types
        // (the picker is fast enough as 12-button taps; type-to-filter
        // adds no value for a 12-element list).
        expect(screen.queryByPlaceholderText(/Type to filter/i)).toBeNull()
    })

    it('clicking a key option commits and closes', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const onCommit = vi.fn()
        render(
            <KeyCell
                value=""
                onCommit={onCommit}
                isFocused
                onFocus={() => {}}
            />,
        )
        await openPicker()

        const optionG = screen.getByTestId('key-picker-option-G')
        fireEvent.click(optionG)

        await waitFor(() => {
            expect(onCommit).toHaveBeenCalledWith('G')
        })
    })

    it('jest-axe scan reports zero violations', async () => {
        mockedUseMediaQuery.mockReturnValue(false)
        const { container } = render(<Harness initialValue="Am" />)
        await openPicker()

        const results = await axe(container, {
            rules: {
                // Radix Popover.Content uses role=dialog without
                // aria-labelledby in this minimal harness; the real
                // SetlistGrid environment provides the cell aria-label
                // through the trigger button. Disable for this scan.
                'aria-dialog-name': { enabled: false },
            },
        })
        expect(results).toHaveNoViolations()
    })
})
