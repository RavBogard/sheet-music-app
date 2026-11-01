import 'fake-indexeddb/auto'
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * Perf audit P2-5: the editor list re-rendered every row on each focus or
 * edit-state change. Rows are memoized now; toggling one row's edit state, or
 * a parent re-render with fresh callbacks, must not re-render the others.
 */

const renders: Record<string, number> = {}
const latest: Record<string, { onTap: () => void; onContextDuplicate: () => void }> = {}
vi.mock('../MobileRowCard', () => ({
    MobileRowCard: (props: { track: { id: string }; onTap: () => void; onContextDuplicate: () => void }) => {
        renders[props.track.id] = (renders[props.track.id] ?? 0) + 1
        latest[props.track.id] = props
        return <li data-testid={`row-${props.track.id}`} />
    },
}))

import { MobileCardList } from '../MobileCardList'
import type { LocalTrack } from '@/lib/local/types'

const tracks = ['a', 'b', 'c'].map(
    (id, i) => ({ id, setlistId: 's1', order: i, title: id, type: 'song' }) as unknown as LocalTrack,
)

function renderList(onContextDuplicate: (id: string) => void) {
    return (
        <MobileCardList
            setlistId="s1"
            tracks={tracks}
            onContextEditRow={() => {}}
            onContextBindChart={() => {}}
            onContextDuplicate={(id) => onContextDuplicate(id)}
            onContextDelete={() => {}}
            onCommitTrackPatch={async () => {}}
            onDeleteRow={() => {}}
        />
    )
}

describe('MobileCardList row memoization', () => {
    it('re-renders only the toggled row, and ignores fresh parent callbacks', () => {
        const dup = vi.fn()
        const { rerender } = render(renderList(dup))
        const base = { ...renders }

        act(() => latest.b.onTap())
        expect(renders.a).toBe(base.a)
        expect(renders.c).toBe(base.c)
        expect(renders.b).toBe(base.b + 1)

        // Parent re-render with new arrow props: no row re-renders...
        const dup2 = vi.fn()
        const before = { ...renders }
        rerender(renderList(dup2))
        expect(renders).toEqual(before)

        // ...and the stable callbacks still reach the newest handler.
        act(() => latest.c.onContextDuplicate())
        expect(dup2).toHaveBeenCalledWith('c')
        expect(dup).not.toHaveBeenCalled()
    })
})
