import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * David's ask 4 follow-up (2026-09-22): the leader who swaps sees the swap at
 * once, even while their own listen stream is behind. On production the
 * leader's row trailed the musician's by ~30 s, twice in a row; the musician's
 * iPad followed within 5 s.
 *
 * Astra's 21:56 review: a doc older than one already shown is never shown,
 * whichever path either came by; a real deletion still shows the plan; and a
 * committed doc does not outlive the subscriptions and the signed-in user it
 * was committed under.
 */

type SnapCb = (snap: { exists: () => boolean; data: () => unknown }) => void
type Listener = { next: SnapCb; error: (err: unknown) => void }
const listeners: Listener[] = []
let serverDoc: unknown = null
const fakeAuth = vi.hoisted(() => ({ currentUser: { uid: 'leader-1' } as { uid: string } | null }))

vi.mock('@/lib/firebase', () => ({
    auth: fakeAuth,
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn((setup: (db: unknown) => () => void) => setup({})),
}))

vi.mock('firebase/firestore', () => ({
    doc: vi.fn((...path: unknown[]) => path.slice(1).join('/')),
    onSnapshot: vi.fn((_ref: unknown, next: SnapCb, error: (err: unknown) => void) => {
        const l = { next, error }
        listeners.push(l)
        return () => {
            const i = listeners.indexOf(l)
            if (i >= 0) listeners.splice(i, 1)
        }
    }),
    runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => unknown) => {
        const tx = {
            get: async () => ({ exists: () => serverDoc !== null, data: () => serverDoc }),
            set: vi.fn(),
        }
        return fn(tx)
    }),
}))

import { runTransaction } from 'firebase/firestore'
import { commitTonightReset, commitTonightSwap, subscribeTonight } from '@/lib/performance/tonight-client'
import { chicagoDay, type OverridesDoc } from '@/lib/performance/tonight'

const DAY = chicagoDay(Date.now())
const PLANNED = { fileId: 'A', title: 'Plan A' }
let setlistSeq = 0

const deliver = (d: OverridesDoc | null) => {
    for (const l of [...listeners]) l.next({ exists: () => d !== null, data: () => d })
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

/** The next transaction waits for `release()` before it reads. */
function holdNextCommit() {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    vi.mocked(runTransaction).mockImplementationOnce(async (_db, fn) => {
        await gate
        const tx = {
            get: async () => ({ exists: () => serverDoc !== null, data: () => serverDoc }),
            set: vi.fn(),
        }
        return (fn as (tx: unknown) => unknown)(tx) as never
    })
    return () => release()
}

function follow(setlistId: string) {
    const seen: (OverridesDoc | null)[] = []
    const errors: unknown[] = []
    const unsub = subscribeTonight(setlistId, (d) => seen.push(d), (e) => errors.push(e))
    const shown = () => seen[seen.length - 1]?.rows.r1?.fileId ?? PLANNED.fileId
    const revs = () => seen.map((d) => d?.rev ?? 0)
    return { seen, errors, unsub, shown, revs }
}

/** A doc another leader wrote, as the listener would deliver it. */
const byOther = (rev: number, fileId: string): OverridesDoc => ({
    rows: {
        r1: {
            fileId,
            songId: fileId,
            title: `Chart ${fileId}`,
            key: null,
            mimeType: null,
            plannedFileId: PLANNED.fileId,
            plannedTitle: PLANNED.title,
        },
    },
    eventDay: DAY,
    rev,
    updatedAt: Date.now(),
    updatedBy: 'leader-2',
}) as unknown as OverridesDoc

describe('subscribeTonight adopts the doc this tab committed', () => {
    let setlistId = ''
    beforeEach(() => {
        listeners.length = 0
        serverDoc = null
        fakeAuth.currentUser = { uid: 'leader-1' }
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
        expect(f.revs()).toEqual([1, 2, 3, 4])
    })

    it("another leader's newer doc from the listener still wins", async () => {
        const f = follow(setlistId)
        const mine = await swapTo(setlistId, 'B', 'A')
        if (mine.kind !== 'write') throw new Error('expected a write')
        deliver(byOther(2, 'C'))
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

    it('a failed commit adopts nothing and keeps the plan', async () => {
        vi.mocked(runTransaction).mockRejectedValueOnce(new Error('unavailable'))
        const f = follow(setlistId)
        deliver(null)
        await expect(swapTo(setlistId, 'B', 'A')).rejects.toThrow('unavailable')
        expect(f.shown()).toBe('A')
    })

    // Revision ordering.
    it("after this tab's rev 2 and another leader's rev 4, a delayed rev 3 is not shown", async () => {
        const f = follow(setlistId)
        serverDoc = byOther(1, 'X')
        deliver(byOther(1, 'X'))
        const mine = await swapTo(setlistId, 'B', 'X')
        if (mine.kind !== 'write') throw new Error('expected a write')
        expect(mine.next.rev).toBe(2)
        deliver(byOther(4, 'D'))
        deliver(byOther(3, 'C'))
        deliver(mine.next) // the echo of rev 2, later still
        expect(f.shown()).toBe('D')
        expect(f.revs()).toEqual([1, 2, 4])
    })

    it('a commit that resolves after the listener showed something newer is not shown', async () => {
        const f = follow(setlistId)
        deliver(null)
        const release = holdNextCommit()
        const pending = swapTo(setlistId, 'B', 'A') // writes rev 1
        deliver(byOther(2, 'D')) // another leader, on top of it, arrives first
        release()
        expect((await pending).kind).toBe('write')
        expect(f.shown()).toBe('D')
        expect(f.revs()).toEqual([0, 2])
    })

    it('a doc that is really gone shows the plan, and a recreated doc shows again', async () => {
        const f = follow(setlistId)
        const mine = await swapTo(setlistId, 'B', 'A')
        if (mine.kind !== 'write') throw new Error('expected a write')
        deliver(mine.next) // the listener has caught up with the commit
        deliver(null) // deleted (server-only; no path does this today) or malformed
        expect(f.seen[f.seen.length - 1]).toBeNull()
        expect(f.shown()).toBe('A')
        deliver(byOther(1, 'C'))
        expect(f.shown()).toBe('C')
        expect(f.revs()).toEqual([1, 0, 1])
    })

    it('Reset to plan is a newer write with no rows, not a deletion', async () => {
        const f = follow(setlistId)
        deliver(byOther(3, 'C'))
        deliver({ ...byOther(4, 'C'), rows: {} } as OverridesDoc)
        expect(f.shown()).toBe('A')
        expect(f.revs()).toEqual([3, 4])
    })

    // Lifetime: unsubscribe, sign-out, account change, read denial.
    it('nothing is cached: a subscription opened after the commit waits for the listener', async () => {
        const before = follow(setlistId)
        await swapTo(setlistId, 'B', 'A')
        before.unsub()
        const f = follow(setlistId)
        expect(f.seen).toEqual([])
        deliver(null)
        expect(f.seen).toEqual([null])
    })

    it('unsubscribing stops committed-doc delivery', async () => {
        const f = follow(setlistId)
        f.unsub()
        await swapTo(setlistId, 'B', 'A')
        expect(f.seen).toEqual([])
    })

    it('a commit that resolves after unsubscribe reaches nobody, then or later', async () => {
        const f = follow(setlistId)
        const release = holdNextCommit()
        const pending = swapTo(setlistId, 'B', 'A')
        f.unsub()
        release()
        await pending
        expect(f.seen).toEqual([])
        const g = follow(setlistId)
        expect(g.seen).toEqual([])
    })

    it('signing out or switching account mid-commit adopts nothing', async () => {
        const a = follow(setlistId)
        const release = holdNextCommit()
        const pending = swapTo(setlistId, 'B', 'A')
        // The hook resubscribes on a user change: the old subscription closes, a new one opens.
        fakeAuth.currentUser = { uid: 'musician-2' }
        a.unsub()
        const b = follow(setlistId)
        release()
        await pending
        expect(a.seen).toEqual([])
        expect(b.seen).toEqual([])
        deliver(null)
        expect(b.seen).toEqual([null])

        fakeAuth.currentUser = null
        const c = follow(setlistId)
        expect(c.seen).toEqual([])
    })

    it("another account's open subscription never gets this user's commit", async () => {
        fakeAuth.currentUser = { uid: 'musician-2' }
        const other = follow(setlistId)
        fakeAuth.currentUser = { uid: 'leader-1' }
        const mine = follow(setlistId)
        await swapTo(setlistId, 'B', 'A')
        expect(mine.shown()).toBe('B')
        expect(other.seen).toEqual([])
    })

    it('a signed-out subscription follows the listener only', async () => {
        fakeAuth.currentUser = null
        const f = follow(setlistId)
        deliver(byOther(1, 'C'))
        expect(f.shown()).toBe('C')
        serverDoc = byOther(1, 'C')
        await swapTo(setlistId, 'B', 'C') // the rules would refuse it; the client adopts nothing either way
        expect(f.revs()).toEqual([1])
    })

    it('after a read failure the subscription shows nothing more, not even its own commits', async () => {
        const f = follow(setlistId)
        deliver(byOther(1, 'C'))
        const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
        for (const l of [...listeners]) l.error(denied)
        expect(f.errors).toEqual([denied])
        serverDoc = byOther(1, 'C')
        await swapTo(setlistId, 'B', 'C')
        deliver(byOther(5, 'D'))
        expect(f.revs()).toEqual([1])
        expect(f.shown()).toBe('C')
    })
})
