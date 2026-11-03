import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { SetlistIntent } from '@/lib/local/types'
import { computeFreshness } from '@/lib/setlist-ops-client/freshness'

import { SyncIndicator } from '../SyncIndicator'

/**
 * The save indicator reads ONE setlist's freshness (setlist sync PR 3):
 * current, saving(n), refused(list) or offline. Behaviour and test ids, not
 * copy (the wording test for these strings is setlist-grid.i18n).
 */

const intent = (localId: number, status: SetlistIntent['status'], extra: Partial<SetlistIntent> = {}): SetlistIntent => ({
    localId,
    setlistId: 's1',
    batchKey: `b${localId}`,
    attempt: 0,
    op: { kind: 'editRow', rowId: 'r1', set: { key: 'G' }, base: { key: 'F' } },
    status,
    createdAt: 1,
    ...extra,
})

const online = { online: true, offlineSince: null }

describe('SyncIndicator', () => {
    it('current when nothing is queued', () => {
        render(<SyncIndicator freshness={computeFreshness([], online)} />)
        expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'current')
        expect(screen.queryByTestId('sync-refused-list')).toBeNull()
    })

    it('saving while intents are pending or in flight', () => {
        render(<SyncIndicator freshness={computeFreshness([intent(1, 'pending'), intent(2, 'sending')], online)} />)
        expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'saving')
    })

    it('offline while the device is offline, with field edits still queued', () => {
        const f = computeFreshness([intent(1, 'pending')], { online: false, offlineSince: 1000 })
        expect(f.canEditStructure).toBe(false)
        render(<SyncIndicator freshness={f} />)
        expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'offline')
    })

    it('refused: lists each refused change with Try again and Discard; a gone row offers Discard only', async () => {
        const onRetry = vi.fn()
        const onDiscard = vi.fn()
        const f = computeFreshness(
            [
                intent(1, 'refused', { label: 'Lecha Dodi', refusal: { reason: 'field', field: 'key', server: 'A', mine: 'G' } }),
                intent(2, 'refused', { label: 'Oseh Shalom', refusal: { reason: 'row-gone' } }),
                intent(3, 'pending'),
            ],
            online,
        )
        render(<SyncIndicator freshness={f} onRetry={onRetry} onDiscard={onDiscard} />)
        expect(screen.getByTestId('sync-indicator')).toHaveAttribute('data-state', 'refused')
        expect(screen.getByTestId('sync-refused-1')).toHaveAttribute('data-reason', 'field')
        expect(screen.queryByTestId('sync-refused-retry-2')).toBeNull()

        await userEvent.click(screen.getByTestId('sync-refused-retry-1'))
        await userEvent.click(screen.getByTestId('sync-refused-discard-2'))
        expect(onRetry).toHaveBeenCalledWith(1)
        expect(onDiscard).toHaveBeenCalledWith(2)
    })
})
