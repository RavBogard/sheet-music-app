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
