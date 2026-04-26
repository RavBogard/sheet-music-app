import '@testing-library/jest-dom'
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react'
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

import type { LocalTrack } from '@/lib/local/types'

import { BatchActionBar } from '../BatchActionBar'

function makeTracks(specs: Array<Partial<LocalTrack>>): LocalTrack[] {
    return specs.map((s, i) => ({
        id: s.id ?? `t-${i}`,
        setlistId: 'set-a',
        order: s.order ?? i,
        ...s,
    })) as LocalTrack[]
}

describe('BatchActionBar', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('renders count text reflecting selectedTracks.length', () => {
        render(
            <BatchActionBar
                selectedTracks={makeTracks([
                    { id: 't-0', title: 'A' },
                    { id: 't-1', title: 'B' },
                    { id: 't-2', title: 'C' },
                ])}
                onClear={vi.fn()}
                onBulkSet={vi.fn()}
                onBulkDelete={vi.fn()}
            />,
        )
        expect(screen.getByTestId('batch-action-count')).toHaveTextContent(
            '3 rows selected',
        )
    })

    it('renders Type / Key / Lead trigger buttons + Delete + Clear', () => {
        render(
            <BatchActionBar
                selectedTracks={makeTracks([{ id: 't-0' }, { id: 't-1' }])}
                onClear={vi.fn()}
                onBulkSet={vi.fn()}
                onBulkDelete={vi.fn()}
            />,
        )
        expect(
            screen.getByTestId('batch-action-type-trigger'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('batch-action-key-trigger'),
        ).toBeInTheDocument()
        expect(
            screen.getByTestId('batch-action-lead-trigger'),
        ).toBeInTheDocument()
        expect(screen.getByTestId('batch-action-delete')).toBeInTheDocument()
        expect(screen.getByTestId('batch-action-clear')).toBeInTheDocument()
    })

    it('opens the Type popover and selecting "Reading" fires onBulkSet({type:"reading"})', async () => {
        const onBulkSet = vi.fn()
        render(
            <BatchActionBar
                selectedTracks={makeTracks([{ id: 't-0' }, { id: 't-1' }])}
                onClear={vi.fn()}
                onBulkSet={onBulkSet}
                onBulkDelete={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId('batch-action-type-trigger'))
        await screen.findByTestId('batch-action-type-popover')

        const readingItem = await screen.findByText('Reading')
        fireEvent.click(readingItem)

        await waitFor(() =>
            expect(onBulkSet).toHaveBeenCalledWith({ type: 'reading' }),
        )
    })

    it('opens the Key popover and selecting "Dm" fires onBulkSet({key:"Dm"})', async () => {
        const onBulkSet = vi.fn()
        render(
            <BatchActionBar
                selectedTracks={makeTracks([{ id: 't-0' }, { id: 't-1' }])}
                onClear={vi.fn()}
                onBulkSet={onBulkSet}
                onBulkDelete={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId('batch-action-key-trigger'))
        await screen.findByTestId('batch-action-key-popover')

        // The Key list renders many entries; first 'Dm' is the option label.
        const dmItem = await screen.findByText('Dm')
        fireEvent.click(dmItem)

        await waitFor(() =>
            expect(onBulkSet).toHaveBeenCalledWith({ key: 'Dm' }),
        )
    })

    it('Lead popover allows freeform name and commits onBulkSet({leadMusician:"<typed>"})', async () => {
        const onBulkSet = vi.fn()
        render(
            <BatchActionBar
                selectedTracks={makeTracks([
                    { id: 't-0', leadMusician: 'Daniel' },
                    { id: 't-1' },
                ])}
                onClear={vi.fn()}
                onBulkSet={onBulkSet}
                onBulkDelete={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId('batch-action-lead-trigger'))
        await screen.findByTestId('batch-action-lead-popover')

        // Existing 'Daniel' from selection should be present and clickable.
        const daniel = await screen.findByText('Daniel')
        fireEvent.click(daniel)

        await waitFor(() =>
            expect(onBulkSet).toHaveBeenCalledWith({ leadMusician: 'Daniel' }),
        )
    })

    it('Delete button fires onBulkDelete (toolbar trusts parent for confirmation)', () => {
        const onBulkDelete = vi.fn()
        render(
            <BatchActionBar
                selectedTracks={makeTracks([{ id: 't-0' }, { id: 't-1' }])}
                onClear={vi.fn()}
                onBulkSet={vi.fn()}
                onBulkDelete={onBulkDelete}
            />,
        )
        fireEvent.click(screen.getByTestId('batch-action-delete'))
        expect(onBulkDelete).toHaveBeenCalledTimes(1)
    })

    it('Clear button fires onClear', () => {
        const onClear = vi.fn()
        render(
            <BatchActionBar
                selectedTracks={makeTracks([{ id: 't-0' }, { id: 't-1' }])}
                onClear={onClear}
                onBulkSet={vi.fn()}
                onBulkDelete={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByTestId('batch-action-clear'))
        expect(onClear).toHaveBeenCalledTimes(1)
    })
})
