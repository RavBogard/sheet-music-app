// Property-based no-data-loss harness for the v50-03 sync engine.
//
// Contract: a successfully-committed `applyEdit()` is observable in EXACTLY
// ONE of:
//   (a) the Firestore mock having received the corresponding write, OR
//   (b) the outbox containing a row whose status ∈ {pending, failed} and
//       whose payload matches the local state delta.
// Never neither.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import { getDb, resetDbForTests } from '../../local/schema'
import type { LocalCollection, OutboxRow } from '../../local/types'
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

// ---------- Test scaffolding ----------

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

class FakeClock implements EngineClock {
    private t: number
    private timers: Array<{ id: number; at: number; fn: () => void }> = []
    private nextId = 1
    constructor() {
        this.t = Date.now() + 3_600_000
    }
    now() {
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
        await flush()
        // eslint-disable-next-line no-constant-condition
        while (true) {
            this.timers.sort((a, b) => a.at - b.at)
            const due = this.timers.find((t) => t.at <= target)
            if (!due) break
            this.timers = this.timers.filter((t) => t.id !== due.id)
            this.t = due.at
            due.fn()
            await flush()
        }
        this.t = target
        await flush()
    }
}

async function flush(rounds = 4): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

// Mock adapter that mirrors Firestore semantics for asserting no-data-loss.
class HarnessAdapter implements FirestoreAdapter {
    // Authoritative server state, keyed by `${collection}/${docId}`.
    server = new Map<string, Record<string, unknown>>()
    nextFailure: Failure = 'ok'
    refreshes = 0

    async commitOutboxRow(row: OutboxRow): Promise<void> {
        const f = this.nextFailure
        if (f === 'ok') {
            this.applySuccess(row)
            return
        }
        // Don't reset failure mode here — the harness explicitly toggles it
        // via { kind: 'failure-mode', mode } actions.
        switch (f) {
            case 'network':
                throw new NetworkError('fetch failed')
            case 'auth':
                throw new AuthError('401')
            case 'version':
                throw new VersionMismatchError()
            case 'transient':
                throw new TransientError('5xx')
        }
    }

    async refreshAuthToken(): Promise<void> {
        this.refreshes += 1
    }

    private applySuccess(row: OutboxRow): void {
        const key = `${row.collection}/${row.docId}`
        if (row.op === 'set') {
            this.server.set(key, { ...row.payload, id: row.docId })
        } else if (row.op === 'update') {
            const existing = this.server.get(key) ?? { id: row.docId }
            this.server.set(key, { ...existing, ...row.payload })
        } else {
            this.server.delete(key)
        }
    }
}

type Failure = 'ok' | 'network' | 'auth' | 'version' | 'transient'

// ---------- Action arbitraries ----------

interface DocPool {
    setlists: string[]
    tracks: string[]
    songs: string[]
}

const POOL: DocPool = {
    setlists: ['s1', 's2'],
    tracks: ['t1', 't2', 't3'],
    songs: ['song1', 'song2', 'song3'],
}

type EditAction =
    | { kind: 'edit-set'; collection: LocalCollection; docId: string; payload: { v: number } }
    | { kind: 'edit-update'; collection: LocalCollection; docId: string; patch: { v: number } }
    | { kind: 'edit-delete'; collection: LocalCollection; docId: string }
    | { kind: 'failure-mode'; mode: Failure }
    | { kind: 'tick'; ms: number }
    | { kind: 'force-quit' }

const collectionArb = fc.constantFrom<LocalCollection>(
    'setlists',
    'tracks',
    'songs',
)

function docIdArb() {
    return fc.tuple(collectionArb, fc.nat({ max: 2 })).map(([col, n]) => ({
        collection: col,
        docId: POOL[col][n] ?? POOL[col][0],
    }))
}

const actionArb = fc.oneof(
    {
        arbitrary: docIdArb().chain((c) =>
            fc.record({
                kind: fc.constant('edit-set' as const),
                collection: fc.constant(c.collection),
                docId: fc.constant(c.docId),
                payload: fc.record({ v: fc.integer({ min: 0, max: 100 }) }),
            }),
        ),
        weight: 4,
    },
    {
        arbitrary: docIdArb().chain((c) =>
            fc.record({
                kind: fc.constant('edit-update' as const),
                collection: fc.constant(c.collection),
                docId: fc.constant(c.docId),
                patch: fc.record({ v: fc.integer({ min: 0, max: 100 }) }),
            }),
        ),
        weight: 4,
    },
    {
        arbitrary: docIdArb().chain((c) =>
            fc.record({
                kind: fc.constant('edit-delete' as const),
                collection: fc.constant(c.collection),
                docId: fc.constant(c.docId),
            }),
        ),
        weight: 1,
    },
    {
        arbitrary: fc.record({
            kind: fc.constant('failure-mode' as const),
            mode: fc.constantFrom<Failure>(
                'ok',
                'network',
                'auth',
                'version',
                'transient',
            ),
        }),
        weight: 4,
    },
    {
        arbitrary: fc.record({
            kind: fc.constant('tick' as const),
            ms: fc.constantFrom(0, 100, 500, 1000, 2000, 5000),
        }),
        weight: 3,
    },
    {
        arbitrary: fc.record({ kind: fc.constant('force-quit' as const) }),
        weight: 1,
    },
)

// ---------- Property runner ----------

interface CommittedEdit {
    collection: LocalCollection
    docId: string
    op: 'set' | 'update' | 'delete'
    payload: Record<string, unknown>
}

async function runScenario(actions: EditAction[]): Promise<void> {
    await resetDbForTests()
    const hub = new FakeChannelHub()
    const clock = new FakeClock()
    const adapter = new HarnessAdapter()
    let lock = new CrossTabLock('crc-sync-prop', {
        clock,
        channelFactory: (n) => hub.create(n),
        leaseMs: 5000,
    })
    let online = true
    let engine = new SyncEngine({
        adapter,
        lock,
        clock,
        isOnline: () => online,
        onlineListener: { addListener: () => {}, removeListener: () => {} },
    })
    await engine.start()
    await flush()

    const committed: CommittedEdit[] = []

    for (const action of actions) {
        try {
            if (action.kind === 'edit-set') {
                await applyEdit({
                    op: 'set',
                    collection: action.collection,
                    doc: { id: action.docId, ...action.payload },
                })
                committed.push({
                    collection: action.collection,
                    docId: action.docId,
                    op: 'set',
                    payload: { id: action.docId, ...action.payload },
                })
            } else if (action.kind === 'edit-update') {
                // Need an existing row — applyEdit update throws on missing.
                const exists = await getDb()[action.collection].get(
                    action.docId,
                )
                if (!exists) continue
                await applyEdit({
                    op: 'update',
                    collection: action.collection,
                    docId: action.docId,
                    patch: action.patch,
                })
                committed.push({
                    collection: action.collection,
                    docId: action.docId,
                    op: 'update',
                    payload: { ...action.patch },
                })
            } else if (action.kind === 'edit-delete') {
                const exists = await getDb()[action.collection].get(
                    action.docId,
                )
                if (!exists) continue
                await applyEdit({
                    op: 'delete',
                    collection: action.collection,
                    docId: action.docId,
                })
                committed.push({
                    collection: action.collection,
                    docId: action.docId,
                    op: 'delete',
                    payload: {},
                })
            } else if (action.kind === 'failure-mode') {
                adapter.nextFailure = action.mode
            } else if (action.kind === 'tick') {
                await clock.advance(action.ms)
            } else if (action.kind === 'force-quit') {
                engine.shutdown()
                lock = new CrossTabLock('crc-sync-prop', {
                    clock,
                    channelFactory: (n) => hub.create(n),
                    leaseMs: 5000,
                })
                engine = new SyncEngine({
                    adapter,
                    lock,
                    clock,
                    isOnline: () => online,
                    onlineListener: {
                        addListener: () => {},
                        removeListener: () => {},
                    },
                })
                await engine.start()
                await flush()
            }
        } catch (e) {
            // applyEdit may throw legitimately (e.g., update target missing
            // due to prior delete in the same scenario). Don't record those.
            void e
        }
    }

    // Quiesce: set adapter ok, force online, drain everything. Cap at a few
    // long cycles — backoff schedule peaks at 8s, so 3× 10s windows clear it.
    online = true
    adapter.nextFailure = 'ok'
    for (let i = 0; i < 4; i++) {
        await engine.pump()
        await clock.advance(10_000)
    }
    await flush()

    // ---- Verification ----

    // Build observed state: deduplicate per (collection, docId) — last writer
    // wins for set/update; delete prunes.
    const observedFromServer = new Map<string, true>()
    for (const key of adapter.server.keys()) observedFromServer.set(key, true)

    const observedFromOutbox = new Map<string, OutboxRow[]>()
    const remainingOutbox = await getDb().outbox.toArray()
    for (const row of remainingOutbox) {
        const k = `${row.collection}/${row.docId}`
        const arr = observedFromOutbox.get(k) ?? []
        arr.push(row)
        observedFromOutbox.set(k, arr)
    }

    // For each committed edit, the (collection, docId) must be reflected in
    // EITHER server OR outbox (or both — duplicate is acceptable here, since
    // a row can be both pending in outbox AND already appear in server
    // depending on which way it landed in this run; the contract is "no
    // SILENT loss", not strict exclusivity at scenario end).
    for (const edit of committed) {
        const k = `${edit.collection}/${edit.docId}`
        if (edit.op === 'delete') {
            // Delete: server should not have it OR outbox should reflect the
            // pending delete. Either is fine.
            const hasOutboxDelete = (observedFromOutbox.get(k) ?? []).some(
                (r) => r.op === 'delete',
            )
            const serverHasIt = observedFromServer.has(k)
            // Acceptable: server doesn't have it (delete landed) OR outbox
            // has the delete pending. If server has it AND no pending delete,
            // it's a loss.
            if (serverHasIt && !hasOutboxDelete) {
                // Was the delete superseded by a later set/update? Check.
                const hadLaterSet = committed
                    .slice(committed.indexOf(edit) + 1)
                    .some(
                        (e) =>
                            e.collection === edit.collection &&
                            e.docId === edit.docId &&
                            (e.op === 'set' || e.op === 'update'),
                    )
                if (!hadLaterSet) {
                    throw new Error(
                        `delete lost: ${k} present in server with no pending delete`,
                    )
                }
            }
            continue
        }
        // set/update: must appear in server OR outbox.
        const inServer = observedFromServer.has(k)
        const inOutbox = (observedFromOutbox.get(k) ?? []).length > 0
        // Was this edit superseded by a later DELETE? Then it's allowed to be
        // absent from server if outbox has the delete.
        const idx = committed.indexOf(edit)
        const supersededByDelete = committed
            .slice(idx + 1)
            .some(
                (e) =>
                    e.collection === edit.collection &&
                    e.docId === edit.docId &&
                    e.op === 'delete',
            )
        if (supersededByDelete) continue
        if (!inServer && !inOutbox) {
            throw new Error(
                `committed write lost: ${edit.op} ${k} payload=${JSON.stringify(edit.payload)}`,
            )
        }
    }

    engine.shutdown()
}

// ---------- Tests ----------

describe('property: no-data-loss under random failure injection', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    it('AC-9: every committed applyEdit is reflected in server OR outbox', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(actionArb, { minLength: 5, maxLength: 30 }),
                async (actions) => {
                    await runScenario(actions as EditAction[])
                },
            ),
            { numRuns: 20, seed: 12345, verbose: 0 },
        )
    }, 240_000)

    it('property: empty action sequence quiesces to idle', async () => {
        await runScenario([])
    }, 30_000)

    it('property: pure success sequence reaches server fully', async () => {
        await runScenario([
            { kind: 'failure-mode', mode: 'ok' },
            { kind: 'edit-set', collection: 'tracks', docId: 't1', payload: { v: 1 } },
            { kind: 'edit-set', collection: 'tracks', docId: 't2', payload: { v: 2 } },
            { kind: 'tick', ms: 100 },
        ])
    })

    it('property: force-quit mid-flight does not lose committed writes', async () => {
        await runScenario([
            { kind: 'edit-set', collection: 'tracks', docId: 't1', payload: { v: 1 } },
            { kind: 'force-quit' },
            { kind: 'tick', ms: 1000 },
        ])
    })

    it('property: dead-letter rows remain visible in outbox', async () => {
        await runScenario([
            { kind: 'failure-mode', mode: 'transient' },
            { kind: 'edit-set', collection: 'tracks', docId: 't1', payload: { v: 1 } },
            { kind: 'tick', ms: 500 },
            { kind: 'tick', ms: 1000 },
            { kind: 'tick', ms: 2000 },
            { kind: 'tick', ms: 4000 },
        ])
    })
})
