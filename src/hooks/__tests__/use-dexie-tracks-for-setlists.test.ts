import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup, waitFor } from '@testing-library/react'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import { useDexieTracksForSetlists } from '@/hooks/use-dexie-tracks-for-setlists'
import type { LocalTrack } from '@/lib/local/types'

function makeLocalTrack(overrides: Partial<LocalTrack> = {}): LocalTrack {
    return {
        id: overrides.id ?? 't1',
        setlistId: overrides.setlistId ?? 's1',
        order: overrides.order ?? 0,
        title: overrides.title ?? 'Sample',
        key: overrides.key,
        updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
        ...overrides,
    }
}

describe('useDexieTracksForSetlists (v60-06-04: bulk Dexie subscription)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })

    afterEach(async () => {
        cleanup()
        await resetDbForTests()
    })

    it('returns empty Map for empty setlistIds (no Dexie hit)', async () => {
        const { result } = renderHook(() => useDexieTracksForSetlists([]))

        await waitFor(() => {
            expect(result.current).toBeInstanceOf(Map)
        })
        expect(result.current?.size).toBe(0)
    })

    it('returns single-entry Map for one setlistId with rows sorted by order', async () => {
        // Seed out of order to exercise the sortBy
        await getDb().tracks.bulkPut([
            makeLocalTrack({ id: 't3', setlistId: 's1', order: 2, title: 'Adon Olam' }),
            makeLocalTrack({ id: 't1', setlistId: 's1', order: 0, title: 'Modeh Ani' }),
            makeLocalTrack({ id: 't2', setlistId: 's1', order: 1, title: 'Mah Tovu' }),
        ])

        const { result } = renderHook(() => useDexieTracksForSetlists(['s1']))

        await waitFor(() => {
            expect(result.current?.get('s1')).toHaveLength(3)
        })
        const tracks = result.current?.get('s1')
        expect(tracks?.map((t) => t.id)).toEqual(['t1', 't2', 't3'])
        expect(tracks?.map((t) => t.order)).toEqual([0, 1, 2])
    })

    it('returns multi-entry Map for multiple setlistIds, each sorted by order', async () => {
        await getDb().tracks.bulkPut([
            makeLocalTrack({ id: 's1-t2', setlistId: 's1', order: 1, title: 'B' }),
            makeLocalTrack({ id: 's1-t1', setlistId: 's1', order: 0, title: 'A' }),
            makeLocalTrack({ id: 's2-t1', setlistId: 's2', order: 0, title: 'C' }),
            makeLocalTrack({ id: 's2-t2', setlistId: 's2', order: 1, title: 'D' }),
        ])

        const { result } = renderHook(() => useDexieTracksForSetlists(['s1', 's2']))

        await waitFor(() => {
            expect(result.current?.size).toBe(2)
        })
        expect(result.current?.get('s1')?.map((t) => t.id)).toEqual(['s1-t1', 's1-t2'])
        expect(result.current?.get('s2')?.map((t) => t.id)).toEqual(['s2-t1', 's2-t2'])
    })

    it('excludes rows for unrelated setlistIds', async () => {
        await getDb().tracks.bulkPut([
            makeLocalTrack({ id: 's1-t1', setlistId: 's1', order: 0 }),
            makeLocalTrack({ id: 's2-t1', setlistId: 's2', order: 0 }),
        ])

        const { result } = renderHook(() => useDexieTracksForSetlists(['s1']))

        await waitFor(() => {
            expect(result.current?.get('s1')).toHaveLength(1)
        })
        expect(result.current?.size).toBe(1)
        expect(result.current?.has('s2')).toBe(false)
    })

    it('is order-insensitive in deps: re-renders with reordered ids share subscription', async () => {
        await getDb().tracks.bulkPut([
            makeLocalTrack({ id: 's1-t1', setlistId: 's1', order: 0 }),
            makeLocalTrack({ id: 's2-t1', setlistId: 's2', order: 0 }),
        ])

        const { result, rerender } = renderHook(
            ({ ids }: { ids: string[] }) => useDexieTracksForSetlists(ids),
            { initialProps: { ids: ['s1', 's2'] } },
        )

        await waitFor(() => {
            expect(result.current?.size).toBe(2)
        })

        // Re-render with reversed order — same set membership, no behavior change
        rerender({ ids: ['s2', 's1'] })

        await waitFor(() => {
            expect(result.current?.size).toBe(2)
        })
        expect(result.current?.get('s1')?.map((t) => t.id)).toEqual(['s1-t1'])
        expect(result.current?.get('s2')?.map((t) => t.id)).toEqual(['s2-t1'])
    })
})
