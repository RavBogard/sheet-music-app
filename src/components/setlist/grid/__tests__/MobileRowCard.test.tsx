import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'

import { MobileRowCard } from '../MobileRowCard'
import type { LocalTrack } from '@/lib/local/types'

// jsdom shims (parity with the other grid tests).
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

function makeTrack(overrides?: Partial<LocalTrack>): LocalTrack {
    return {
        id: 't-1',
        setlistId: 's-1',
        order: 0,
        title: 'Old Title',
        type: 'song',
        ...overrides,
    } as LocalTrack
}

function Harness({
    track,
    isEditing = false,
    onCommit = vi.fn(),
}: {
    track: LocalTrack
    isEditing?: boolean
    onCommit?: (patch: Partial<LocalTrack>) => void
}) {
    return (
        <DndContext>
            <SortableContext items={[track.id]}>
                <ul>
                    <MobileRowCard
                        track={track}
                        isEditing={isEditing}
                        onTap={() => {}}
                        onContextEditRow={() => {}}
                        onContextBindChart={() => {}}
                        onContextDuplicate={() => {}}
                        onContextDelete={() => {}}
                        onCommit={onCommit}
                    />
                </ul>
            </SortableContext>
        </DndContext>
    )
}

afterEach(() => {
    cleanup()
    // Reset visibilityState if a test mutated it.
    Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
    })
})

describe('MobileRowCard — v60-02 pagehide / visibilitychange draft flush', () => {
    it('pagehide flushes a dirty title draft while isEditing', () => {
        const onCommit = vi.fn()
        render(
            <Harness
                track={makeTrack({ title: 'Old' })}
                isEditing
                onCommit={onCommit}
            />,
        )

        const titleInput = screen.getByLabelText('Title') as HTMLInputElement
        fireEvent.change(titleInput, { target: { value: 'New' } })

        fireEvent(window, new Event('pagehide'))

        expect(onCommit).toHaveBeenCalledWith({ title: 'New' })
        expect(onCommit).toHaveBeenCalledTimes(1)
    })

    it('visibilitychange→hidden flushes a dirty lead draft while isEditing', () => {
        const onCommit = vi.fn()
        render(
            <Harness
                track={makeTrack({ leadMusician: 'Old Lead' })}
                isEditing
                onCommit={onCommit}
            />,
        )

        const leadInput = screen.getByLabelText('Lead') as HTMLInputElement
        fireEvent.change(leadInput, { target: { value: 'New Lead' } })

        Object.defineProperty(document, 'visibilityState', {
            value: 'hidden',
            configurable: true,
        })
        fireEvent(document, new Event('visibilitychange'))

        expect(onCommit).toHaveBeenCalledWith({ leadMusician: 'New Lead' })
    })

    it('pagehide does NOT fire onCommit when isEditing=false (gate works)', () => {
        const onCommit = vi.fn()
        render(<Harness track={makeTrack()} isEditing={false} onCommit={onCommit} />)

        fireEvent(window, new Event('pagehide'))

        expect(onCommit).not.toHaveBeenCalled()
    })

    it('pagehide with no draft changes does NOT fire onCommit (per-field guards)', () => {
        const onCommit = vi.fn()
        render(
            <Harness
                track={makeTrack({ title: 'Old', leadMusician: 'Lead', bpm: 120 })}
                isEditing
                onCommit={onCommit}
            />,
        )

        fireEvent(window, new Event('pagehide'))

        expect(onCommit).not.toHaveBeenCalled()
    })
})
