import '@testing-library/jest-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'

import type { ReactNode } from 'react'

import { MobileRowCard } from '../MobileRowCard'
import type { LocalTrack } from '@/lib/local/types'

// Keep MobileRowCard a unit test — RecordingBindPopover's behavior is covered
// in its own test file; here it is a pass-through so the real recordings-client
// (and its Firestore subscription) is never reached.
vi.mock('../RecordingBindPopover', () => ({
    RecordingBindPopover: ({ children }: { children: ReactNode }) => (
        <>{children}</>
    ),
}))

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
    onTap = () => {},
}: {
    track: LocalTrack
    isEditing?: boolean
    onCommit?: (patch: Partial<LocalTrack>) => void
    onTap?: () => void
}) {
    return (
        <DndContext>
            <SortableContext items={[track.id]}>
                <ul>
                    <MobileRowCard
                        track={track}
                        isEditing={isEditing}
                        onTap={onTap}
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

        const leadInput = screen.getByLabelText('Vocal Lead') as HTMLInputElement
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

describe('MobileRowCard — v70-03-01 chart click-through', () => {
    it('renders the chart indicator as a new-tab link when a chart is bound', () => {
        render(<Harness track={makeTrack({ songId: 'song-abc' })} />)

        const link = screen.getByRole('link', {
            name: 'Open chart in new tab',
        }) as HTMLAnchorElement

        expect(link).toHaveAttribute('href', '/api/drive/file/song-abc')
        expect(link).toHaveAttribute('target', '_blank')
        expect(link.getAttribute('rel')).toContain('noopener')
    })

    it('routes a db- prefixed chart id through the library file serving route', () => {
        render(
            <Harness
                track={makeTrack({ songId: 'song-abc', fileId: 'db-xyz' })}
            />,
        )

        expect(
            screen.getByRole('link', { name: 'Open chart in new tab' }),
        ).toHaveAttribute('href', '/api/library/file/db-xyz')
    })

    it('renders a plain, non-interactive indicator when no chart is bound', () => {
        render(<Harness track={makeTrack({ songId: undefined })} />)

        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.getByLabelText('No chart bound')).toBeInTheDocument()
    })

    it('clicking the chart link does NOT toggle the card edit pane (stopPropagation)', () => {
        const onTap = vi.fn()
        render(
            <Harness track={makeTrack({ songId: 'song-abc' })} onTap={onTap} />,
        )

        fireEvent.click(
            screen.getByRole('link', { name: 'Open chart in new tab' }),
        )

        expect(onTap).not.toHaveBeenCalled()
    })
})

describe('MobileRowCard — v70-03-02 recording affordance', () => {
    it('renders the recording affordance enabled when a song is bound', () => {
        render(<Harness track={makeTrack({ songId: 'song-abc' })} />)

        const cell = screen.getByTestId('recording-cell')
        expect(cell).toBeInTheDocument()
        expect(cell).not.toBeDisabled()
    })

    it('renders the recording affordance disabled when no song is bound', () => {
        render(<Harness track={makeTrack({ songId: undefined })} />)

        expect(screen.getByTestId('recording-cell')).toBeDisabled()
    })

    it('clicking the recording affordance does NOT toggle the card edit pane (stopPropagation)', () => {
        const onTap = vi.fn()
        render(
            <Harness track={makeTrack({ songId: 'song-abc' })} onTap={onTap} />,
        )

        fireEvent.click(screen.getByTestId('recording-cell'))

        expect(onTap).not.toHaveBeenCalled()
    })
})

// cowork #6 (option b): a bonded prayer/reading row in the editor must read as a
// full chart-bearing row (foreground title + working open-chart affordance), not
// the passive "sub-attached doc" dimmed-italic label. Mirrors the already-shipped
// Perform SetlistRow affordance. Invariants: header/section never; song unchanged;
// bonded non-song = full title + chart link; UNbonded non-song stays passive.
describe('MobileRowCard — bonded non-song chart affordance (cowork #6b)', () => {
    it('a bonded prayer row renders a full-prominence (non-dimmed, non-italic) title', () => {
        render(
            <Harness
                track={makeTrack({ type: 'prayer', songId: 'song-x', title: 'Maariv Arevim' })}
            />,
        )
        const title = screen.getByText('Maariv Arevim')
        expect(title.className).toContain('text-foreground')
        expect(title.className).not.toContain('italic')
        expect(title.className).not.toContain('text-muted-foreground/80')
    })

    it('a bonded prayer row shows the open-chart affordance (usable bond)', () => {
        render(
            <Harness
                track={makeTrack({ type: 'prayer', songId: 'song-x', title: 'Maariv Arevim' })}
            />,
        )
        expect(
            screen.getByRole('link', { name: 'Open chart in new tab' }),
        ).toBeInTheDocument()
    })

    it('an UNBONDED prayer row stays a passive dimmed-italic label', () => {
        render(
            <Harness
                track={makeTrack({ type: 'prayer', songId: undefined, title: 'Silent Meditation' })}
            />,
        )
        const title = screen.getByText('Silent Meditation')
        expect(title.className).toContain('italic')
        expect(title.className).toContain('text-muted-foreground/80')
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.getByLabelText('No chart bound')).toBeInTheDocument()
    })

    it('a reading row with a bonded chart also reads as full + openable', () => {
        render(
            <Harness
                track={makeTrack({ type: 'reading', songId: 'song-y', title: 'Torah Reading' })}
            />,
        )
        expect(screen.getByText('Torah Reading').className).toContain('text-foreground')
        expect(
            screen.getByRole('link', { name: 'Open chart in new tab' }),
        ).toBeInTheDocument()
    })

    it('a bonded SONG row is unchanged (text-lg font-semibold foreground)', () => {
        render(
            <Harness
                track={makeTrack({ type: 'song', songId: 'song-z', title: 'Amazing Grace' })}
            />,
        )
        const title = screen.getByText('Amazing Grace')
        expect(title.className).toContain('text-lg')
        expect(title.className).toContain('font-semibold')
        expect(title.className).toContain('text-foreground')
    })

    it('a section/header row never shows a chart affordance, even with a stray songId', () => {
        render(
            <Harness
                track={makeTrack({ type: 'section', songId: 'stray-song', title: 'Evening Service' })}
            />,
        )
        // Section keeps its uppercase divider styling and gets NO open-chart link.
        expect(screen.getByText('Evening Service').className).toContain('uppercase')
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
        expect(screen.getByLabelText('No chart bound')).toBeInTheDocument()
    })
})
