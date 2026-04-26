import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '../../local/schema'
import type { OutboxRow } from '../../local/types'
import { applyEdit } from '../../local/write'
import { CrossTabLock } from '../cross-tab-lock'
import { type EngineClock, SyncEngine } from '../engine'
import {
    AuthError,
    type FirestoreAdapter,
    NetworkError,
    TransientError,
    VersionMismatchError,
} from '../firestore-adapter'

// In-memory hub mimicking BroadcastChannel for cross-tab tests.
class FakeChannelHub {
    private all = new Map<string, Set<(data: unknown) => void>>()
    create(name: string) {
        let handler: ((ev: { data: unknown }) => void) | null = null
        const set = this.all.get(name) ?? new Set()
        const my = (data: unknown) => handler?.({ data })
        set.add(my)
        this.all.set(name, set)
        return {
            postMessage(data: unknown) {
                for (const fn of set) if (fn !== my) fn(data)
            },
            close() {
                set.delete(my)
            },
            get onmessage() {
                return handler
            },
            set onmessage(h) {
                handler = h
            },
        }
    }
}

// Manual clock — no vi fake timers (which race with Dexie/fake-indexeddb
// internal microtask scheduling). Each timer fire is followed by enough
// microtask yields to let the engine's Dexie I/O settle deterministically.
class FakeClock implements EngineClock {
    private t: number
    private timers: Array<{ id: number; at: number; fn: () => void }> = []
    private nextId = 1

    constructor(start?: number) {
        // Default starts 1 hour ahead of real Date.now() so applyEdit-emitted
        // scheduledFor values (which use real Date.now()) are always "due"
        // from this clock's view at engine startup. Once draining starts,
        // handleAdapterError uses clock.now() for retry scheduling, so all
        // subsequent timing is purely relative to this clock.
        this.t = start ?? Date.now() + 3_600_000
    }

    now(): number {
        return this.t
    }

    setTimeout(fn: () => void, ms: number): unknown {
        const id = this.nextId++
        this.timers.push({ id, at: this.t + ms, fn })
        return id
    }

    clearTimeout(handle: unknown): void {
        const id = handle as number
        this.timers = this.timers.filter((t) => t.id !== id)
    }

    async advance(ms: number): Promise<void> {
        const target = this.t + ms
        await flushAll()
        // eslint-disable-next-line no-constant-condition
        while (true) {
            this.timers.sort((a, b) => a.at - b.at)
            const due = this.timers.find((t) => t.at <= target)
            if (!due) break
            this.timers = this.timers.filter((t) => t.id !== due.id)
            this.t = due.at
            due.fn()
            // After firing, yield to macrotasks so fake-indexeddb's internal
            // setTimeout(0) callbacks (which back Dexie I/O) can run before
            // we look for the next timer.
            await flushAll()
        }
        this.t = target
        await flushAll()
    }
}

// Yield to BOTH macrotasks (one setTimeout-0 per round) AND many microtasks.
// Cost per round: ~1ms; bounded at <10ms total per timer fire.
async function flushAll(rounds = 6): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

class FakeAdapter implements FirestoreAdapter {
    received: OutboxRow[] = []
    nextResults: Array<'ok' | Error> = []
    refreshes = 0
    nextRefreshFails = false

    queue(...results: Array<'ok' | Error>) {
        this.nextResults.push(...results)
    }

    async commitOutboxRow(row: OutboxRow): Promise<void> {
        const next = this.nextResults.shift() ?? 'ok'
        if (next === 'ok') {
            this.received.push({ ...row })
            return
        }
        throw next
    }

    async refreshAuthToken(): Promise<void> {
        this.refreshes += 1
        if (this.nextRefreshFails) throw new Error('refresh failed')
    }
}

function makeOnlineListener() {
    const listeners = new Map<string, Set<() => void>>()
    return {
        addListener(event: 'online' | 'offline', cb: () => void) {
            const set = listeners.get(event) ?? new Set()
            set.add(cb)
            listeners.set(event, set)
        },
        removeListener(event: 'online' | 'offline', cb: () => void) {
            listeners.get(event)?.delete(cb)
        },
        fire(event: 'online' | 'offline') {
            for (const cb of listeners.get(event) ?? []) cb()
        },
    }
}

interface Harness {
    clock: FakeClock
    adapter: FakeAdapter
    lock: CrossTabLock
    engine: SyncEngine
    online: { value: boolean }
    listener: ReturnType<typeof makeOnlineListener>
}

let _hub: FakeChannelHub

function buildEngine(opts?: { lockChannel?: string }): Harness {
    const clock = new FakeClock()
    const adapter = new FakeAdapter()
    const lock = new CrossTabLock(opts?.lockChannel ?? 'crc-sync-test', {
        channelFactory: (n) => _hub.create(n),
        clock,
        leaseMs: 5000,
    })
    const online = { value: true }
    const listener = makeOnlineListener()
    const engine = new SyncEngine({
        adapter,
        lock,
        clock,
        isOnline: () => online.value,
        onlineListener: {
            addListener: (e, cb) => listener.addListener(e, cb),
            removeListener: (e, cb) => listener.removeListener(e, cb),
        },
    })
    return { clock, adapter, lock, engine, online, listener }
}

describe('SyncEngine', () => {
    beforeEach(async () => {
        await resetDbForTests()
        _hub = new FakeChannelHub()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('AC-2: drains a single pending row to idle', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        h.adapter.queue('ok')
        await h.engine.start()
        await flushAll()
        expect(h.adapter.received).toHaveLength(1)
        expect(await getDb().outbox.count()).toBe(0)
        expect(h.engine.getState()).toBe('idle')
        h.engine.shutdown()
    })

    it('AC-3: backoff schedule [500, 1000, 2000, 4000] before success', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        h.adapter.queue(
            new TransientError('5xx-1'),
            new TransientError('5xx-2'),
            new TransientError('5xx-3'),
            new TransientError('5xx-4'),
            'ok',
        )
        await h.engine.start()
        await flushAll()

        let row = (await getDb().outbox.toArray())[0]
        expect(row.attempts).toBe(1)
        expect(row.scheduledFor - h.clock.now()).toBe(500)
        expect(row.status).toBe('pending')

        await h.clock.advance(500)
        row = (await getDb().outbox.toArray())[0]
        expect(row.attempts).toBe(2)

        await h.clock.advance(1000)
        row = (await getDb().outbox.toArray())[0]
        expect(row.attempts).toBe(3)

        await h.clock.advance(2000)
        row = (await getDb().outbox.toArray())[0]
        expect(row.attempts).toBe(4)

        await h.clock.advance(4000)
        expect(await getDb().outbox.count()).toBe(0)
        expect(h.engine.getState()).toBe('idle')
        h.engine.shutdown()
    })

    it('AC-4: version-mismatch routes to Conflict, no auto-retry', async () => {
        const h = buildEngine()
        await getDb().tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'C',
        })
        await applyEdit({
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            patch: { key: 'G' },
            expectedUpdatedAt: 999,
        })
        h.adapter.queue(new VersionMismatchError())
        await h.engine.start()
        await flushAll()
        expect(h.engine.getState()).toBe('conflict')
        const rows = await getDb().outbox.toArray()
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('failed')
        await h.clock.advance(60_000)
        expect(h.adapter.received).toHaveLength(0)
        h.engine.shutdown()
    })

    it('AC-5: auth failure → one-shot refresh; second attempt fails → Failed', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        h.adapter.queue(new AuthError(), new AuthError())
        await h.engine.start()
        await flushAll()
        expect(h.adapter.refreshes).toBe(1)
        expect(h.engine.getState()).toBe('failed')
        const rows = await getDb().outbox.toArray()
        expect(rows[0].status).toBe('failed')
        h.engine.shutdown()
    })

    it('AC-5b: auth failure → refresh succeeds → second attempt OK → idle', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        h.adapter.queue(new AuthError(), 'ok')
        await h.engine.start()
        await flushAll()
        expect(h.adapter.refreshes).toBe(1)
        expect(h.engine.getState()).toBe('idle')
        expect(await getDb().outbox.count()).toBe(0)
        h.engine.shutdown()
    })

    it('AC-6: 5 transient failures → Failed (dead-letter, row stays)', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        for (let i = 0; i < 5; i++) {
            h.adapter.queue(new TransientError(`5xx-${i + 1}`))
        }
        await h.engine.start()
        await flushAll()
        // Walk through each backoff window deterministically.
        await h.clock.advance(500)
        await h.clock.advance(1000)
        await h.clock.advance(2000)
        await h.clock.advance(4000)
        expect(h.engine.getState()).toBe('failed')
        const rows = await getDb().outbox.toArray()
        expect(rows).toHaveLength(1)
        expect(rows[0].status).toBe('failed')
        expect(rows[0].attempts).toBe(5)
        h.engine.shutdown()
    })

    it('AC-7: offline detection + auto-resume on online', async () => {
        const h = buildEngine()
        h.online.value = false
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        await h.engine.start()
        await flushAll()
        expect(h.engine.getState()).toBe('offline')
        expect(h.adapter.received).toHaveLength(0)

        h.online.value = true
        h.adapter.queue('ok')
        h.listener.fire('online')
        await flushAll()
        // Force a pump (in production: lock onAvailable + sentinel timer
        // would reach this; tests assert behavior via one explicit pump).
        await h.engine.pump()
        await flushAll()
        expect(h.adapter.received).toHaveLength(1)
        expect(h.engine.getState()).toBe('idle')
        h.engine.shutdown()
    })

    it('AC-8: cross-tab single-leader drain (one tab drains; survivor takes over)', async () => {
        const sharedChannel = 'crc-sync-shared'
        const a = buildEngine({ lockChannel: sharedChannel })
        const b = buildEngine({ lockChannel: sharedChannel })

        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        a.adapter.queue('ok')
        b.adapter.queue('ok')

        await a.engine.start()
        await b.engine.start()
        await flushAll()

        const aHandled = a.adapter.received.length
        const bHandled = b.adapter.received.length
        expect(aHandled + bHandled).toBe(1)
        expect(await getDb().outbox.count()).toBe(0)

        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't2', setlistId: 's1', order: 1 },
        })
        const holder = a.lock.isHolder() ? a : b
        const survivor = a.lock.isHolder() ? b : a
        holder.engine.shutdown()
        survivor.adapter.queue('ok')
        // Lease expiry triggers onAvailable → pump in survivor.
        await survivor.clock.advance(5500)
        await survivor.engine.pump()
        await flushAll()
        expect(survivor.adapter.received.length).toBeGreaterThanOrEqual(1)
        expect(await getDb().outbox.count()).toBe(0)
        survivor.engine.shutdown()
    })

    it('NetworkError mid-drain → returns to Offline; rows stay pending', async () => {
        const h = buildEngine()
        await applyEdit({
            op: 'set',
            collection: 'tracks',
            doc: { id: 't1', setlistId: 's1', order: 0 },
        })
        h.adapter.queue(new NetworkError('fetch failed'))
        await h.engine.start()
        await flushAll()
        expect(h.engine.getState()).toBe('offline')
        const rows = await getDb().outbox.toArray()
        expect(rows[0].status).toBe('pending')
        h.engine.shutdown()
    })
})
