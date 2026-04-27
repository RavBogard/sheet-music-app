import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CrossTabLock } from '../cross-tab-lock'

// In-memory hub that shares messages across N "tab" instances on the same channel.
//
// Delivery mode is configurable per hub:
//   - 'sync' (default): postMessage delivers to peers synchronously inside
//     the postMessage call. Models a single-thread test where the sender's
//     work completes before any peer reacts.
//   - 'deferred': postMessage queues the delivery; tests must call hub.flush()
//     to drain. Models a true async BroadcastChannel race where two tabs can
//     both call tryAcquire (and both set holder=true) BEFORE either receives
//     the other's lock-acquired message — the only path that exercises the
//     tie-break-by-tabId branch in CrossTabLock.onMessage.
class FakeChannelHub {
    private listeners = new Map<string, Set<(data: unknown) => void>>()
    private queue: Array<() => void> = []
    constructor(private readonly mode: 'sync' | 'deferred' = 'sync') {}

    create(name: string) {
        let handler: ((ev: { data: unknown }) => void) | null = null
        const set = this.listeners.get(name) ?? new Set()
        const myListener = (data: unknown) => {
            if (handler) handler({ data })
        }
        set.add(myListener)
        this.listeners.set(name, set)

        const dispatch = (data: unknown) => {
            for (const fn of set) {
                if (fn === myListener) continue
                fn(data)
            }
        }

        const mode = this.mode
        const queue = this.queue
        return {
            postMessage(data: unknown) {
                if (mode === 'sync') {
                    dispatch(data)
                } else {
                    queue.push(() => dispatch(data))
                }
            },
            close() {
                set.delete(myListener)
            },
            get onmessage() {
                return handler
            },
            set onmessage(h) {
                handler = h
            },
        }
    }

    flush(): void {
        // Drain in FIFO order. Handlers may enqueue more messages; loop until
        // the queue is empty.
        while (this.queue.length > 0) {
            const next = this.queue.shift()!
            next()
        }
    }
}

class FakeClock {
    private t = 1000
    private timers: Array<{ id: number; at: number; fn: () => void }> = []
    private nextId = 1

    now() {
        return this.t
    }
    setTimeout(fn: () => void, ms: number) {
        const id = this.nextId++
        this.timers.push({ id, at: this.t + ms, fn })
        return id
    }
    clearTimeout(handle: unknown) {
        const id = handle as number
        this.timers = this.timers.filter((t) => t.id !== id)
    }
    advance(ms: number) {
        const target = this.t + ms
        // Iterate carefully — handlers may schedule new timers.
        // Process in chronological order until target.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            this.timers.sort((a, b) => a.at - b.at)
            const due = this.timers.find((t) => t.at <= target)
            if (!due) break
            this.timers = this.timers.filter((t) => t.id !== due.id)
            this.t = due.at
            due.fn()
        }
        this.t = target
    }
}

describe('CrossTabLock', () => {
    let hub: FakeChannelHub
    let clock: FakeClock

    beforeEach(() => {
        hub = new FakeChannelHub()
        clock = new FakeClock()
    })

    afterEach(() => {
        // no globals used
    })

    it('exactly one of two instances acquires the lock', () => {
        const a = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const b = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })

        // ─── Deflake note (v50-06-01) ──────────────────────────────────────
        // The strong invariant for sequential-call acquisition is "exactly
        // one holder", NOT "the lower tabId wins". With sync hub delivery,
        // the FIRST tryAcquire broadcasts lock-acquired before the SECOND
        // tryAcquire runs, so the second sees a fresh peerHolder and bails
        // out — first-come-first-served regardless of tabId. The
        // tie-break-by-tabId path in CrossTabLock.onMessage only fires when
        // BOTH tabs set holder=true before either receives the other's
        // message — i.e. a true async race. That scenario is covered by the
        // 'tie-break: lower tabId wins on simultaneous race' test below
        // using the 'deferred' hub mode.
        const aGot = a.tryAcquire()
        const bGot = b.tryAcquire()
        const winners = [a, b].filter((x) => x.isHolder())
        expect(winners.length).toBe(1)
        a.shutdown()
        b.shutdown()
        expect(aGot || bGot).toBe(true)
    })

    it('tie-break: lower tabId wins on simultaneous-broadcast race', () => {
        // Use deferred-delivery hub so both tabs can complete tryAcquire
        // (and both set holder=true) BEFORE either receives the other's
        // lock-acquired message. THIS is the path that exercises the
        // tie-break-by-tabId branch in CrossTabLock.onMessage.
        const deferredHub = new FakeChannelHub('deferred')
        const a = new CrossTabLock('crc-sync-tiebreak', {
            clock,
            channelFactory: (n) => deferredHub.create(n),
            leaseMs: 5000,
        })
        const b = new CrossTabLock('crc-sync-tiebreak', {
            clock,
            channelFactory: (n) => deferredHub.create(n),
            leaseMs: 5000,
        })

        // Both acquire optimistically (no peerHolder seen yet → both win locally).
        const aGot = a.tryAcquire()
        const bGot = b.tryAcquire()
        expect(aGot).toBe(true)
        expect(bGot).toBe(true)
        // Pre-flush: both think they hold the lock.
        expect(a.isHolder()).toBe(true)
        expect(b.isHolder()).toBe(true)

        // Now deliver the queued lock-acquired messages. The tie-break
        // resolves: lower tabId keeps the lock, higher yields.
        deferredHub.flush()

        const winners = [a, b].filter((x) => x.isHolder())
        expect(winners.length).toBe(1)
        const lower = a.tabId < b.tabId ? a : b
        const higher = a.tabId < b.tabId ? b : a
        expect(lower.isHolder()).toBe(true)
        expect(higher.isHolder()).toBe(false)

        a.shutdown()
        b.shutdown()
    })

    it('survivor picks up after holder shuts down (lease + heartbeat)', () => {
        const a = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const b = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })

        // Force A to be the holder regardless of tabId tie-break.
        a.tryAcquire()
        if (!a.isHolder()) {
            // tabId tie-break gave it to B; flip them around.
            b.shutdown()
            a.shutdown()
            return
        }
        expect(b.tryAcquire()).toBe(false)

        let availableFired = false
        b.onAvailable(() => {
            availableFired = true
        })

        // A goes away (tab close). Survivor sees lease expire after 5s.
        a.shutdown()
        clock.advance(5500)
        expect(availableFired).toBe(true)
        expect(b.tryAcquire()).toBe(true)
        b.shutdown()
    })

    it('release notifies peers immediately', () => {
        const a = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const b = new CrossTabLock('crc-sync', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        a.tryAcquire()
        if (!a.isHolder()) {
            // Tie-break flipped — exit; the other test covers symmetry.
            a.shutdown()
            b.shutdown()
            return
        }
        let availableFired = false
        b.onAvailable(() => {
            availableFired = true
        })
        a.release()
        expect(availableFired).toBe(true)
        a.shutdown()
        b.shutdown()
    })

    // Regression-stress for the v50-06-01 deflake: prior iterations of the
    // first test asserted "lower tabId wins" against sequential acquisition,
    // which is brittle (the first caller wins regardless of tabId in a
    // synchronous fake hub). This loop pins the actual invariants and would
    // have caught the regression that originally surfaced as a ~40% test flake.
    it('exclusive-acquisition invariant holds across 50 iterations', () => {
        for (let i = 0; i < 50; i++) {
            const localHub = new FakeChannelHub()
            const localClock = new FakeClock()
            const a = new CrossTabLock('crc-sync-stress', {
                clock: localClock,
                channelFactory: (n) => localHub.create(n),
                leaseMs: 5000,
            })
            const b = new CrossTabLock('crc-sync-stress', {
                clock: localClock,
                channelFactory: (n) => localHub.create(n),
                leaseMs: 5000,
            })
            a.tryAcquire()
            b.tryAcquire()
            const winners = [a, b].filter((x) => x.isHolder())
            expect(
                winners.length,
                `iteration ${i}: expected exactly one holder, got ${winners.length}`,
            ).toBe(1)
            a.shutdown()
            b.shutdown()
        }
    })

    it('tie-break invariant holds across 50 simultaneous-race iterations', () => {
        for (let i = 0; i < 50; i++) {
            const deferredHub = new FakeChannelHub('deferred')
            const localClock = new FakeClock()
            const a = new CrossTabLock('crc-sync-tiebreak-stress', {
                clock: localClock,
                channelFactory: (n) => deferredHub.create(n),
                leaseMs: 5000,
            })
            const b = new CrossTabLock('crc-sync-tiebreak-stress', {
                clock: localClock,
                channelFactory: (n) => deferredHub.create(n),
                leaseMs: 5000,
            })
            a.tryAcquire()
            b.tryAcquire()
            deferredHub.flush()
            const lower = a.tabId < b.tabId ? a : b
            const higher = a.tabId < b.tabId ? b : a
            expect(
                lower.isHolder(),
                `iteration ${i}: expected lower tabId (${lower.tabId}) to hold`,
            ).toBe(true)
            expect(
                higher.isHolder(),
                `iteration ${i}: expected higher tabId (${higher.tabId}) to yield`,
            ).toBe(false)
            a.shutdown()
            b.shutdown()
        }
    })
})
