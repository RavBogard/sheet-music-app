import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the heavyweight action surfaces so this suite stays focused on the
// menu's view-switching contract (which sub-view shows after a chooser tap;
// "Back" returns to the menu; closing resets state).
vi.mock('@/components/performance/LiveDirectorActions', () => ({
    ChangeKeyAction: () => <div data-testid="action-change-key" />,
    SwapChartAction: () => <div data-testid="action-swap-chart" />,
    InsertSongAction: () => <div data-testid="action-insert-song" />,
}))

import { LiveDirectorMenu } from '@/components/performance/LiveDirectorMenu'
import type { SetlistTrack } from '@/types/models'

function track(): SetlistTrack {
    return {
        id: 'track-A',
        title: 'Hashkivenu',
        type: 'song',
        fileId: 'lib-a',
        key: 'C',
    } as SetlistTrack
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof LiveDirectorMenu>> = {}) {
    const onOpenChange = vi.fn()
    const props: React.ComponentProps<typeof LiveDirectorMenu> = {
        open: true,
        onOpenChange,
        track: track(),
        trackIndex: 2,
        setlistTracks: [track()],
        setlistId: 'sl-1',
        ...overrides,
    }
    return { ...render(<LiveDirectorMenu {...props} />), onOpenChange }
}

describe('<LiveDirectorMenu>', () => {
    it('renders the action chooser with three options', () => {
        renderMenu()
        expect(screen.getByRole('button', { name: /change key/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /swap chart/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /insert new song/i })).toBeInTheDocument()
    })

    it('navigates to change-key on its chooser tap', () => {
        renderMenu()
        fireEvent.click(screen.getByRole('button', { name: /change key/i }))
        expect(screen.getByTestId('action-change-key')).toBeInTheDocument()
    })

    it('navigates to swap-chart on its chooser tap', () => {
        renderMenu()
        fireEvent.click(screen.getByRole('button', { name: /swap chart/i }))
        expect(screen.getByTestId('action-swap-chart')).toBeInTheDocument()
    })

    it('navigates to insert-song on its chooser tap', () => {
        renderMenu()
        fireEvent.click(screen.getByRole('button', { name: /insert new song/i }))
        expect(screen.getByTestId('action-insert-song')).toBeInTheDocument()
    })

    it('Back returns to the chooser', () => {
        renderMenu()
        fireEvent.click(screen.getByRole('button', { name: /change key/i }))
        fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
        // The chooser tiles are back.
        expect(screen.getByRole('button', { name: /change key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('action-change-key')).not.toBeInTheDocument()
    })

    it('resets to the chooser when the sheet closes and reopens', () => {
        const { rerender } = render(
            <LiveDirectorMenu
                open
                onOpenChange={vi.fn()}
                track={track()}
                trackIndex={0}
                setlistTracks={[track()]}
                setlistId="sl-1"
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: /swap chart/i }))
        expect(screen.getByTestId('action-swap-chart')).toBeInTheDocument()

        // Close: should reset.
        rerender(
            <LiveDirectorMenu
                open={false}
                onOpenChange={vi.fn()}
                track={track()}
                trackIndex={0}
                setlistTracks={[track()]}
                setlistId="sl-1"
            />,
        )
        // Reopen.
        rerender(
            <LiveDirectorMenu
                open
                onOpenChange={vi.fn()}
                track={track()}
                trackIndex={0}
                setlistTracks={[track()]}
                setlistId="sl-1"
            />,
        )
        // Chooser visible again.
        expect(screen.getByRole('button', { name: /change key/i })).toBeInTheDocument()
        expect(screen.queryByTestId('action-swap-chart')).not.toBeInTheDocument()
    })

    it('shows the track title + key in the header on the chooser view', () => {
        renderMenu()
        // Header carries the title twice (SheetTitle + subline); just verify
        // at least one match and that the subline carries the key chip.
        expect(screen.getAllByText(/Hashkivenu/).length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText(/· C$/)).toBeInTheDocument()
    })
})
