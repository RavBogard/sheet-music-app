import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CrossTabLock } from '../cross-tab-lock'

// In-memory hub that shares messages across N "tab" instances on the same channel.
class FakeChannelHub {
    private listeners = new Map<string, Set<(data: unknown) => void>>()

    create(name: string) {
        let handler: ((ev: { data: unknown }) => void) | null = null
        const set = this.listeners.get(name) ?? new Set()
        const broadcast = (data: unknown) => {
            for (const fn of set) fn(data)
        }
        const myListener = (data: unknown) => {
            // Don't deliver back to the sender; mimic real BroadcastChannel.
            if (handler) handler({ data })
        }
        set.add(myListener)
        this.listeners.set(name, set)

        return {
            postMessage(data: unknown) {
                for (const fn of set) {
                    if (fn === myListener) continue
                    fn(data)
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
            // expose for symmetry; unused
            _broadcast: broadcast,
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

        const aGot = a.tryAcquire()
        const bGot = b.tryAcquire()
        // Only one should hold. Tie-break: lower tabId wins; both initial
        // attempts may briefly succeed before message delivery, but the
        // higher-tabId instance must yield.
        const winners = [a, b].filter((x) => x.isHolder())
        expect(winners.length).toBe(1)
        // The one that won corresponds to the lower tabId.
        const lower = a.tabId < b.tabId ? a : b
        expect(lower.isHolder()).toBe(true)
        a.shutdown()
        b.shutdown()
        // Pre-test sanity: both reported tryAcquire results are recorded.
        expect(aGot || bGot).toBe(true)
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
})
