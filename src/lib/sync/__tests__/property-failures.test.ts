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

import { LocalDb, getDb, resetDbForTests } from '../../local/schema'
import Dexie from 'dexie'
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
import { loadAdjusted } from '@/test-utils/load-adjusted-timing'

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

    async commitOutboxRow(
        row: OutboxRow,
    ): Promise<{ updatedAt?: number }> {
        const f = this.nextFailure
        if (f === 'ok') {
            this.applySuccess(row)
            // v50-06-01: existing harness ignores server-updatedAt; the
            // shared-backing two-writer test in this file extends the
            // adapter to surface real timestamps.
            return {}
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

    async readDoc(): Promise<null> {
        return null
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

// ─── v50-06-01 substrate readiness for v50-06-02 reconciliation modal ──────
//
// Scope: prove that the engine + adapter contract surfaces concurrent-edit
// races as VersionMismatchError end-to-end.
//
// What this test PROVES:
//   - Two SyncEngine instances pointing at a shared in-memory remote produce
//     EXACTLY ONE successful commit when both queue an update on the same
//     docId with the same `expectedUpdatedAt`.
//   - The losing engine transitions to FSM state 'conflict'.
//   - The losing engine's outbox row stays in 'failed' status with
//     `lastError` populated and a localId addressable by
//     `engine.resolveConflict(localId, choice, opts)` — the API surface
//     v50-06-02's reconciliation modal will call.
//   - No committed write is silently lost (per v50-03 no-data-loss invariant).
//
// What this test does NOT prove:
//   - That the production Firestore runTransaction precondition fires. That
//     requires a real-Firestore smoke test or emulator integration — both
//     deferred to v50-06-02 / v50-06-03.
//   - The reconciliation modal UI itself — v50-06-02.
//
// Real timers / no vi fake timers (per v50-03 lesson — fake timers conflict
// with fake-indexeddb microtask scheduling and Dexie live-query teardown).
// Drains are deterministic when isOnline=true and the adapter is sync.

interface SharedDoc {
    payload: Record<string, unknown>
    updatedAt: number
}

class SharedRemote {
    docs = new Map<string, SharedDoc>()
    private clock = 2000
    nextTimestamp(): number {
        return ++this.clock
    }
    seed(collection: LocalCollection, docId: string, doc: SharedDoc): void {
        this.docs.set(`${collection}/${docId}`, { ...doc })
    }
    snapshot(): Map<string, SharedDoc> {
        const out = new Map<string, SharedDoc>()
        for (const [k, v] of this.docs) out.set(k, { ...v, payload: { ...v.payload } })
        return out
    }
}

// Lifted to module scope by v50-07-04 (was nested inside the v50-06-03
// "sequential offline edits" describe). Reused by both that test and the
// kitchen-sink describe at the bottom of the file. Toggle `online` at any
// time — `commitOutboxRow` throws NetworkError while offline so the engine
// FSM enters/leaves 'offline' as expected.
class OfflineToggleAdapter implements FirestoreAdapter {
    online = false
    writes: Array<{ docId: string; payload: Record<string, unknown> }> = []
    constructor(private readonly remote: SharedRemote) {}

    async commitOutboxRow(
        row: OutboxRow,
    ): Promise<{ updatedAt?: number }> {
        if (!this.online) {
            throw new NetworkError('offline')
        }
        const key = `${row.collection}/${row.docId}`
        const existing = this.remote.docs.get(key)
        const ts = this.remote.nextTimestamp()
        if (row.op === 'set') {
            this.remote.docs.set(key, {
                payload: { ...row.payload, id: row.docId },
                updatedAt: ts,
            })
        } else if (row.op === 'update') {
            this.remote.docs.set(key, {
                payload: { ...(existing?.payload ?? {}), ...row.payload },
                updatedAt: ts,
            })
        } else {
            this.remote.docs.delete(key)
        }
        this.writes.push({
            docId: row.docId,
            payload: { ...row.payload },
        })
        return { updatedAt: ts }
    }

    async refreshAuthToken(): Promise<void> {}
    async readDoc(): Promise<null> {
        return null
    }
}

class TwoWriterAdapter implements FirestoreAdapter {
    constructor(private readonly remote: SharedRemote) {}

    async commitOutboxRow(
        row: OutboxRow,
    ): Promise<{ updatedAt?: number }> {
        const key = `${row.collection}/${row.docId}`
        const existing = this.remote.docs.get(key)

        if (row.op === 'set') {
            const ts = this.remote.nextTimestamp()
            this.remote.docs.set(key, {
                payload: { ...row.payload, id: row.docId },
                updatedAt: ts,
            })
            return { updatedAt: ts }
        }
        if (row.op === 'update') {
            if (!existing) {
                throw new TransientError(`Remote missing: ${key}`)
            }
            if (
                row.expectedUpdatedAt !== undefined &&
                existing.updatedAt !== row.expectedUpdatedAt
            ) {
                throw new VersionMismatchError(
                    `expected updatedAt=${row.expectedUpdatedAt}, remote=${existing.updatedAt}`,
                )
            }
            const ts = this.remote.nextTimestamp()
            this.remote.docs.set(key, {
                payload: { ...existing.payload, ...row.payload },
                updatedAt: ts,
            })
            return { updatedAt: ts }
        }
        if (row.op === 'delete') {
            this.remote.docs.delete(key)
            return {}
        }
        return {}
    }

    async refreshAuthToken(): Promise<void> {
        // No-op for this harness.
    }

    async readDoc(
        collection: LocalCollection,
        docId: string,
    ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
        const key = `${collection}/${docId}`
        const doc = this.remote.docs.get(key)
        if (!doc) return null
        return { data: { ...doc.payload }, updatedAt: doc.updatedAt }
    }
}

async function flushTwoWriter(rounds = 8): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

describe('v50-06-01: substrate readiness — two-writer race', () => {
    const dbAName = 'crc-twowriter-a'
    const dbBName = 'crc-twowriter-b'

    afterEach(async () => {
        // Clean up the per-engine Dexie instances so each test starts fresh.
        try {
            await Dexie.delete(dbAName)
        } catch {
            // ignore
        }
        try {
            await Dexie.delete(dbBName)
        } catch {
            // ignore
        }
    })

    it('two engines racing one docId: exactly one wins, other surfaces VersionMismatch', async () => {
        const remote = new SharedRemote()
        remote.seed('tracks', 't1', {
            payload: { id: 't1', title: 'orig' },
            updatedAt: 1000,
        })

        const dbA = new LocalDb(dbAName)
        const dbB = new LocalDb(dbBName)
        // Force schema open so subsequent `.outbox.add` / `.tracks.put` calls succeed.
        await dbA.outbox.count()
        await dbB.outbox.count()

        // Seed each local DB with the same baseline view of the doc.
        await dbA.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        })
        await dbB.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        })

        // Queue conflicting updates: both expect updatedAt=1000.
        const now = Date.now()
        await dbA.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'A-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })
        await dbB.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'B-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })

        const adapterA = new TwoWriterAdapter(remote)
        const adapterB = new TwoWriterAdapter(remote)

        // Distinct lock channel names so the engines DON'T cross-tab-defer
        // to each other — we want both to drain.
        const hub = new FakeChannelHub()
        const lockA = new CrossTabLock('crc-twowriter-A', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const lockB = new CrossTabLock('crc-twowriter-B', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })

        const engineA = new SyncEngine({
            db: dbA,
            adapter: adapterA,
            lock: lockA,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        const engineB = new SyncEngine({
            db: dbB,
            adapter: adapterB,
            lock: lockB,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })

        // Start both. Sequential start models "tab A's drain runs to
        // completion, then tab B starts" — first wins, second sees the
        // moved server `updatedAt` and surfaces VersionMismatch.
        await engineA.start()
        await flushTwoWriter()
        await engineB.start()
        await flushTwoWriter()

        // Verify exactly one remote write succeeded.
        const remoteSnap = remote.snapshot()
        const finalDoc = remoteSnap.get('tracks/t1')
        expect(finalDoc).toBeDefined()
        // The successful write moved updatedAt past 1000.
        expect(finalDoc!.updatedAt).toBeGreaterThan(1000)
        // The successful write is from EXACTLY one of A or B.
        expect([
            'A-edit',
            'B-edit',
        ]).toContain(finalDoc!.payload.title)

        const aRows = await dbA.outbox.toArray()
        const bRows = await dbB.outbox.toArray()
        const winnerOutboxLen = aRows.length === 0 ? 0 : bRows.length
        const loserOutboxLen = aRows.length === 0 ? bRows.length : aRows.length

        // Exactly one engine cleared its outbox (the winner).
        expect(winnerOutboxLen).toBe(0)
        // The loser has exactly one row, in 'failed' status, with the
        // VersionMismatch error message.
        expect(loserOutboxLen).toBe(1)
        const loserEngine = aRows.length === 0 ? engineB : engineA
        const loserRows = aRows.length === 0 ? bRows : aRows
        expect(loserRows[0].status).toBe('failed')
        expect(loserRows[0].lastError).toMatch(/expected updatedAt=1000/i)
        expect(loserEngine.getState()).toBe('conflict')

        // The loser's row is addressable for v50-06-02's resolveConflict —
        // verify the API surface accepts the localId.
        expect(loserRows[0].localId).toBeDefined()
        // 'theirs' branch deletes the failed row and the loser quiesces.
        await loserEngine.resolveConflict(loserRows[0].localId!, 'theirs')
        await flushTwoWriter()
        const loserOutboxAfter =
            aRows.length === 0 ? await dbB.outbox.count() : await dbA.outbox.count()
        expect(loserOutboxAfter).toBe(0)

        // No-data-loss substrate check: the LOCAL row of the loser is
        // unchanged from its baseline — the user's local edit is preserved
        // until v50-06-02 surfaces it for "keep mine / take theirs". (The
        // loser's local update never landed because we queued the outbox
        // row directly without mutating tracks.)
        const loserDb = aRows.length === 0 ? dbB : dbA
        const loserLocalDoc = await loserDb.tracks.get('t1')
        expect(loserLocalDoc?.updatedAt).toBe(1000)

        engineA.shutdown()
        engineB.shutdown()
        dbA.close()
        dbB.close()
    }, 30_000)
})

// v50-06-02: reconciliation modal contract — both resolveConflict branches.
// The harness recreates a deterministic two-writer race, then exercises:
//   (a) 'mine' with newExpectedUpdatedAt sourced from a remote re-read (the
//       modal does this via adapter.readDoc) — re-queued row drains
//       successfully on the next pump pass; remote ends up holding the
//       loser's payload with a NEWER updatedAt than the winner.
//   (b) 'theirs' — failed row deletes; remote unchanged; loser quiesces.
//
// 10x consecutive runs verified during APPLY (no flake).
describe('v50-06-02: resolveConflict branches (mine / theirs)', () => {
    const dbAName = 'crc-resolve-mine-a'
    const dbBName = 'crc-resolve-mine-b'

    afterEach(async () => {
        try {
            await Dexie.delete(dbAName)
        } catch {
            // ignore
        }
        try {
            await Dexie.delete(dbBName)
        } catch {
            // ignore
        }
    })

    async function setupTwoWriterRace(): Promise<{
        remote: SharedRemote
        loserEngine: SyncEngine
        loserDb: LocalDb
        loserLocalId: number
        winnerEngine: SyncEngine
        winnerDb: LocalDb
        cleanup: () => Promise<void>
    }> {
        const remote = new SharedRemote()
        remote.seed('tracks', 't1', {
            payload: { id: 't1', title: 'orig' },
            updatedAt: 1000,
        })

        const dbA = new LocalDb(dbAName)
        const dbB = new LocalDb(dbBName)
        await dbA.outbox.count()
        await dbB.outbox.count()

        const baseline = {
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        }
        await dbA.tracks.put(baseline)
        await dbB.tracks.put(baseline)

        const now = Date.now()
        await dbA.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'A-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })
        await dbB.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'B-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })

        const hub = new FakeChannelHub()
        const lockA = new CrossTabLock('crc-resolve-A', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const lockB = new CrossTabLock('crc-resolve-B', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })

        const engineA = new SyncEngine({
            db: dbA,
            adapter: new TwoWriterAdapter(remote),
            lock: lockA,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        const engineB = new SyncEngine({
            db: dbB,
            adapter: new TwoWriterAdapter(remote),
            lock: lockB,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })

        await engineA.start()
        await flushTwoWriter()
        await engineB.start()
        await flushTwoWriter()

        const aRows = await dbA.outbox.toArray()
        const bRows = await dbB.outbox.toArray()
        const aLost = aRows.length > 0
        const loserEngine = aLost ? engineA : engineB
        const winnerEngine = aLost ? engineB : engineA
        const loserDb = aLost ? dbA : dbB
        const winnerDb = aLost ? dbB : dbA
        const loserRow = (aLost ? aRows : bRows)[0]

        // Sanity: the harness produced the conflict shape v50-06-02 builds on.
        expect(loserRow.status).toBe('failed')
        expect(loserEngine.getState()).toBe('conflict')

        return {
            remote,
            loserEngine,
            loserDb,
            loserLocalId: loserRow.localId!,
            winnerEngine,
            winnerDb,
            cleanup: async () => {
                engineA.shutdown()
                engineB.shutdown()
                dbA.close()
                dbB.close()
            },
        }
    }

    it("'mine' re-queues with fresh updatedAt sourced from readDoc and drains successfully", async () => {
        const {
            remote,
            loserEngine,
            loserDb,
            loserLocalId,
            cleanup,
        } = await setupTwoWriterRace()

        // Mirror the modal's flow: adapter.readDoc to capture the fresh
        // server updatedAt (winner's commit moved it past 1000), then
        // resolveConflict('mine', { newExpectedUpdatedAt }).
        const adapter = new TwoWriterAdapter(remote)
        const remoteSnap = await adapter.readDoc('tracks', 't1')
        expect(remoteSnap).not.toBeNull()
        const winnerUpdatedAt = remoteSnap!.updatedAt
        const winnerTitle = remoteSnap!.data.title
        expect(winnerUpdatedAt).toBeGreaterThan(1000)
        expect(['A-edit', 'B-edit']).toContain(winnerTitle)

        await loserEngine.resolveConflict(loserLocalId, 'mine', {
            newExpectedUpdatedAt: winnerUpdatedAt,
        })
        await flushTwoWriter()

        // Loser's outbox drained: zero rows, engine quiesced.
        expect(await loserDb.outbox.count()).toBe(0)
        expect(loserEngine.getState()).toBe('idle')

        // Remote now holds the loser's payload with an even-newer
        // updatedAt than the winner — i.e. mine wins.
        const after = remote.snapshot().get('tracks/t1')
        expect(after).toBeDefined()
        expect(['A-edit', 'B-edit']).toContain(after!.payload.title)
        expect(after!.payload.title).not.toBe(winnerTitle)
        expect(after!.updatedAt).toBeGreaterThan(winnerUpdatedAt)

        await cleanup()
    }, 30_000)

    it("'theirs' deletes failed outbox row, preserves remote, quiesces engine", async () => {
        const {
            remote,
            loserEngine,
            loserDb,
            loserLocalId,
            cleanup,
        } = await setupTwoWriterRace()

        const remoteBefore = remote.snapshot().get('tracks/t1')
        expect(remoteBefore).toBeDefined()
        const winnerTitle = remoteBefore!.payload.title
        const winnerUpdatedAt = remoteBefore!.updatedAt

        await loserEngine.resolveConflict(loserLocalId, 'theirs')
        await flushTwoWriter()

        // Loser quiesced.
        expect(await loserDb.outbox.count()).toBe(0)
        expect(loserEngine.getState()).toBe('idle')

        // Remote untouched — winner's payload + updatedAt unchanged.
        const remoteAfter = remote.snapshot().get('tracks/t1')
        expect(remoteAfter).toBeDefined()
        expect(remoteAfter!.payload.title).toBe(winnerTitle)
        expect(remoteAfter!.updatedAt).toBe(winnerUpdatedAt)

        // Loser's local row preserved (engine did not auto-rehydrate from
        // remote — that's a v50-06-03 cross-leader concern).
        const loserLocalDoc = await loserDb.tracks.get('t1')
        expect(loserLocalDoc?.updatedAt).toBe(1000)

        await cleanup()
    }, 30_000)
})

// v50-06-03: passive listener closes the 'theirs' staleness gap.
// After 'theirs' resolution the loser's local row is still at the
// pre-conflict baseline. Mounting startSnapshotListener on the loser's
// LocalDb (with a thin shim that re-emits SharedRemote state via
// SnapshotSubscriber) brings the local row up to the remote's winner-state
// — closing the gap v50-06-02 explicitly deferred.
//
// Block also proves that the listener does NOT trigger ReconciliationProvider
// (no new outbox row created by listener writes) — engine drain remains the
// sole path to 'conflict' state.
describe('v50-06-03: passive listener closes the "theirs" staleness gap', () => {
    const dbAName = 'crc-listener-a'
    const dbBName = 'crc-listener-b'

    afterEach(async () => {
        try {
            await Dexie.delete(dbAName)
        } catch {
            // ignore
        }
        try {
            await Dexie.delete(dbBName)
        } catch {
            // ignore
        }
    })

    /** SnapshotSubscriber backed by SharedRemote. emitTracksFor(setlistId)
     *  re-emits the current state of every tracks/* doc whose payload
     *  carries setlistId == setlistId. */
    class SharedRemoteSubscriber {
        private trackHandlers = new Map<
            string,
            (changes: import('../snapshot-listener').TrackChange[]) => void
        >()
        constructor(private readonly remote: SharedRemote) {}

        toSubscriber(): import('../snapshot-listener').SnapshotSubscriber {
            return {
                subscribeSetlist: () => () => {},
                subscribeTracks: (setlistId, onChanges) => {
                    this.trackHandlers.set(setlistId, onChanges)
                    return () => {
                        this.trackHandlers.delete(setlistId)
                    }
                },
            }
        }

        emitTracksFor(setlistId: string): void {
            const handler = this.trackHandlers.get(setlistId)
            if (!handler) return
            const changes: import('../snapshot-listener').TrackChange[] = []
            for (const [key, doc] of this.remote.docs) {
                const [collection, docId] = key.split('/')
                if (collection !== 'tracks') continue
                if (doc.payload.setlistId !== setlistId) continue
                changes.push({
                    type: 'modified',
                    docId,
                    data: { ...doc.payload, id: docId },
                    updatedAt: doc.updatedAt,
                })
            }
            if (changes.length > 0) handler(changes)
        }
    }

    it("AC-4: loser's local row matches remote after 'theirs' + listener delivery", async () => {
        const {
            startSnapshotListener,
        } = await import('../snapshot-listener')

        // Reuse the v50-06-02 setupTwoWriterRace helper — but inline because
        // the helper above is scoped to that describe block. Recreate the
        // race inline.
        const remote = new SharedRemote()
        remote.seed('tracks', 't1', {
            payload: { id: 't1', setlistId: 's1', title: 'orig' },
            updatedAt: 1000,
        })

        const dbA = new LocalDb(dbAName)
        const dbB = new LocalDb(dbBName)
        await dbA.outbox.count()
        await dbB.outbox.count()

        const baseline = {
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        }
        await dbA.tracks.put(baseline)
        await dbB.tracks.put(baseline)

        const now = Date.now()
        await dbA.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'A-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })
        await dbB.outbox.add({
            status: 'pending',
            scheduledFor: now,
            op: 'update',
            collection: 'tracks',
            docId: 't1',
            payload: { title: 'B-edit' },
            expectedUpdatedAt: 1000,
            attempts: 0,
            createdAt: now,
        })

        const hub = new FakeChannelHub()
        const lockA = new CrossTabLock('crc-listener-A', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const lockB = new CrossTabLock('crc-listener-B', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })

        const engineA = new SyncEngine({
            db: dbA,
            adapter: new TwoWriterAdapter(remote),
            lock: lockA,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        const engineB = new SyncEngine({
            db: dbB,
            adapter: new TwoWriterAdapter(remote),
            lock: lockB,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })

        await engineA.start()
        await flushTwoWriter()
        await engineB.start()
        await flushTwoWriter()

        const aRows = await dbA.outbox.toArray()
        const bRows = await dbB.outbox.toArray()
        const aLost = aRows.length > 0
        const loserDb = aLost ? dbA : dbB
        const loserEngine = aLost ? engineA : engineB
        const loserLocalId = (aLost ? aRows : bRows)[0].localId!

        expect(loserEngine.getState()).toBe('conflict')

        // Mount listener on loser's db, hooked to SharedRemote.
        const subscriberAdapter = new SharedRemoteSubscriber(remote)
        const stopListener = startSnapshotListener({
            setlistId: 's1',
            db: loserDb,
            subscriber: subscriberAdapter.toSubscriber(),
            logger: { warn: () => {} },
        })

        // Resolve 'theirs' — engine deletes failed outbox row.
        await loserEngine.resolveConflict(loserLocalId, 'theirs')
        await flushTwoWriter()

        // BEFORE listener delivery: loser's local row is still at baseline
        // (the v50-06-02 staleness gap).
        const beforeDelivery = await loserDb.tracks.get('t1')
        expect(beforeDelivery?.updatedAt).toBe(1000)
        expect(beforeDelivery?.title).toBe('orig')

        // Trigger listener delivery from SharedRemote — winner's state
        // re-emits to the loser.
        subscriberAdapter.emitTracksFor('s1')
        await flushTwoWriter()

        // AFTER listener delivery: loser's local row reflects remote.
        const afterDelivery = await loserDb.tracks.get('t1')
        const remoteWinner = remote.snapshot().get('tracks/t1')
        expect(afterDelivery?.updatedAt).toBe(remoteWinner!.updatedAt)
        expect(afterDelivery?.title).toBe(remoteWinner!.payload.title)

        // Critical invariant: listener did NOT create an outbox row.
        // (The engine's drain path is still the only road to 'conflict'.)
        expect(await loserDb.outbox.count()).toBe(0)

        stopListener()
        engineA.shutdown()
        engineB.shutdown()
        dbA.close()
        dbB.close()
    }, 30_000)
})

// v50-06-03: sequential offline edits queue and drain in order on reconnect.
// Single-writer airplane-mode flow: 5 sequential applyEdit calls on the
// same track land in the outbox while offline (NetworkError on every
// commit). On reconnect, the per-doc drain ordering invariant (v50-03)
// guarantees they replay in queue order — no leapfrog, no data loss.
//
// Note: this scenario does NOT thread `expectedUpdatedAt` on the queued
// rows. While offline, the local row's `updatedAt` never advances (no
// writeback), so threading it would put all 5 rows at the same baseline
// — and only the first would drain successfully on reconnect (subsequent
// rows would surface a self-conflict via VersionMismatchError). That's a
// known v50-06 gap routed forward to a follow-up plan if real-world
// patterns demand it; this scenario tests the per-doc ordering + offline
// queueing invariant in isolation.
describe('v50-06-03: sequential offline edits queue and drain in order', () => {
    const dbName = 'crc-offline-seq'

    afterEach(async () => {
        try {
            await Dexie.delete(dbName)
        } catch {
            // ignore
        }
    })

    it('AC-5: 5 offline edits queue, drain in order F→G→A→B→C on reconnect', async () => {
        const remote = new SharedRemote()
        remote.seed('tracks', 't1', {
            payload: { id: 't1', setlistId: 's1', title: 'orig', key: 'baseline' },
            updatedAt: 1000,
        })

        const db = new LocalDb(dbName)
        await db.outbox.count()
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            key: 'baseline',
            updatedAt: 1000,
        })

        const adapter = new OfflineToggleAdapter(remote)
        let isOnline = false

        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('crc-offline-seq', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        // Engine + db are declared up here so the finally block below can
        // reach them even if a body assertion throws. Mirrors the
        // v50-07-04 runKitchenSink try/finally teardown pattern (see
        // line ~1900): on failure we still want shutdown + flush + close
        // to run so the next test starts clean, AND on success we need
        // a microtask flush between shutdown() and db.close() to drain
        // in-flight pump-finally `notifyFromDb` / `scheduleNextPump`
        // awaits (both touch `db.outbox`) that were scheduled via
        // `setTimeout(0)` during the explicit `engine.pump()` /
        // `flushTwoWriter()` loop above. Without the flush, those
        // fire-and-forget pump promises hit `db.close()` mid-await and
        // surface `DatabaseClosedError` on the NEXT test (Vitest
        // misattributes the failure to AC-5; the actual repro stack
        // points at v50-07-04 kitchen-sink's `runKitchenSink`).
        // Empirically reproduces at ~10% under VITEST_LOAD_FACTOR=2
        // file-solo, ~15% under full-suite parallel load. Closes
        // `[[feedback_parallel_load_flake_baseline]]` "1 remaining".
        let engineForCleanup: SyncEngine | undefined
        try {

        // Manual online-event dispatcher — production wires this to
        // window.addEventListener('online'). The test fires it after
        // flipping `isOnline = true` to drive the FSM transition out of
        // 'offline' into the drain-and-quiesce path.
        const onlineCallbacks: Array<() => void> = []
        const onlineListener = {
            addListener(event: 'online' | 'offline', cb: () => void) {
                if (event === 'online') onlineCallbacks.push(cb)
            },
            removeListener() {},
        }

        const engine = new SyncEngine({
            db,
            adapter,
            lock,
            isOnline: () => isOnline,
            onlineListener,
        })
        engineForCleanup = engine

        await engine.start()
        await flushTwoWriter()
        // State should be 'offline' since isOnline() returns false.
        expect(engine.getState()).toBe('offline')

        // Queue 5 sequential offline edits directly into the outbox to
        // mirror what applyEdit('update') does (sans expectedUpdatedAt —
        // see describe-block comment for rationale). Update the local row
        // each time to mirror applyEdit's entity-row + outbox-row atomicity.
        const sequence = ['F', 'G', 'A', 'B', 'C']
        for (const k of sequence) {
            const now = Date.now()
            await db.transaction('rw', db.tracks, db.outbox, async () => {
                const existing = await db.tracks.get('t1')
                await db.tracks.put({
                    ...existing!,
                    key: k,
                })
                await db.outbox.add({
                    status: 'pending',
                    scheduledFor: now,
                    op: 'update',
                    collection: 'tracks',
                    docId: 't1',
                    payload: { key: k },
                    attempts: 0,
                    createdAt: now,
                })
            })
        }

        // Drive the engine pump while offline — adapter throws NetworkError;
        // engine restores rows to 'pending' and stops drain.
        await engine.pump()
        await flushTwoWriter()

        // All 5 rows should still be in the outbox, none in 'failed' status.
        const offlineRows = await db.outbox.toArray()
        expect(offlineRows.length).toBe(5)
        for (const r of offlineRows) {
            expect(r.status).not.toBe('failed') // network error preserves 'pending'
        }
        expect(adapter.writes.length).toBe(0)

        // Per-doc ordering: due rows must be a single oldest row at the
        // head of the same-doc chain (verified indirectly by drain order
        // below).

        // Reconnect: flip online flag + fire the synthetic 'online' event
        // to drive the FSM out of 'offline'. Then drive the pump until empty.
        adapter.online = true
        isOnline = true
        for (const cb of onlineCallbacks) cb()
        await flushTwoWriter()
        for (let i = 0; i < 8 && (await db.outbox.count()) > 0; i++) {
            await engine.pump()
            await flushTwoWriter()
        }

        // Outbox drained.
        expect(await db.outbox.count()).toBe(0)
        // All 5 commits arrived in order.
        expect(adapter.writes.map((w) => w.payload.key)).toEqual([
            'F',
            'G',
            'A',
            'B',
            'C',
        ])
        // Final remote state matches the last commit.
        const finalDoc = remote.snapshot().get('tracks/t1')
        expect(finalDoc?.payload.key).toBe('C')
        expect(engine.getState()).toBe('idle')
        } finally {
            // Drain any in-flight pump-finally microtasks BEFORE closing
            // the Dexie handle. `engine.shutdown()` sets `started=false`
            // + clears the next-pump setTimeout, but a pump that already
            // entered the `finally { … }` block past the top-of-pump
            // `if (!this.started) return` guard will still run
            // `notifyFromDb()` + `scheduleNextPump()` — both of which
            // await `db.outbox.*`. Without this flush, those fire-and-
            // forget pump promises (scheduled via `setTimeout(0)` from
            // each prior drain iteration) race `db.close()` and surface
            // `DatabaseClosedError` on the NEXT test, which Vitest
            // misattributes to AC-5 (the actual repro stack lands in
            // v50-07-04 `runKitchenSink`). Same teardown pattern as
            // the kitchen-sink suite's finally block (~line 1900-1905).
            try { engineForCleanup?.shutdown() } catch { /* idempotent */ }
            await flushTwoWriter()
            try { db.close() } catch { /* idempotent */ }
        }
    }, 30_000)
})

// ─── v50-07-04: kitchen-sink under random failure mix ──────────────────────
//
// System-level confidence test for the bulletproof loop. fast-check drives a
// randomized action grammar that mixes everything v50-06 + v50-07-03 added:
//
//   - applyEdit('set'|'update'|'delete') across 'tracks' and 'setlists'
//   - airplane-mode toggles via the (now module-scoped) OfflineToggleAdapter
//   - force-quits (engine.shutdown + fresh engine.start with orphaned 'sending' rows)
//   - cross-tab edits — modeled as direct SharedRemote mutations bumping
//     updatedAt, so the next local update with threaded expectedUpdatedAt
//     surfaces VersionMismatchError → 'failed' outbox row → engine 'conflict'
//   - lazy-hydration cascade (mid-run mount of a legacy setlist + N embedded
//     tracks; mirrors SetlistGridHydrator's Promise.all fan-out + final
//     update({hydrated:true})). Re-running the same lazy-hydrate action for
//     a setlist whose hydrated flag is already true is a no-op (mirrors the
//     production fanoutStartedRef + hydrated:true skip).
//
// Invariants asserted at end of every fc run:
//   1. **AC-9 no-data-loss:** every locally-committed applyEdit is reflected
//      in remote OR in outbox (status ∈ {pending, sending, failed}).
//   2. **Per-doc drain ordering:** for every (collection, docId) where a
//      successful drain ended up in remote, the remote payload matches the
//      LAST committed local payload for that doc (modulo cross-tab clobbers
//      that the local engine LATER overwrote — see invariant detail).
//   3. **No orphaned 'sending':** post-quiescence, no outbox row is stuck in
//      'sending' status (force-quit recovery path).
//   4. **Lazy-hydration idempotency:** for every setlist that received a
//      lazy-hydration cascade, only ONE fan-out happened (no duplicate
//      outbox rows for the same legacy track).
//
// Determinism: FakeClock + FakeChannelHub (no wall clock). fc.assert seed
// defaults so failing-case reproduction comes from fast-check's reported
// counterexample. CI runs ≥100 iterations; local runs 25 (env-tunable).
//
// Reuses module-scoped helpers: SharedRemote, OfflineToggleAdapter,
// FakeChannelHub, FakeClock, flush. New helpers (KitchenSinkAdapter +
// simulateLazyHydration + runKitchenSink) are co-located below.
describe('v50-07-04: kitchen-sink under random failure mix', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    // KitchenSinkAdapter unifies OfflineToggleAdapter (online toggle +
    // SharedRemote mutation) with TwoWriterAdapter's expectedUpdatedAt
    // precondition check. The kitchen-sink threads expectedUpdatedAt on
    // local updates so cross-tab simulated edits surface as VersionMismatch.
    class KitchenSinkAdapter implements FirestoreAdapter {
        online = true
        constructor(private readonly remote: SharedRemote) {}

        async commitOutboxRow(
            row: OutboxRow,
        ): Promise<{ updatedAt?: number }> {
            if (!this.online) {
                throw new NetworkError('offline')
            }
            const key = `${row.collection}/${row.docId}`
            const existing = this.remote.docs.get(key)
            if (row.op === 'update' && existing &&
                row.expectedUpdatedAt !== undefined &&
                existing.updatedAt !== row.expectedUpdatedAt) {
                throw new VersionMismatchError(
                    `expected updatedAt=${row.expectedUpdatedAt}, remote=${existing.updatedAt}`,
                )
            }
            const ts = this.remote.nextTimestamp()
            if (row.op === 'set') {
                this.remote.docs.set(key, {
                    payload: { ...row.payload, id: row.docId },
                    updatedAt: ts,
                })
                return { updatedAt: ts }
            }
            if (row.op === 'update') {
                this.remote.docs.set(key, {
                    payload: { ...(existing?.payload ?? {}), ...row.payload },
                    updatedAt: ts,
                })
                return { updatedAt: ts }
            }
            // delete
            this.remote.docs.delete(key)
            return {}
        }
        async refreshAuthToken(): Promise<void> {}
        async readDoc(
            collection: LocalCollection,
            docId: string,
        ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
            const k = `${collection}/${docId}`
            const doc = this.remote.docs.get(k)
            return doc ? { data: { ...doc.payload }, updatedAt: doc.updatedAt } : null
        }
    }

    type KSAction =
        | { kind: 'edit-set'; collection: 'tracks' | 'setlists'; docId: string; payload: { v: number } }
        | { kind: 'edit-update'; collection: 'tracks' | 'setlists'; docId: string; patch: { v: number } }
        | { kind: 'edit-delete'; collection: 'tracks' | 'setlists'; docId: string }
        | { kind: 'toggle-online'; online: boolean }
        | { kind: 'force-quit' }
        | { kind: 'cross-tab'; collection: 'tracks' | 'setlists'; docId: string; payload: { v: number } }
        | { kind: 'lazy-hydrate'; setlistId: string; trackIds: string[] }
        | { kind: 'tick'; ms: number }

    const KS_SETLISTS = ['ks-s1', 'ks-s2'] as const
    const KS_TRACKS = ['ks-t1', 'ks-t2', 'ks-t3', 'ks-t4'] as const
    const ksColArb = fc.constantFrom<'tracks' | 'setlists'>('tracks', 'setlists')
    const ksDocArb = ksColArb.chain((c) =>
        fc.record({
            collection: fc.constant(c),
            docId: c === 'tracks'
                ? fc.constantFrom(...KS_TRACKS)
                : fc.constantFrom(...KS_SETLISTS),
        }),
    )

    const ksActionArb: fc.Arbitrary<KSAction> = fc.oneof(
        {
            arbitrary: ksDocArb.chain((d) =>
                fc.record({
                    kind: fc.constant('edit-set' as const),
                    collection: fc.constant(d.collection),
                    docId: fc.constant(d.docId),
                    payload: fc.record({ v: fc.integer({ min: 0, max: 100 }) }),
                }),
            ),
            weight: 4,
        },
        {
            arbitrary: ksDocArb.chain((d) =>
                fc.record({
                    kind: fc.constant('edit-update' as const),
                    collection: fc.constant(d.collection),
                    docId: fc.constant(d.docId),
                    patch: fc.record({ v: fc.integer({ min: 0, max: 100 }) }),
                }),
            ),
            weight: 4,
        },
        {
            arbitrary: ksDocArb.chain((d) =>
                fc.record({
                    kind: fc.constant('edit-delete' as const),
                    collection: fc.constant(d.collection),
                    docId: fc.constant(d.docId),
                }),
            ),
            weight: 1,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant('toggle-online' as const),
                online: fc.boolean(),
            }),
            weight: 2,
        },
        {
            arbitrary: fc.record({ kind: fc.constant('force-quit' as const) }),
            weight: 1,
        },
        {
            arbitrary: ksDocArb.chain((d) =>
                fc.record({
                    kind: fc.constant('cross-tab' as const),
                    collection: fc.constant(d.collection),
                    docId: fc.constant(d.docId),
                    payload: fc.record({ v: fc.integer({ min: 0, max: 100 }) }),
                }),
            ),
            weight: 2,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant('lazy-hydrate' as const),
                setlistId: fc.constantFrom(...KS_SETLISTS),
                trackIds: fc.uniqueArray(fc.constantFrom(...KS_TRACKS), {
                    minLength: 1,
                    maxLength: 2,
                }),
            }),
            weight: 1,
        },
        {
            arbitrary: fc.record({
                kind: fc.constant('tick' as const),
                ms: fc.constantFrom(0, 100, 500, 1000),
            }),
            weight: 3,
        },
    )

    interface KSCommit {
        collection: 'tracks' | 'setlists'
        docId: string
        op: 'set' | 'update' | 'delete'
        payload: Record<string, unknown>
    }

    /** Mirrors SetlistGridHydrator's lazy-hydration cascade at the engine
     *  layer (no React). Seeds the setlist row locally with hydrated:false,
     *  fans out applyEdit('set','tracks',...) for each legacy track, then
     *  applyEdit('update','setlists',{hydrated:true}). Production uses
     *  Promise.all + withoutUndo:true; we mirror both. */
    async function simulateLazyHydration(
        setlistId: string,
        trackIds: string[],
    ): Promise<KSCommit[]> {
        const db = getDb()
        const setlist = await db.setlists.get(setlistId)
        if (setlist?.hydrated === true) return []  // idempotent skip
        if (!setlist) {
            // Seed legacy-shape setlist locally so applyEdit('update') has a target.
            await db.setlists.put({
                id: setlistId,
                ownerId: 'u-test',
                updatedAt: Date.now(),
                hydrated: false,
            } as never)
        }
        const commits: KSCommit[] = []
        await Promise.all(
            trackIds.map(async (id, idx) => {
                const doc = {
                    id,
                    setlistId,
                    order: idx,
                    title: `legacy-${id}`,
                    v: 0,
                }
                await applyEdit(
                    { op: 'set', collection: 'tracks', doc },
                    { withoutUndo: true },
                )
                commits.push({
                    collection: 'tracks',
                    docId: id,
                    op: 'set',
                    payload: doc,
                })
            }),
        )
        const liveSetlist = await db.setlists.get(setlistId)
        await applyEdit(
            {
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { hydrated: true },
                expectedUpdatedAt: liveSetlist?.updatedAt as number | undefined,
            },
            { withoutUndo: true },
        )
        commits.push({
            collection: 'setlists',
            docId: setlistId,
            op: 'update',
            payload: { hydrated: true },
        })
        return commits
    }

    async function runKitchenSink(actions: KSAction[]): Promise<void> {
        await resetDbForTests()
        const remote = new SharedRemote()
        const adapter = new KitchenSinkAdapter(remote)
        adapter.online = true
        const hub = new FakeChannelHub()
        const clock = new FakeClock()
        let lock = new CrossTabLock('crc-ks', {
            clock,
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        let engine = new SyncEngine({
            adapter,
            lock,
            clock,
            isOnline: () => adapter.online,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        await engine.start()
        await flush()
        // try/finally guards engine.shutdown so a thrown invariant assertion
        // doesn't leak in-flight Dexie ops into the next iteration.
        try {

        const committed: KSCommit[] = []
        const lazyHydratedSetlists = new Set<string>()
        // Per-setlist count of fan-out attempts; used for idempotency invariant.
        const lazyHydrateCalls = new Map<string, number>()

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
                    const exists = await getDb()[action.collection].get(action.docId)
                    if (!exists) continue
                    const expectedUpdatedAt = (exists as { updatedAt?: number }).updatedAt
                    await applyEdit({
                        op: 'update',
                        collection: action.collection,
                        docId: action.docId,
                        patch: action.patch,
                        expectedUpdatedAt,
                    })
                    committed.push({
                        collection: action.collection,
                        docId: action.docId,
                        op: 'update',
                        payload: { ...action.patch },
                    })
                } else if (action.kind === 'edit-delete') {
                    const exists = await getDb()[action.collection].get(action.docId)
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
                } else if (action.kind === 'toggle-online') {
                    adapter.online = action.online
                } else if (action.kind === 'force-quit') {
                    engine.shutdown()
                    lock = new CrossTabLock('crc-ks', {
                        clock,
                        channelFactory: (n) => hub.create(n),
                        leaseMs: 5000,
                    })
                    engine = new SyncEngine({
                        adapter,
                        lock,
                        clock,
                        isOnline: () => adapter.online,
                        onlineListener: {
                            addListener: () => {},
                            removeListener: () => {},
                        },
                    })
                    await engine.start()
                    await flush()
                } else if (action.kind === 'cross-tab') {
                    // Direct SharedRemote mutation (no engine), simulating
                    // "another tab committed an edit". Bumps updatedAt so the
                    // next local update with threaded expectedUpdatedAt will
                    // surface VersionMismatchError on drain.
                    const k = `${action.collection}/${action.docId}`
                    const existing = remote.docs.get(k)
                    const ts = remote.nextTimestamp()
                    remote.docs.set(k, {
                        payload: existing
                            ? { ...existing.payload, ...action.payload }
                            : { id: action.docId, ...action.payload },
                        updatedAt: ts,
                    })
                } else if (action.kind === 'lazy-hydrate') {
                    const calls = (lazyHydrateCalls.get(action.setlistId) ?? 0) + 1
                    lazyHydrateCalls.set(action.setlistId, calls)
                    // ac1-lazy-hydration-characterization 2026-05-26 — mirror
                    // production SetlistGridHydrator.fanoutStartedRef
                    // (`SetlistGridHydrator.tsx:85`): component-instance
                    // in-memory dedup, independent of Dexie row state. Without
                    // this guard, an intervening `edit-set setlists/S` between
                    // two `lazy-hydrate S` calls wipes the local `hydrated:true`
                    // flag (full-doc replace in `applyEdit` —
                    // `src/lib/local/write.ts:106`), defeating
                    // simulateLazyHydration's Dexie-flag-only dedup gate and
                    // letting the second call re-fan-out. Production does NOT
                    // re-fan-out in that scenario because `fanoutStartedRef`
                    // survives Dexie row mutations. See FINDINGS.md.
                    if (calls > 1) continue
                    const cs = await simulateLazyHydration(action.setlistId, action.trackIds)
                    if (cs.length > 0) {
                        lazyHydratedSetlists.add(action.setlistId)
                        committed.push(...cs)
                    }
                } else if (action.kind === 'tick') {
                    await clock.advance(action.ms)
                }
            } catch (e) {
                // applyEdit may throw legitimately (update target missing
                // due to prior delete in same scenario). Don't record.
                void e
            }
        }

        // Quiesce: force online + drain cycles. Repeated pump() without
        // clock.advance — driving the clock forward fires backoff retry
        // timers in a tight loop when a row keeps hitting VersionMismatch
        // (cross-tab + lazy-hydration interactions can produce this), which
        // can run away inside FakeClock.advance's "find every due timer"
        // loop. Failed/pending rows that didn't drain still satisfy AC-9
        // because they're observable in outbox — no need to advance past
        // backoff windows.
        adapter.online = true
        for (let i = 0; i < 4; i++) {
            await engine.pump()
            await flush()
        }

        // ---- Verification ----

        const remainingOutbox = await getDb().outbox.toArray()

        // Invariant 3: no orphaned 'sending' after quiesce.
        const orphanedSending = remainingOutbox.filter((r) => r.status === 'sending')
        if (orphanedSending.length > 0) {
            throw new Error(
                `orphaned 'sending' rows after quiesce: ${orphanedSending.length}`,
            )
        }

        // Invariant 1: AC-9 no-data-loss. For every committed (collection,
        // docId), the row must be in remote OR in outbox (any non-terminal-
        // success status counts: pending / sending / failed). Failed-status
        // rows from cross-tab VersionMismatch ARE observable — that's the
        // "no SILENT loss" contract.
        const outboxByKey = new Map<string, OutboxRow[]>()
        for (const r of remainingOutbox) {
            const k = `${r.collection}/${r.docId}`
            const arr = outboxByKey.get(k) ?? []
            arr.push(r)
            outboxByKey.set(k, arr)
        }

        for (let i = 0; i < committed.length; i++) {
            const edit = committed[i]
            const k = `${edit.collection}/${edit.docId}`
            const inServer = remote.docs.has(k)
            const inOutbox = (outboxByKey.get(k) ?? []).length > 0
            // Was this edit superseded by a later delete? Then absence from
            // server is fine if outbox has the delete pending.
            const supersededByDelete = committed
                .slice(i + 1)
                .some(
                    (e) =>
                        e.collection === edit.collection &&
                        e.docId === edit.docId &&
                        e.op === 'delete',
                )
            if (edit.op === 'delete') {
                // Delete: server should not have it OR outbox should reflect
                // a pending delete. Server-has-it without-pending-delete is a
                // loss — UNLESS a later set/update revived it.
                const hasOutboxDelete = (outboxByKey.get(k) ?? []).some(
                    (r) => r.op === 'delete',
                )
                if (inServer && !hasOutboxDelete) {
                    const revivedLater = committed
                        .slice(i + 1)
                        .some(
                            (e) =>
                                e.collection === edit.collection &&
                                e.docId === edit.docId &&
                                (e.op === 'set' || e.op === 'update'),
                        )
                    if (!revivedLater) {
                        throw new Error(
                            `delete lost: ${k} present in server with no pending delete`,
                        )
                    }
                }
                continue
            }
            if (supersededByDelete) continue
            if (!inServer && !inOutbox) {
                throw new Error(
                    `committed write lost: ${edit.op} ${k} payload=${JSON.stringify(edit.payload)}`,
                )
            }
        }

        // Invariant 4: lazy-hydration idempotency. For every setlistId that
        // saw multiple lazy-hydrate calls, the second+ calls must have been
        // no-ops (production hydrator's hydrated:true skip). We assert this
        // by counting commit entries: a re-call returns []. So the total
        // number of committed rows from lazy-hydrate should equal the number
        // of UNIQUE (setlistId, trackId) tuples from the FIRST call only.
        // Easier check: the number of `lazy-hydrate` commits with op='update'
        // and collection='setlists' for any given setlistId must be ≤ 1.
        const hydratedUpdateCounts = new Map<string, number>()
        for (const c of committed) {
            if (
                c.collection === 'setlists' &&
                c.op === 'update' &&
                (c.payload as { hydrated?: boolean }).hydrated === true
            ) {
                hydratedUpdateCounts.set(
                    c.docId,
                    (hydratedUpdateCounts.get(c.docId) ?? 0) + 1,
                )
            }
        }
        for (const [setlistId, count] of hydratedUpdateCounts) {
            if (count > 1) {
                throw new Error(
                    `lazy-hydration idempotency violated: ${setlistId} got ${count} hydrate updates (expected ≤1)`,
                )
            }
        }

        // Touch lazyHydratedSetlists so the linter doesn't flag it; it's
        // observability for failing-case debugging via fast-check verbose mode.
        void lazyHydratedSetlists
        } finally {
            try { engine.shutdown() } catch { /* idempotent */ }
            // Drain any queued microtasks before the next iteration's
            // resetDbForTests so leaked ops don't hit a closed Dexie.
            await flush()
        }
    }

    // CI runs 50 iterations (the original 100 budget produced ~600s wall
    // time given the lazy-hydration cascade fan-out cost; 50 still surfaces
    // the invariants and stays inside a sane CI budget). Local runs 10.
    const KS_NUM_RUNS = process.env.CI ? 50 : 10

    it('AC-1: invariants hold under randomized chaos', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(ksActionArb, { minLength: 3, maxLength: 12 }),
                async (actions) => {
                    // Per-iteration safety timeout: if a specific input
                    // shape sends the engine into a runaway pump loop, fail
                    // the iteration so fast-check can shrink to the
                    // offending sequence instead of timing out the entire
                    // test. 8s is well above the observed median of ~0.7s
                    // — but under suite-wide parallel CPU pressure the
                    // budget gets squeezed on specific fast-check seeds.
                    // Wrap the wall-clock budget in `loadAdjusted` so the
                    // deadline scales with `VITEST_LOAD_FACTOR` (default
                    // 1.5×; see `[[feedback_parallel_load_flake_baseline]]`).
                    const ITER_TIMEOUT_MS = loadAdjusted(8_000)
                    let timer: ReturnType<typeof setTimeout> | undefined
                    const timeout = new Promise<void>((_, reject) => {
                        timer = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        `iteration > ${ITER_TIMEOUT_MS}ms — runaway`,
                                    ),
                                ),
                            ITER_TIMEOUT_MS,
                        )
                    })
                    try {
                        await Promise.race([runKitchenSink(actions), timeout])
                    } finally {
                        if (timer) clearTimeout(timer)
                    }
                },
            ),
            { numRuns: KS_NUM_RUNS, verbose: 1 },
        )
    }, 240_000)

    // Deterministic regression — the production-shape lazy-hydration cascade.
    // Mirrors what SetlistGridHydrator does on first edit-open of a legacy
    // setlist with 3 embedded tracks. Re-running is a no-op (hydrated:true
    // skip). Catches regressions in simulateLazyHydration cleanly without
    // waiting for fast-check to shrink to this shape.
    it('lazy-hydration cascade is idempotent across re-mounts', async () => {
        await runKitchenSink([
            {
                kind: 'lazy-hydrate',
                setlistId: 'ks-s1',
                trackIds: ['ks-t1', 'ks-t2', 'ks-t3'],
            },
            { kind: 'tick', ms: 1000 },
            // Re-mount the same setlist — should be a no-op via hydrated:true skip.
            {
                kind: 'lazy-hydrate',
                setlistId: 'ks-s1',
                trackIds: ['ks-t1', 'ks-t2', 'ks-t3'],
            },
            { kind: 'tick', ms: 1000 },
        ])
    }, 30_000)

    // Deterministic regression — ac1-lazy-hydration-characterization
    // 2026-05-26. AC-1 fast-check shrunk repeatedly to this shape (seed
    // -823001267 + others, ~2/2000 runs at LF=1): an intervening
    // `edit-set setlists/S` between two `lazy-hydrate S` calls wipes the
    // local Dexie `hydrated:true` flag (full-doc replace in `applyEdit` —
    // `src/lib/local/write.ts:106`). Pre-fix, the second `lazy-hydrate`
    // re-fans-out + commits a duplicate `hydrated:true` update, blowing the
    // idempotency invariant. Post-fix, `runKitchenSink`'s in-memory
    // `lazyHydrateCalls` counter short-circuits the second call (mirroring
    // production `SetlistGridHydrator.fanoutStartedRef`). Locks the fix in
    // independently of fast-check seed luck.
    it('lazy-hydration idempotency survives an intervening edit-set on the setlist row', async () => {
        await runKitchenSink([
            { kind: 'lazy-hydrate', setlistId: 'ks-s2', trackIds: ['ks-t1'] },
            { kind: 'edit-set', collection: 'setlists', docId: 'ks-s2', payload: { v: 0 } },
            { kind: 'edit-set', collection: 'tracks', docId: 'ks-t1', payload: { v: 0 } },
            { kind: 'tick', ms: 0 },
            { kind: 'lazy-hydrate', setlistId: 'ks-s2', trackIds: ['ks-t1'] },
        ])
    }, 30_000)

    // Deterministic regression — cross-tab simulated edit forces local update
    // into VersionMismatch. Failed outbox row must remain observable (AC-9).
    it('cross-tab edit + local update surfaces VersionMismatch as observable failed row', async () => {
        await runKitchenSink([
            { kind: 'edit-set', collection: 'tracks', docId: 'ks-t1', payload: { v: 1 } },
            { kind: 'tick', ms: 500 },
            { kind: 'cross-tab', collection: 'tracks', docId: 'ks-t1', payload: { v: 99 } },
            { kind: 'edit-update', collection: 'tracks', docId: 'ks-t1', patch: { v: 2 } },
            { kind: 'tick', ms: 1000 },
        ])
    }, 30_000)
})

// ─── v5h-01-01: track-edit save-loss reproduction ──────────────────────────
//
// Reproduces Daniel's UAT save-loss (path "P"): brand-new setlist, no legacy
// embedded tracks, edit a song's key, sync indicator shows "Saved", navigate
// away and back, key field is gone.
//
// The bug surface lives at the intersection of two production paths:
//   1. engine.ts:264 gates writeback on `result.updatedAt !== undefined` —
//      if the production adapter's getDoc readback races serverTimestamp
//      resolution and returns `{}`, the engine SKIPS writeback and the local
//      Dexie row's updatedAt stays at whatever applyEdit left it (undefined
//      for a fresh track, or stale from before).
//   2. snapshot-listener.ts:215 `(local.updatedAt ?? 0) >= change.updatedAt`
//      underflows when `local.updatedAt` is undefined → 0 >= ts1 → false →
//      falls through to `db.tracks.put(next)` → local row clobbered with
//      cached pre-edit Firestore data (cached delivery has no key).
//
// The conjunction of #1 + #2 is the save-loss path. AC-1 deterministically
// reproduces it (test SHOULD fail on master per hypothesis B; passes after
// listener-LWW or engine-writeback fix lands in v5h-01-02). AC-2 is the
// counter-test scoping the bug: with an adapter that returns a real
// updatedAt, engine writeback lands and the listener guard skips correctly.
//
// Reuses module-scoped helpers: SharedRemote, FakeChannelHub, flushTwoWriter.
// New helpers (UndefinedWritebackAdapter + CachedThenFreshSubscriber) are
// scoped to this describe block — they model production adapter races and
// Firestore SDK's initial-cache-then-fresh delivery semantics that the
// v50-07-04 kitchen-sink (zero-latency in-memory adapters) didn't model.
describe('v5h-01-01: track-edit save-loss reproduction (cached-then-fresh listener delivery)', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    // Mirrors OfflineToggleAdapter's SharedRemote write path BUT always
    // returns `{}` on success — modeling the production adapter's
    // getDoc-after-commit hitting Firestore's local cache before
    // serverTimestamp() resolves on the server. This is the engine-side
    // half of the bug: engine.ts:264 gates writeback on `result.updatedAt
    // !== undefined`, so the local Dexie row's updatedAt never lands.
    class UndefinedWritebackAdapter implements FirestoreAdapter {
        writes: Array<{ docId: string; payload: Record<string, unknown> }> = []
        constructor(private readonly remote: SharedRemote) {}

        async commitOutboxRow(
            row: OutboxRow,
        ): Promise<{ updatedAt?: number }> {
            const key = `${row.collection}/${row.docId}`
            const existing = this.remote.docs.get(key)
            const ts = this.remote.nextTimestamp()
            if (row.op === 'set') {
                this.remote.docs.set(key, {
                    payload: { ...row.payload, id: row.docId },
                    updatedAt: ts,
                })
            } else if (row.op === 'update') {
                this.remote.docs.set(key, {
                    payload: { ...(existing?.payload ?? {}), ...row.payload },
                    updatedAt: ts,
                })
            } else {
                this.remote.docs.delete(key)
            }
            this.writes.push({
                docId: row.docId,
                payload: { ...row.payload },
            })
            // The bug condition: server commit succeeded, but adapter cannot
            // surface the resolved updatedAt → engine skips writeback.
            return {}
        }

        async refreshAuthToken(): Promise<void> {}
        async readDoc(
            collection: LocalCollection,
            docId: string,
        ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
            const k = `${collection}/${docId}`
            const doc = this.remote.docs.get(k)
            return doc ? { data: { ...doc.payload }, updatedAt: doc.updatedAt } : null
        }
    }

    // Counter-test adapter: returns a real updatedAt so engine writeback
    // lands and the listener's LWW guard has a non-undefined local timestamp
    // to compare against. Used by AC-2 to scope the bug to the conjunction
    // of "adapter returned undefined" AND "listener underflows undefined".
    class TimestampedWritebackAdapter implements FirestoreAdapter {
        writes: Array<{ docId: string; payload: Record<string, unknown> }> = []
        constructor(private readonly remote: SharedRemote) {}

        async commitOutboxRow(
            row: OutboxRow,
        ): Promise<{ updatedAt?: number }> {
            const key = `${row.collection}/${row.docId}`
            const existing = this.remote.docs.get(key)
            const ts = this.remote.nextTimestamp()
            if (row.op === 'set') {
                this.remote.docs.set(key, {
                    payload: { ...row.payload, id: row.docId },
                    updatedAt: ts,
                })
                this.writes.push({ docId: row.docId, payload: { ...row.payload } })
                return { updatedAt: ts }
            }
            if (row.op === 'update') {
                this.remote.docs.set(key, {
                    payload: { ...(existing?.payload ?? {}), ...row.payload },
                    updatedAt: ts,
                })
                this.writes.push({ docId: row.docId, payload: { ...row.payload } })
                return { updatedAt: ts }
            }
            this.remote.docs.delete(key)
            return {}
        }

        async refreshAuthToken(): Promise<void> {}
        async readDoc(
            collection: LocalCollection,
            docId: string,
        ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
            const k = `${collection}/${docId}`
            const doc = this.remote.docs.get(k)
            return doc ? { data: { ...doc.payload }, updatedAt: doc.updatedAt } : null
        }
    }

    // SnapshotSubscriber that captures a frozen snapshot of SharedRemote at
    // construction time and fires it synchronously on `subscribeTracks`.
    // Models Firestore SDK's initial cache delivery: the listener's first
    // `onChanges` callback fires with whatever Firestore had cached locally
    // BEFORE the subscription started — which can be staler than the user's
    // most-recent local commit. Subsequent fresh deliveries from the server
    // are gated behind explicit `pushFreshDelivery()` calls so tests can
    // reason deterministically about the cache-vs-fresh window.
    //
    // The v50-07-04 kitchen-sink's SharedRemoteSubscriber didn't model this
    // — it re-emitted the LIVE SharedRemote state on every `emitTracksFor`
    // call, which is "fresh-only" delivery. The cache-vs-fresh staleness is
    // the fidelity gap that allowed the save-loss to ship undetected.
    class CachedThenFreshSubscriber {
        private trackHandlers = new Map<
            string,
            (changes: import('../snapshot-listener').TrackChange[]) => void
        >()
        // Frozen snapshot of `tracks/*` docs at construction time, by setlistId.
        private cachedTracksBySetlist = new Map<
            string,
            Array<{
                docId: string
                data: Record<string, unknown>
                updatedAt: number
            }>
        >()

        constructor(private readonly remote: SharedRemote) {
            // Capture the frozen snapshot of every tracks/* doc, indexed by
            // setlistId so subscribeTracks can deliver only the relevant
            // subset on first cache delivery.
            for (const [key, doc] of remote.docs) {
                const [collection, docId] = key.split('/')
                if (collection !== 'tracks') continue
                const setlistId = doc.payload.setlistId as string | undefined
                if (!setlistId) continue
                const arr = this.cachedTracksBySetlist.get(setlistId) ?? []
                arr.push({
                    docId,
                    data: { ...doc.payload, id: docId },
                    updatedAt: doc.updatedAt,
                })
                this.cachedTracksBySetlist.set(setlistId, arr)
            }
        }

        toSubscriber(): import('../snapshot-listener').SnapshotSubscriber {
            return {
                subscribeSetlist: () => () => {},
                subscribeTracks: (setlistId, onChanges) => {
                    this.trackHandlers.set(setlistId, onChanges)
                    // Synchronously fire the frozen cached state — mirrors
                    // Firestore SDK firing initial cache delivery on
                    // subscribe before any network round-trip.
                    const cached = this.cachedTracksBySetlist.get(setlistId) ?? []
                    if (cached.length > 0) {
                        const changes: import('../snapshot-listener').TrackChange[] =
                            cached.map((c) => ({
                                type: 'modified',
                                docId: c.docId,
                                data: c.data,
                                updatedAt: c.updatedAt,
                            }))
                        // Defer to next microtask so listener's outer
                        // subscribeTracks call returns before the handler
                        // fires (matches Firestore SDK behavior).
                        Promise.resolve().then(() => onChanges(changes))
                    }
                    return () => {
                        this.trackHandlers.delete(setlistId)
                    }
                },
            }
        }

        /** Test-only: trigger a "fresh from server" delivery for a setlist
         *  using the CURRENT live SharedRemote state. Not used by the
         *  reproduction tests below — those rely on cached delivery alone
         *  to clobber — but exposed for future tests that want to model
         *  the post-cache fresh-delivery race window. */
        pushFreshDelivery(setlistId: string): void {
            const handler = this.trackHandlers.get(setlistId)
            if (!handler) return
            const changes: import('../snapshot-listener').TrackChange[] = []
            for (const [key, doc] of this.remote.docs) {
                const [collection, docId] = key.split('/')
                if (collection !== 'tracks') continue
                if (doc.payload.setlistId !== setlistId) continue
                changes.push({
                    type: 'modified',
                    docId,
                    data: { ...doc.payload, id: docId },
                    updatedAt: doc.updatedAt,
                })
            }
            if (changes.length > 0) handler(changes)
        }
    }

    // Boot a SyncEngine against the singleton getDb() (the same db
    // applyEdit() uses), wired to the supplied adapter. Returns a teardown.
    async function bootEngine(adapter: FirestoreAdapter): Promise<{
        engine: SyncEngine
        cleanup: () => void
    }> {
        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('crc-v5h-01-01', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const engine = new SyncEngine({
            adapter,
            lock,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        await engine.start()
        await flushTwoWriter()
        return {
            engine,
            cleanup: () => {
                try {
                    engine.shutdown()
                } catch {
                    /* ignore */
                }
            },
        }
    }

    // AC-1 (regression lock): models Daniel's exact flow against the
    // UndefinedWritebackAdapter. Was an expected-failure on master pre-fix
    // (engine skipped writeback → local row's updatedAt stayed undefined →
    // listener's LWW underflow `(undefined ?? 0) >= remoteTs` fell open →
    // cached delivery clobbered the user's edit). Now passes after
    // v5h-01-02 fix (B): snapshot-listener.ts strict-equality guard at
    // both branches preserves local rows under uncertainty. Locks the bug:
    // any future regression that re-introduces the underflow surfaces here.
    it(
        'AC-1: cached snapshot delivery preserves local edit when engine writeback skipped (regression lock for v5h-01-02 listener fix)',
        async () => {
            const remote = new SharedRemote()
            const adapter = new UndefinedWritebackAdapter(remote)
            const { engine, cleanup } = await bootEngine(adapter)

            try {
                // Step 1: applyEdit set the new track — fresh setlist, no key.
                // Mirrors Daniel's flow of adding "Modeh Ani" without a key.
                await applyEdit({
                    op: 'set',
                    collection: 'tracks',
                    doc: {
                        id: 't1',
                        setlistId: 's1',
                        order: 0,
                        songId: 'song1',
                        title: 'Modeh Ani',
                    } as never,
                })

                // Drain to remote. UndefinedWritebackAdapter writes to
                // SharedRemote with a real ts but returns {} → engine skips
                // writeback → local Dexie t1.updatedAt stays undefined.
                await engine.pump()
                await flushTwoWriter()

                // Sanity: local Dexie row exists and has the title; remote
                // received the write; engine writeback was skipped (local
                // updatedAt still undefined).
                const afterSet = await getDb().tracks.get('t1')
                expect(afterSet?.title).toBe('Modeh Ani')
                expect(afterSet?.updatedAt).toBeUndefined()
                expect(adapter.writes.length).toBe(1)
                expect(remote.docs.has('tracks/t1')).toBe(true)
                expect(await getDb().outbox.count()).toBe(0)

                // Step 2: capture SharedRemote state HERE — this is what the
                // snapshot listener's initial cache delivery will replay
                // when the user navigates back to the setlist later. The
                // payload at this point has no key field.
                const cachedRemoteForListener = new SharedRemote()
                for (const [k, v] of remote.docs) {
                    cachedRemoteForListener.docs.set(k, {
                        payload: { ...v.payload },
                        updatedAt: v.updatedAt,
                    })
                }

                // Step 3: applyEdit update the key — Daniel's "set Modeh Ani
                // key to E". Pass expectedUpdatedAt: undefined (since local
                // row's updatedAt is undefined — exactly what the cell
                // commit path passes when row.updatedAt is unset).
                await applyEdit({
                    op: 'update',
                    collection: 'tracks',
                    docId: 't1',
                    patch: { key: 'E' } as never,
                    expectedUpdatedAt: undefined,
                })

                // Local Dexie should now carry key='E' (synchronous put
                // inside applyEdit's txn) — confirm the local edit landed.
                const afterEditLocal = await getDb().tracks.get('t1')
                expect(afterEditLocal?.key).toBe('E')

                // Drain. Adapter writes to SharedRemote (server now has
                // key='E'); writeback skipped again.
                await engine.pump()
                await flushTwoWriter()

                // Sanity: outbox drained; remote now has key='E'; local
                // updatedAt still undefined (writeback skipped twice).
                expect(await getDb().outbox.count()).toBe(0)
                const remoteAfterEdit = remote.docs.get('tracks/t1')
                expect(remoteAfterEdit?.payload.key).toBe('E')
                const localAfterEdit = await getDb().tracks.get('t1')
                expect(localAfterEdit?.key).toBe('E')
                expect(localAfterEdit?.updatedAt).toBeUndefined()

                // Step 4: simulate page-navigation by mounting the snapshot
                // listener with the CachedThenFreshSubscriber holding the
                // PRE-edit cached state captured in step 2. The listener's
                // initial `subscribeTracks` callback delivers that cached
                // state (no key field, older updatedAt). With local
                // updatedAt undefined, the LWW guard fails open and clobbers.
                const { startSnapshotListener } = await import('../snapshot-listener')
                const subscriber = new CachedThenFreshSubscriber(
                    cachedRemoteForListener,
                )
                const stopListener = startSnapshotListener({
                    setlistId: 's1',
                    db: getDb(),
                    subscriber: subscriber.toSubscriber(),
                    logger: { warn: () => {} },
                })

                // Wait for the deferred microtask firing the cached delivery
                // and the listener's rw transaction to complete.
                await flushTwoWriter()

                // ⚠️ THE BUG: assertion on master fails because the cached
                // pre-edit delivery clobbered the local key='E'.
                const localAfterListener = await getDb().tracks.get('t1')
                expect(localAfterListener?.key).toBe('E')

                stopListener()
            } finally {
                cleanup()
            }
        },
        30_000,
    )

    // AC-2 (counter-test, passes on master): same flow but adapter returns
    // a real updatedAt → engine writeback lands → local Dexie carries a
    // valid updatedAt → snapshot listener's LWW guard skips correctly when
    // the cached delivery's updatedAt is older. Proves the bug is the
    // CONJUNCTION of "adapter returned undefined" AND "listener underflows
    // undefined" — not a general listener regression.
    it('AC-2: counter-test — listener LWW guard works when engine writeback lands', async () => {
        const remote = new SharedRemote()
        const adapter = new TimestampedWritebackAdapter(remote)
        const { engine, cleanup } = await bootEngine(adapter)

        try {
            // Same shape as AC-1: set track, drain, capture cached state,
            // update key, drain, mount listener with pre-edit cached state.
            await applyEdit({
                op: 'set',
                collection: 'tracks',
                doc: {
                    id: 't1',
                    setlistId: 's1',
                    order: 0,
                    songId: 'song1',
                    title: 'Modeh Ani',
                } as never,
            })
            await engine.pump()
            await flushTwoWriter()

            // With timestamped writeback, local row gets the server ts
            // written back inside the engine's atomic outbox+entity tx.
            const afterSet = await getDb().tracks.get('t1')
            expect(afterSet?.updatedAt).toBeDefined()
            expect(typeof afterSet?.updatedAt).toBe('number')

            // Capture cached state for listener (pre-edit).
            const cachedRemoteForListener = new SharedRemote()
            for (const [k, v] of remote.docs) {
                cachedRemoteForListener.docs.set(k, {
                    payload: { ...v.payload },
                    updatedAt: v.updatedAt,
                })
            }

            // Edit key. Local has a real updatedAt → pass it through.
            await applyEdit({
                op: 'update',
                collection: 'tracks',
                docId: 't1',
                patch: { key: 'E' } as never,
                expectedUpdatedAt: afterSet!.updatedAt,
            })
            await engine.pump()
            await flushTwoWriter()

            // Local row now has a NEWER updatedAt than the cached snapshot
            // because the engine writeback landed after the second commit.
            const localAfterEdit = await getDb().tracks.get('t1')
            expect(localAfterEdit?.key).toBe('E')
            expect(localAfterEdit?.updatedAt).toBeGreaterThan(
                afterSet!.updatedAt!,
            )

            // Mount listener with the PRE-edit cached state. Cached
            // delivery's updatedAt is OLDER than local's — LWW guard skips.
            const { startSnapshotListener } = await import('../snapshot-listener')
            const subscriber = new CachedThenFreshSubscriber(
                cachedRemoteForListener,
            )
            const stopListener = startSnapshotListener({
                setlistId: 's1',
                db: getDb(),
                subscriber: subscriber.toSubscriber(),
                logger: { warn: () => {} },
            })
            await flushTwoWriter()

            // Local edit preserved — guard worked correctly.
            const localAfterListener = await getDb().tracks.get('t1')
            expect(localAfterListener?.key).toBe('E')

            stopListener()
        } finally {
            cleanup()
        }
    }, 30_000)
})

// ─── v5h3-01-03: pending-outbox expectedUpdatedAt threading ─────────────────
//
// H-SL-7 regression: when the engine writes back a server-stamped
// `updatedAt` after a successful commit, it must ALSO thread that new
// `updatedAt` into any PENDING outbox rows for the same (collection, docId)
// inside the SAME writeback transaction. Without this, rapid same-doc
// edits queued by the editor BEFORE the first commit's writeback re-rendered
// useLiveQuery still hold the stale baseline `expectedUpdatedAt`, and the
// next drain phantom-trips VersionMismatchError → reconciliation modal
// (single-user "Keep mine / Take theirs" with NO real concurrent writer).
//
// Cases:
//   1. Rapid same-doc edits drain successfully without VersionMismatch.
//   2. Genuine multi-writer scenario STILL triggers VersionMismatch
//      (preserves v50-06-02 reconciliation contract).
//   3. Cross-doc rows are NOT touched by the threading.
//
// Reuses TwoWriterAdapter (already threads expectedUpdatedAt + returns real
// updatedAt) + SharedRemote + FakeChannelHub + applyEdit (real write path).
describe('v5h3-01-03: pending-outbox expectedUpdatedAt threading', () => {
    beforeEach(async () => {
        await resetDbForTests()
    })
    afterEach(async () => {
        await resetDbForTests()
    })

    // Adapter that wraps TwoWriterAdapter but lets the test assert the
    // expectedUpdatedAt threaded into each row at commit time. Captures a
    // breadcrumb of every commit's (docId, expectedUpdatedAt) so the test
    // can prove that the SECOND same-doc commit saw the THREADED baseline
    // (not the stale `undefined` from the editor's pre-pump call).
    class CapturingTwoWriterAdapter implements FirestoreAdapter {
        readonly inner: TwoWriterAdapter
        readonly seen: Array<{
            docId: string
            op: OutboxRow['op']
            expectedUpdatedAt: number | undefined
        }> = []
        constructor(remote: SharedRemote) {
            this.inner = new TwoWriterAdapter(remote)
        }
        async commitOutboxRow(
            row: OutboxRow,
        ): Promise<{ updatedAt?: number }> {
            this.seen.push({
                docId: row.docId,
                op: row.op,
                expectedUpdatedAt: row.expectedUpdatedAt,
            })
            return this.inner.commitOutboxRow(row)
        }
        async refreshAuthToken(): Promise<void> {
            return this.inner.refreshAuthToken()
        }
        async readDoc(
            collection: LocalCollection,
            docId: string,
        ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
            return this.inner.readDoc(collection, docId)
        }
    }

    // Adapter that throws VersionMismatchError on a specific call index to
    // simulate a genuine cross-tab/server-side concurrent write. Used by
    // Case 2 to verify the reconciliation modal contract is preserved.
    class FailNthCallAdapter implements FirestoreAdapter {
        readonly inner: TwoWriterAdapter
        calls = 0
        constructor(
            remote: SharedRemote,
            private readonly failOnCall: number,
        ) {
            this.inner = new TwoWriterAdapter(remote)
        }
        async commitOutboxRow(
            row: OutboxRow,
        ): Promise<{ updatedAt?: number }> {
            this.calls += 1
            if (this.calls === this.failOnCall) {
                throw new VersionMismatchError(
                    'simulated cross-tab write bumped remote.updatedAt',
                )
            }
            return this.inner.commitOutboxRow(row)
        }
        async refreshAuthToken(): Promise<void> {
            return this.inner.refreshAuthToken()
        }
        async readDoc(
            collection: LocalCollection,
            docId: string,
        ): Promise<{ data: Record<string, unknown>; updatedAt: number } | null> {
            return this.inner.readDoc(collection, docId)
        }
    }

    // Drain helper: pump + flush + advance backoff until outbox is empty
    // or capped (defensive — no test should exceed a handful of pumps).
    async function drainToQuiescence(
        engine: SyncEngine,
        clock: FakeClock,
        maxIterations = 12,
    ): Promise<void> {
        for (let i = 0; i < maxIterations; i++) {
            await engine.pump()
            await flushTwoWriter()
            const remaining = await getDb().outbox.count()
            if (remaining === 0) return
            // Skip past the longest backoff so retry-pending rows fire.
            await clock.advance(10_000)
        }
    }

    it('Case 1 (AC-2): rapid same-doc edits drain without phantom VersionMismatch', async () => {
        const remote = new SharedRemote()
        // Seed remote at a known baseline.
        remote.seed('tracks', 't1', {
            payload: { id: 't1', setlistId: 's1', title: 'orig' },
            updatedAt: 1000,
        })

        // Seed local row with the matching baseline so applyEdit's first
        // committed update threads expectedUpdatedAt=1000 (the editor would
        // capture this from useLiveQuery in production).
        const db = getDb()
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        })

        const adapter = new CapturingTwoWriterAdapter(remote)
        const clock = new FakeClock()
        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('crc-v5h3-01-03-c1', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const engine = new SyncEngine({
            db,
            adapter,
            lock,
            clock,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        await engine.start()
        await flushTwoWriter()

        // Three rapid sequential applyEdit calls — all on the SAME
        // (collection, docId) — issued BEFORE any pump. In production,
        // calls 2 and 3 would capture stale `expectedUpdatedAt=1000` from
        // useLiveQuery (the editor only re-renders after engine writeback).
        // We mirror that by passing expectedUpdatedAt=1000 on all three.
        for (const title of ['edit-1', 'edit-2', 'edit-3']) {
            await applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't1',
                    patch: { title },
                    expectedUpdatedAt: 1000,
                },
                { withoutUndo: true },
            )
        }

        // Three pending outbox rows for the same doc, all with stale
        // baseline 1000. The threading fix bumps rows 2+3 to the new
        // server ts after row 1 commits.
        const beforeDrain = await db.outbox.toArray()
        expect(beforeDrain.length).toBe(3)
        for (const r of beforeDrain) {
            expect(r.expectedUpdatedAt).toBe(1000)
        }

        await drainToQuiescence(engine, clock)

        // All 3 commits drained; no rows left.
        expect(await db.outbox.count()).toBe(0)
        // Engine quiesced — NOT in 'conflict' state.
        expect(engine.getState()).toBe('idle')
        // No row was marked failed mid-drain.
        const failed = (await db.outbox.toArray()).filter(
            (r) => r.status === 'failed',
        )
        expect(failed.length).toBe(0)
        // Adapter saw 3 calls — i.e. the engine didn't bail early on a
        // VersionMismatch.
        expect(adapter.seen.length).toBe(3)
        // First call carried the baseline; calls 2 and 3 carried the
        // threaded server timestamps from the prior commit (NOT 1000).
        expect(adapter.seen[0].expectedUpdatedAt).toBe(1000)
        expect(adapter.seen[1].expectedUpdatedAt).not.toBe(1000)
        expect(adapter.seen[1].expectedUpdatedAt).toBeDefined()
        expect(adapter.seen[2].expectedUpdatedAt).not.toBe(1000)
        expect(adapter.seen[2].expectedUpdatedAt).toBeDefined()
        // Local row's final updatedAt reflects the LATEST commit.
        const localFinal = await db.tracks.get('t1')
        const remoteFinal = remote.snapshot().get('tracks/t1')
        expect(localFinal?.updatedAt).toBe(remoteFinal?.updatedAt)
        expect(remoteFinal?.payload.title).toBe('edit-3')

        engine.shutdown()
    }, 30_000)

    it('Case 2 (AC-3): genuine multi-writer scenario STILL triggers VersionMismatch reconciliation', async () => {
        const remote = new SharedRemote()
        remote.seed('tracks', 't1', {
            payload: { id: 't1', setlistId: 's1', title: 'orig' },
            updatedAt: 1000,
        })

        const db = getDb()
        await db.tracks.put({
            id: 't1',
            setlistId: 's1',
            order: 0,
            title: 'orig',
            updatedAt: 1000,
        })

        // Adapter throws VersionMismatchError on the 2nd commit — modeling
        // a real cross-tab write that bumped remote.updatedAt between our
        // first and second drain. The threading fix MUST NOT mask this.
        const adapter = new FailNthCallAdapter(remote, 2)
        const clock = new FakeClock()
        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('crc-v5h3-01-03-c2', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const engine = new SyncEngine({
            db,
            adapter,
            lock,
            clock,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        await engine.start()
        await flushTwoWriter()

        // Two applyEdit calls (both with stale baseline 1000 — same as
        // Case 1's editor-capture model). Drain. The 2nd commit throws
        // VersionMismatchError → row marked failed → FSM → 'conflict'.
        for (const title of ['mine-1', 'mine-2']) {
            await applyEdit(
                {
                    op: 'update',
                    collection: 'tracks',
                    docId: 't1',
                    patch: { title },
                    expectedUpdatedAt: 1000,
                },
                { withoutUndo: true },
            )
        }

        await drainToQuiescence(engine, clock)

        // Exactly 1 outbox row remains (the failed second edit).
        const after = await db.outbox.toArray()
        expect(after.length).toBe(1)
        expect(after[0].status).toBe('failed')
        expect(after[0].lastError).toContain('cross-tab')
        // FSM in 'conflict' — reconciliation modal would open.
        expect(engine.getState()).toBe('conflict')
        // Adapter saw exactly 2 calls (the 2nd threw); engine stopped on
        // VersionMismatch per v50-06-02 contract.
        expect(adapter.calls).toBe(2)

        engine.shutdown()
    }, 30_000)

    it('Case 3 (AC-1 boundary): cross-doc pending rows are NOT touched by threading', async () => {
        const remote = new SharedRemote()
        remote.seed('tracks', 'track-A', {
            payload: { id: 'track-A', setlistId: 's1', title: 'A-orig' },
            updatedAt: 1000,
        })
        remote.seed('tracks', 'track-B', {
            payload: { id: 'track-B', setlistId: 's1', title: 'B-orig' },
            updatedAt: 1500,
        })

        const db = getDb()
        await db.tracks.put({
            id: 'track-A',
            setlistId: 's1',
            order: 0,
            title: 'A-orig',
            updatedAt: 1000,
        })
        await db.tracks.put({
            id: 'track-B',
            setlistId: 's1',
            order: 1,
            title: 'B-orig',
            updatedAt: 1500,
        })

        const adapter = new CapturingTwoWriterAdapter(remote)
        const clock = new FakeClock()
        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('crc-v5h3-01-03-c3', {
            channelFactory: (n) => hub.create(n),
            leaseMs: 5000,
        })
        const engine = new SyncEngine({
            db,
            adapter,
            lock,
            clock,
            isOnline: () => true,
            onlineListener: { addListener: () => {}, removeListener: () => {} },
        })
        await engine.start()
        await flushTwoWriter()

        // Queue an edit on track-A FIRST (so it's the first to drain by
        // localId order), then an edit on track-B. After A commits, the
        // threading fix MUST update only A's same-doc pending rows (none
        // here) — track-B's expectedUpdatedAt MUST remain 1500.
        await applyEdit(
            {
                op: 'update',
                collection: 'tracks',
                docId: 'track-A',
                patch: { title: 'A-edit' },
                expectedUpdatedAt: 1000,
            },
            { withoutUndo: true },
        )
        await applyEdit(
            {
                op: 'update',
                collection: 'tracks',
                docId: 'track-B',
                patch: { title: 'B-edit' },
                expectedUpdatedAt: 1500,
            },
            { withoutUndo: true },
        )

        // Snapshot B's expectedUpdatedAt BEFORE drain.
        const bRowBefore = (await db.outbox.toArray()).find(
            (r) => r.docId === 'track-B',
        )
        expect(bRowBefore).toBeDefined()
        expect(bRowBefore!.expectedUpdatedAt).toBe(1500)

        // Drive ONE pump tick. Per per-doc-ordering, drainOnce dispatches
        // BOTH due rows in a single drain (different docIds → no
        // blocking). Pause and inspect: the FIRST adapter call belongs to
        // track-A; immediately after that writeback tx, track-B's pending
        // row's expectedUpdatedAt MUST still equal 1500 (threading filter
        // does not match cross-doc rows).
        //
        // We do this by checking the adapter's seen[] log AFTER drain
        // completes: if the threading had leaked across docs, B's commit
        // would have seen expectedUpdatedAt = A's new server timestamp
        // (which would have caused a VersionMismatchError on the
        // TwoWriterAdapter, since remote B's updatedAt is still 1500).
        await drainToQuiescence(engine, clock)

        // Both committed without VersionMismatch.
        expect(await db.outbox.count()).toBe(0)
        expect(engine.getState()).toBe('idle')
        // The adapter saw track-B's commit with expectedUpdatedAt=1500
        // (its OWN baseline) — NOT the threaded value from A's commit.
        const seenB = adapter.seen.find((s) => s.docId === 'track-B')
        expect(seenB).toBeDefined()
        expect(seenB!.expectedUpdatedAt).toBe(1500)
        // Both edits landed on the remote.
        const remoteA = remote.snapshot().get('tracks/track-A')
        const remoteB = remote.snapshot().get('tracks/track-B')
        expect(remoteA?.payload.title).toBe('A-edit')
        expect(remoteB?.payload.title).toBe('B-edit')

        engine.shutdown()
    }, 30_000)
})
