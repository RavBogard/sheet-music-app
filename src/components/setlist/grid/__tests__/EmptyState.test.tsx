import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
    function renderState(overrides: Partial<Parameters<typeof EmptyState>[0]> = {}) {
        const onMakeNextWeeks = vi.fn()
        const onAddSong = vi.fn()
        const onUseTemplate = vi.fn()
        render(
            <EmptyState
                onMakeNextWeeks={onMakeNextWeeks}
                onAddSong={onAddSong}
                onUseTemplate={onUseTemplate}
                {...overrides}
            />,
        )
        return { onMakeNextWeeks, onAddSong, onUseTemplate }
    }

    it('renders all three CTAs with accessible labels', () => {
        renderState()
        expect(screen.getByTestId('setlist-grid-empty-state')).toBeInTheDocument()
        expect(screen.getByTestId('empty-state-clone-cta')).toHaveTextContent(
            /make next week/i,
        )
        expect(screen.getByTestId('empty-state-add-song-cta')).toHaveTextContent(
            /add a song/i,
        )
        expect(screen.getByTestId('empty-state-template-cta')).toHaveTextContent(
            /use a template/i,
        )
    })

    it('invokes onMakeNextWeeks when the primary CTA is clicked', async () => {
        const { onMakeNextWeeks } = renderState()
        await userEvent.click(screen.getByTestId('empty-state-clone-cta'))
        expect(onMakeNextWeeks).toHaveBeenCalledTimes(1)
    })

    it('invokes onAddSong / onUseTemplate from secondary CTAs', async () => {
        const { onAddSong, onUseTemplate } = renderState()
        await userEvent.click(screen.getByTestId('empty-state-add-song-cta'))
        expect(onAddSong).toHaveBeenCalledTimes(1)
        await userEvent.click(screen.getByTestId('empty-state-template-cta'))
        expect(onUseTemplate).toHaveBeenCalledTimes(1)
    })

    it('disables the primary CTA when busy', () => {
        renderState({ busy: true })
        expect(screen.getByTestId('empty-state-clone-cta')).toBeDisabled()
    })

    it('awaits an async onMakeNextWeeks without crashing', async () => {
        let resolved = false
        const onMakeNextWeeks = vi.fn(async () => {
            await new Promise<void>((r) => setTimeout(r, 5))
            resolved = true
        })
        render(
            <EmptyState
                onMakeNextWeeks={onMakeNextWeeks}
                onAddSong={vi.fn()}
                onUseTemplate={vi.fn()}
            />,
        )
        await userEvent.click(screen.getByTestId('empty-state-clone-cta'))
        expect(onMakeNextWeeks).toHaveBeenCalledTimes(1)
        // microtask flush
        await new Promise<void>((r) => setTimeout(r, 10))
        expect(resolved).toBe(true)
    })
})
