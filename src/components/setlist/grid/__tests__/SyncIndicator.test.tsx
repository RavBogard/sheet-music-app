import '@testing-library/jest-dom'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSyncStatus } from '@/lib/sync/store'
import type { SyncState } from '@/lib/sync/state-machine'

import { SyncIndicator } from '../SyncIndicator'

function setSyncState(
    state: SyncState,
    queued = 0,
    extras: { lastError?: string; lastSyncAt?: number } = {},
): void {
    useSyncStatus.setState({
        state,
        queued,
        lastError: extras.lastError,
        lastSyncAt: extras.lastSyncAt,
    })
}

describe('SyncIndicator', () => {
    beforeEach(() => {
        useSyncStatus.setState({
            state: 'idle',
            queued: 0,
            lastError: undefined,
            lastSyncAt: undefined,
        })
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders the Saved label in idle state', async () => {
        setSyncState('idle')
        render(<SyncIndicator />)
        expect(screen.getByTestId('sync-indicator')).toHaveAttribute(
            'data-state',
            'idle',
        )
        expect(screen.getByTestId('sync-indicator')).toHaveTextContent('Saved')
        await act(async () => {
            vi.advanceTimersByTime(100)
        })
        expect(screen.getByTestId('sync-indicator-announce')).toHaveTextContent(
            'Saved',
        )
    })

    it('renders Editing… in dirty state', async () => {
        setSyncState('dirty')
        render(<SyncIndicator />)
        expect(screen.getByTestId('sync-indicator')).toHaveTextContent(
            'Editing…',
        )
        await act(async () => {
            vi.advanceTimersByTime(100)
        })
        expect(screen.getByTestId('sync-indicator-announce')).toHaveTextContent(
            'Editing',
        )
    })

    it('renders Saving… with a spinner in saving state', async () => {
        setSyncState('saving')
        render(<SyncIndicator />)
        const indicator = screen.getByTestId('sync-indicator')
        expect(indicator).toHaveTextContent('Saving…')
        // Spinner is the Loader2 svg with animate-spin (motion-reduce friendly).
        expect(indicator.querySelector('svg.animate-spin')).not.toBeNull()
    })

    it('renders Conflict — review with a clickable action button', async () => {
        setSyncState('conflict')
        const onResolve = vi.fn()
        render(<SyncIndicator onResolveConflict={onResolve} />)
        const btn = screen.getByTestId('sync-indicator')
        expect(btn.tagName).toBe('BUTTON')
        expect(btn).toHaveTextContent('Conflict — review')
        await userEvent.click(btn)
        expect(onResolve).toHaveBeenCalledTimes(1)
    })

    it('renders Failed — retry with a clickable action button', async () => {
        setSyncState('failed', 0, { lastError: 'auth refresh failed' })
        const onRetry = vi.fn()
        render(<SyncIndicator onRetryFailed={onRetry} />)
        const btn = screen.getByTestId('sync-indicator')
        expect(btn.tagName).toBe('BUTTON')
        expect(btn).toHaveTextContent('Failed — retry')
        expect(btn).toHaveAttribute('title', expect.stringContaining('auth refresh failed'))
        await userEvent.click(btn)
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders Offline — N queued with the queued count', async () => {
        setSyncState('offline', 3)
        render(<SyncIndicator />)
        const indicator = screen.getByTestId('sync-indicator')
        expect(indicator).toHaveTextContent('Offline — 3 queued')
        await act(async () => {
            vi.advanceTimersByTime(100)
        })
        expect(screen.getByTestId('sync-indicator-announce')).toHaveTextContent(
            'Offline, 3 changes queued',
        )
    })

    it('announces a different message via aria-live when state changes', async () => {
        setSyncState('idle')
        const { rerender } = render(<SyncIndicator />)
        await act(async () => {
            vi.advanceTimersByTime(100)
        })
        expect(screen.getByTestId('sync-indicator-announce')).toHaveTextContent(
            'Saved',
        )

        setSyncState('saving')
        rerender(<SyncIndicator />)
        await act(async () => {
            vi.advanceTimersByTime(100)
        })
        expect(screen.getByTestId('sync-indicator-announce')).toHaveTextContent(
            'Saving',
        )
    })
})
