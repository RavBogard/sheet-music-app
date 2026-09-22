import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * David's ask 4 follow-up (2026-09-22): the leader who swaps sees the swap at
 * once, even while their own listen stream is behind. On production the
 * leader's row trailed the musician's by ~30 s, twice in a row; the musician's
 * iPad followed within 5 s.
 */

type SnapCb = (snap: { exists: () => boolean; data: () => unknown }) => void
const listeners: SnapCb[] = []
let serverDoc: unknown = null

vi.mock('@/lib/firebase', () => ({
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => () => void) => setup({})),
}))

vi.mock('firebase/firestore', () => ({
    doc: vi.fn((...path: unknown[]) => path.slice(1).join('/')),
    onSnapshot: vi.fn((_ref: unknown, next: SnapCb) => {
        listeners.push(next)
        return () => listeners.splice(listeners.indexOf(next), 1)
    }),
    runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => unknown) => {
        const tx = {
            get: async () => ({ exists: () => serverDoc !== null, data: () => serverDoc }),
            set: vi.fn(),
        }
        return fn(tx)
    }),
}))

import { commitTonightReset, commitTonightSwap, subscribeTonight } from '@/lib/performance/tonight-client'
import { chicagoDay, type OverridesDoc } from '@/lib/performance/tonight'

const DAY = chicagoDay(Date.now())
const PLANNED = { fileId: 'A', title: 'Plan A' }
let setlistSeq = 0

const deliver = (d: OverridesDoc | null) => {
    for (const l of [...listeners]) l({ exists: () => d !== null, data: () => d })
}

const swapTo = (setlistId: string, fileId: string | null, expectedBeforeFileId: string | null) =>
    commitTonightSwap(setlistId, {
        rowId: 'r1',
        planned: PLANNED,
        expectedBeforeFileId,
        choice: fileId && fileId !== PLANNED.fileId
            ? { fileId, songId: fileId, title: `Chart ${fileId}`, key: null, mimeType: null }
            : null,
        by: 'leader-1',
        at: Date.now(),
        eventDay: DAY,
    })

function follow(setlistId: string) {
    const seen: (OverridesDoc | null)[] = []
    const unsub = subscribeTonight(setlistId, (d) => seen.push(d), () => {})
    const shown = () => seen[seen.length - 1]?.rows.r1?.fileId ?? PLANNED.fileId
    return { seen, unsub, shown }
}

describe('subscribeTonight adopts the doc this tab committed', () => {
    let setlistId = ''
    beforeEach(() => {
        listeners.length = 0
        serverDoc = null
        setlistId = `set-${++setlistSeq}`
    })

    it('shows a swap as soon as the commit resolves, with no listener echo', async () => {
        const f = follow(setlistId)
        deliver(null)
        const plan = await swapTo(setlistId, 'B', 'A')
        expect(plan.kind).toBe('write')
        expect(f.shown()).toBe('B')
        expect(f.seen[f.seen.length - 1]?.rev).toBe(1)
        f.unsub()
    })

    it('does not step back when the late listener delivers the pre-commit doc', async () => {
        const f = follow(setlistId)
        await swapTo(setlistId, 'B', 'A')
        deliver(null) // the stream catching up from before the write
        expect(f.shown()).toBe('B')
    })

    it('undo and reset show the plan at once', async () => {
        const f = follow(setlistId)
        const first = await swapTo(setlistId, 'B', 'A')
        if (first.kind !== 'write') throw new Error('expected a write')
        serverDoc = first.next
        const undo = await swapTo(setlistId, 'A', 'B')
        if (undo.kind !== 'write') throw new Error('expected a write')
        serverDoc = undo.next
        expect(f.shown()).toBe('A')
        expect(f.seen[f.seen.length - 1]?.rev).toBe(2)

        const again = await swapTo(setlistId, 'C', 'A')
        if (again.kind !== 'write') throw new Error('expected a write')
        serverDoc = again.next
        expect(f.shown()).toBe('C')
        const reset = await commitTonightReset(setlistId, {
            planned: { r1: PLANNED },
            by: 'leader-1',
            at: Date.now(),
            eventDay: DAY,
        })
        expect(reset.kind).toBe('write')
        expect(f.shown()).toBe('A')
    })

    it("another leader's newer doc from the listener still wins", async () => {
        const f = follow(setlistId)
        const mine = await swapTo(setlistId, 'B', 'A')
        if (mine.kind !== 'write') throw new Error('expected a write')
        deliver({ ...mine.next, rev: 2, rows: { r1: { ...mine.next.rows.r1, fileId: 'C', title: 'Chart C' } } })
        expect(f.shown()).toBe('C')
    })

    it('a stale or noop answer adopts nothing', async () => {
        const f = follow(setlistId)
        deliver(null)
        const stale = await swapTo(setlistId, 'B', 'X') // the operator saw X, the row shows A
        expect(stale.kind).toBe('stale')
        const noop = await swapTo(setlistId, 'A', 'A')
        expect(noop.kind).toBe('noop')
        expect(f.seen).toEqual([null])
    })

    it('a listener mounted after the commit starts from the committed doc', async () => {
        await swapTo(setlistId, 'B', 'A')
        const f = follow(setlistId)
        expect(f.shown()).toBe('B')
        deliver(null)
        expect(f.shown()).toBe('B')
    })

    it('a failed commit adopts nothing and keeps the plan', async () => {
        const { runTransaction } = await import('firebase/firestore')
        vi.mocked(runTransaction).mockRejectedValueOnce(new Error('unavailable'))
        const f = follow(setlistId)
        deliver(null)
        await expect(swapTo(setlistId, 'B', 'A')).rejects.toThrow('unavailable')
        expect(f.shown()).toBe('A')
    })

    it('unsubscribing stops committed-doc delivery', async () => {
        const f = follow(setlistId)
        f.unsub()
        await swapTo(setlistId, 'B', 'A')
        expect(f.seen).toEqual([])
    })
})
