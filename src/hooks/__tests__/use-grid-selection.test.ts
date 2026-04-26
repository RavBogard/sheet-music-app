import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import {
    computeRangeSelection,
    useGridSelection,
} from '@/hooks/use-grid-selection'

describe('computeRangeSelection (pure)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']

    it('returns inclusive forward range when anchor precedes current', () => {
        const result = computeRangeSelection(ids, 'b', 'd')
        expect([...result]).toEqual(['b', 'c', 'd'])
    })

    it('returns inclusive reverse range when anchor follows current', () => {
        const result = computeRangeSelection(ids, 'd', 'b')
        expect([...result]).toEqual(['b', 'c', 'd'])
    })

    it('returns single-id set when anchor equals current', () => {
        const result = computeRangeSelection(ids, 'c', 'c')
        expect([...result]).toEqual(['c'])
    })

    it('returns single-id set when anchor is null', () => {
        const result = computeRangeSelection(ids, null, 'c')
        expect([...result]).toEqual(['c'])
    })

    it('degrades to single-id set when anchor not in allIds', () => {
        const result = computeRangeSelection(ids, 'zzz', 'c')
        expect([...result]).toEqual(['c'])
    })

    it('full-range selection from first to last', () => {
        const result = computeRangeSelection(ids, 'a', 'e')
        expect([...result]).toEqual(['a', 'b', 'c', 'd', 'e'])
    })
})

describe('useGridSelection', () => {
    it('starts with empty selection and null anchor', () => {
        const { result } = renderHook(() => useGridSelection())
        expect(result.current.selectedIds.size).toBe(0)
        expect(result.current.anchorId).toBeNull()
    })

    it('toggle adds id, second toggle removes, anchor follows toggle', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
        })
        expect(result.current.has('a')).toBe(true)
        expect(result.current.anchorId).toBe('a')

        act(() => {
            result.current.toggle('b')
        })
        expect(result.current.has('a')).toBe(true)
        expect(result.current.has('b')).toBe(true)
        expect(result.current.anchorId).toBe('b')

        act(() => {
            result.current.toggle('a')
        })
        expect(result.current.has('a')).toBe(false)
        expect(result.current.has('b')).toBe(true)
        expect(result.current.anchorId).toBe('a')
    })

    it('extendRange uses anchor to compute inclusive range', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
        })
        act(() => {
            result.current.extendRange('c', ['a', 'b', 'c', 'd'])
        })
        expect([...result.current.selectedIds].sort()).toEqual([
            'a',
            'b',
            'c',
        ])
    })

    it('extendRange replaces the existing selection (not additive)', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
            result.current.toggle('e')
        })
        // Anchor now 'e' (last toggle).
        act(() => {
            result.current.extendRange('c', ['a', 'b', 'c', 'd', 'e'])
        })
        // Range from 'e' to 'c' = {c, d, e}; previous selection wiped.
        expect([...result.current.selectedIds].sort()).toEqual([
            'c',
            'd',
            'e',
        ])
    })

    it('extendRange without anchor falls back to single-select + sets anchor', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.extendRange('c', ['a', 'b', 'c'])
        })
        expect([...result.current.selectedIds]).toEqual(['c'])
        expect(result.current.anchorId).toBe('c')
    })

    it('clear empties selection and nulls anchor', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
            result.current.toggle('b')
        })
        expect(result.current.selectedIds.size).toBe(2)

        act(() => {
            result.current.clear()
        })
        expect(result.current.selectedIds.size).toBe(0)
        expect(result.current.anchorId).toBeNull()
    })

    it('pruneTo drops stale ids while preserving survivors and anchor', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
            result.current.toggle('b')
            result.current.toggle('c')
        })
        expect(result.current.selectedIds.size).toBe(3)
        expect(result.current.anchorId).toBe('c')

        // 'b' was remote-deleted; survivors a + c should stay; anchor c is valid.
        act(() => {
            result.current.pruneTo(['a', 'c', 'd'])
        })
        expect([...result.current.selectedIds].sort()).toEqual(['a', 'c'])
        expect(result.current.anchorId).toBe('c')
    })

    it('pruneTo nulls anchor when anchor is no longer valid', () => {
        const { result } = renderHook(() => useGridSelection())
        act(() => {
            result.current.toggle('a')
            result.current.toggle('b')
        })
        expect(result.current.anchorId).toBe('b')

        // Anchor 'b' deleted.
        act(() => {
            result.current.pruneTo(['a'])
        })
        expect([...result.current.selectedIds]).toEqual(['a'])
        expect(result.current.anchorId).toBeNull()
    })
})
