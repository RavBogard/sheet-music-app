import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetQuiet, quietFor } from '@/lib/performance/quiet'
import { useLiveFlags } from '@/lib/setlist-ops-client/freshness'
import { _resetServerCacheMemory, markOwnRows } from '@/lib/setlist-ops-client/server-cache'

import {
    CHANGED_HIGHLIGHT_ARM_DELAY_MS,
    changedRowIds,
    contentSignature,
    useChangedRowHighlight,
} from '../use-changed-row-highlight'

const sig = (r: Record<string, unknown>) => contentSignature(r as never)
const prev = new Map([['a', sig({ title: 'A', key: 'G' })], ['b', sig({ title: 'B' })]])

describe('changedRowIds', () => {
    it('flags a row whose visible content changed', () => {
        expect(changedRowIds(prev, [{ id: 'a', title: 'A', key: 'Am' }, { id: 'b', title: 'B' }], () => false)).toEqual(['a'])
    })
    it('does not flag a version bump, a move, a new row or an unchanged row', () => {
        expect(
            changedRowIds(
                prev,
                [{ id: 'b', title: 'B', version: 9, order: 4, updatedAt: 99 }, { id: 'a', title: 'A', key: 'G' }, { id: 'c', title: 'new' }],
                () => false,
            ),
        ).toEqual([])
    })
    it("does not flag rows this device itself queued (marked at enqueue, before any answer)", () => {
        _resetServerCacheMemory()
        markOwnRows(['a'])
        expect(changedRowIds(prev, [{ id: 'a', title: 'A', key: 'Am' }])).toEqual([])
    })
})

describe('arming', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-06T12:00:00Z'))
        _resetQuiet()
        _resetServerCacheMemory()
        useLiveFlags.setState({ rows: {}, setlist: {} })
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    const rowsV = (title: string) => [{ id: 'a', title }, { id: 'b', title: 'B' }]

    it('stays off until the first LIVE snapshot has been applied (SSR seed and cache changes never flash)', () => {
        const { result, rerender } = renderHook(({ rows }) => useChangedRowHighlight('s1', rows, true), {
            initialProps: { rows: rowsV('A') },
        })
        act(() => vi.advanceTimersByTime(5000))
        rerender({ rows: rowsV('A changed by a seed') })
        expect(result.current.size).toBe(0)
    })

    it('after the live snapshot it flashes a real remote change for about 2 s, leaders only', () => {
        const { result, rerender } = renderHook(({ rows, on }) => useChangedRowHighlight('s1', rows, on), {
            initialProps: { rows: rowsV('A'), on: true },
        })
        act(() => useLiveFlags.getState().mark('rows', 's1'))
        act(() => vi.advanceTimersByTime(CHANGED_HIGHLIGHT_ARM_DELAY_MS + 100))
        rerender({ rows: rowsV('A2'), on: true })
        expect([...result.current]).toEqual(['a'])
        act(() => vi.advanceTimersByTime(2100))
        expect(result.current.size).toBe(0)

        const musician = renderHook(({ rows }) => useChangedRowHighlight('s1', rows, false), { initialProps: { rows: rowsV('A') } })
        musician.rerender({ rows: rowsV('A3') })
        expect(musician.result.current.size).toBe(0)
    })

    it('a heal refetch (quiet window) never flashes', () => {
        const { result, rerender } = renderHook(({ rows }) => useChangedRowHighlight('s1', rows, true), {
            initialProps: { rows: rowsV('A') },
        })
        act(() => useLiveFlags.getState().mark('rows', 's1'))
        act(() => vi.advanceTimersByTime(CHANGED_HIGHLIGHT_ARM_DELAY_MS + 100))
        quietFor('s1')
        rerender({ rows: rowsV('healed') })
        expect(result.current.size).toBe(0)
    })
})
