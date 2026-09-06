import 'fake-indexeddb/auto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetDbForTests } from '@/lib/local/schema'
import type { LocalCollection, OutboxRow } from '@/lib/local/types'
import { applyEdit } from '@/lib/local/write'
import { CrossTabLock } from '@/lib/sync/cross-tab-lock'
import { SyncEngine, type SyncEngineOptions } from '@/lib/sync/engine'
import {
    type CommitResult,
    type FirestoreAdapter,
    RemoteDocMissingError,
    type RemoteDocSnapshot,
    VersionMismatchError,
} from '@/lib/sync/firestore-adapter'

/**
 * v54-02-01 (Harness Fidelity Gate phase 1) — emulator wiring canary.
 *
 * Smallest possible test proving Firebase Local Emulator Suite + the
 * `firebase emulators:exec` wrapper + this repo's vitest.emulator.config.ts
 * round-trip cleanly. NO sync-engine code-under-test here — that lives in
 * Plan 02 (RTL editor↔perf-view propagation pair + H-SL-7 regression
 * canary). If this canary fails, the emulator infra is broken and Plan 02
 * tests would be unreliable.
 *
 * What this test would have caught (if absent):
 *  - firebase.json `emulators` block missing or wrong port
 *  - npm script `test:emulator` not threading FIRESTORE_EMULATOR_HOST
 *  - vitest.emulator.config.ts not picking up `*.emulator.test.ts` glob
 *  - CI workflow setup-java step missing or wrong distribution
 *
 * Local prereq (Java JDK 11+; documented in PROJECT.md §Constraints):
 *   - Windows: `winget install Microsoft.OpenJDK.21`
 *   - macOS: `brew install openjdk@21`
 *   - Linux: `apt install openjdk-21-jdk`
 * CI: actions/setup-java@v4 with temurin/21 (see .github/workflows/ci.yml).
 */
describe('v54-02-01 emulator canary — proves Firebase Local Emulator Suite wiring', () => {
    let db: import('firebase-admin/firestore').Firestore

    beforeAll(async () => {
        const { initializeApp, getApps } = await import('firebase-admin/app')
        const { getFirestore } = await import('firebase-admin/firestore')

        if (getApps().length === 0) {
            // demo-* project IDs are recognized as "no auth required" by the
            // emulator and never accidentally hit production credentials.
            initializeApp({ projectId: 'demo-v54-02-canary' })
        }
        db = getFirestore()

        // Sanity: env var must be set by `firebase emulators:exec`. If
        // missing, the firebase-admin SDK would silently try to reach prod.
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    })

    it('writes and reads back a doc through the emulator', async () => {
        const ref = db.doc('canary/v54-02-01')
        await ref.set({ ok: true, ts: 5000, note: 'harness fidelity ship gate' })
        const snap = await ref.get()
        expect(snap.exists).toBe(true)
        expect(snap.data()).toMatchObject({
            ok: true,
            ts: 5000,
            note: 'harness fidelity ship gate',
        })
    })

    it('observes emulator-side timestamps (proves real Firestore semantics, not in-memory fake)', async () => {
        const { FieldValue } = await import('firebase-admin/firestore')
        const ref = db.doc('canary/v54-02-01-server-ts')
        await ref.set({ writtenAt: FieldValue.serverTimestamp() })
        const snap = await ref.get()
        const written = snap.get('writtenAt')
        // FakeFirestore would return the literal sentinel; emulator returns a
        // real Timestamp object. Distinguishing this is the point — it proves
        // we're talking to a real Firestore implementation, not the in-memory
        // adapter used by migrate-v50 / bootstrap-songs admin tests.
        expect(written).toBeDefined()
        expect(typeof (written as { toMillis?: () => number })?.toMillis).toBe(
            'function',
        )
    })
})

/**
 * v60-03 (Harness Fidelity Gate closure) — H-SL-7 regression canary.
 *
 * The deferred Plan 02 from v54-02-02 — ships now that Java JDK 21 is
 * available locally (openjdk 21.0.11 via Microsoft OpenJDK). Targets the
 * single most-cited v5h3-01 hypothesis: when two rapid edits to the same
 * `(collection, docId)` queue with the SAME `expectedUpdatedAt`, the
 * engine's writeback pass (v5h3-01-03 fix at engine.ts:282-321) must
 * thread the just-resolved server `updatedAt` into the pending second
 * outbox row BEFORE its commit attempts the precondition check. Without
 * the writeback, the second commit's precondition fails → phantom
 * VersionMismatchError → user-visible "Conflict — review" pill.
 *
 * This canary exercises the FULL stack (engine + ProductionFirestoreAdapter-
 * equivalent + real Firestore via emulator) so the cache-vs-fresh race
 * the in-memory FakeFirestore adapter misses is observable in CI.
 *
 * Counter-reset gate (locked v54-02 CONTEXT Q6): the canary MUST also be
 * proven to FAIL when the v5h3-01-03 writeback block is removed. That
 * demonstration is captured in v60-03-01-SUMMARY.md (verbatim failure
 * output + diff) — it does not need to be re-runnable from master, only
 * verifiably recorded.
 */

/** In-memory hub mimicking BroadcastChannel for the engine's cross-tab
 *  lock. Mirrors the FakeChannelHub used in engine.test.ts; duplicated
 *  here because that file's helpers are not exported. */
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
            set onmessage(h: typeof handler) {
                handler = h
            },
        }
    }
}

/** Yield to macrotasks (fake-indexeddb's internal setTimeout-0 callbacks)
 *  plus a burst of microtasks so Dexie I/O can settle before assertions. */
async function flushAll(rounds = 6): Promise<void> {
    for (let i = 0; i < rounds; i++) {
        await new Promise<void>((r) => setTimeout(r, 0))
        for (let j = 0; j < 50; j++) await Promise.resolve()
    }
}

/** firebase-admin backed adapter that mirrors ProductionFirestoreAdapter's
 *  contract: `set` writes with serverTimestamp + reads back the resolved
 *  ms; `update` runs a transaction that enforces the `expectedUpdatedAt`
 *  precondition (T1.3 semantics — undefined-expected always passes,
 *  mismatch throws VersionMismatchError). The whole point of the canary
 *  is that the engine's writeback rewrites pending rows' expected before
 *  this precondition check runs the second time. */
class EmulatorAdapter implements FirestoreAdapter {
    constructor(
        private readonly fsDb: import('firebase-admin/firestore').Firestore,
        private readonly Timestamp: typeof import('firebase-admin/firestore').Timestamp,
        private readonly FieldValue: typeof import('firebase-admin/firestore').FieldValue,
    ) {}

    async commitOutboxRow(row: OutboxRow): Promise<CommitResult> {
        const ref = this.fsDb.collection(row.collection).doc(row.docId)
        if (row.op === 'set') {
            await ref.set({
                ...row.payload,
                updatedAt: this.FieldValue.serverTimestamp(),
            })
            const after = await ref.get()
            return { updatedAt: after.get('updatedAt')?.toMillis() }
        }
        if (row.op === 'update') {
            await this.fsDb.runTransaction(async (tx) => {
                const snap = await tx.get(ref)
                if (!snap.exists) {
                    throw new RemoteDocMissingError(
                        `Doc missing: ${row.collection}/${row.docId}`,
                    )
                }
                const remoteMs = snap.get('updatedAt')?.toMillis() as
                    | number
                    | undefined
                if (
                    row.expectedUpdatedAt !== undefined &&
                    remoteMs !== row.expectedUpdatedAt
                ) {
                    throw new VersionMismatchError(
                        `expected updatedAt=${row.expectedUpdatedAt}, remote=${remoteMs ?? 'undefined'}`,
                    )
                }
                tx.update(ref, {
                    ...row.payload,
                    updatedAt: this.FieldValue.serverTimestamp(),
                })
            })
            const after = await ref.get()
            return { updatedAt: after.get('updatedAt')?.toMillis() }
        }
        await ref.delete()
        return {}
    }

    async refreshAuthToken(): Promise<void> {
        // emulator-auth is permissive; no-op
    }

    async readDoc(
        collection: LocalCollection,
        docId: string,
    ): Promise<RemoteDocSnapshot | null> {
        const ref = this.fsDb.collection(collection).doc(docId)
        const snap = await ref.get()
        if (!snap.exists) return null
        const data = snap.data() as Record<string, unknown>
        const ts = (data.updatedAt as { toMillis?: () => number } | undefined)
        return { data, updatedAt: ts?.toMillis?.() ?? 0 }
    }
}

describe('v60-03 H-SL-7 regression canary — engine writeback threads server updatedAt under real Firestore', () => {
    let adminDb: import('firebase-admin/firestore').Firestore
    let Timestamp: typeof import('firebase-admin/firestore').Timestamp
    let FieldValue: typeof import('firebase-admin/firestore').FieldValue
    const appName = 'v60-03-canary-app'

    beforeAll(async () => {
        const { initializeApp, getApps } = await import('firebase-admin/app')
        const fs = await import('firebase-admin/firestore')

        if (!getApps().some((a) => a.name === appName)) {
            initializeApp(
                { projectId: 'demo-v60-03-canary' },
                appName,
            )
        }
        const app = getApps().find((a) => a.name === appName)!
        adminDb = fs.getFirestore(app)
        Timestamp = fs.Timestamp
        FieldValue = fs.FieldValue

        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
    })

    beforeEach(async () => {
        await resetDbForTests()
        // Best-effort clear of the setlists collection on the emulator side
        // so repeated runs see a clean slate.
        const refs = await adminDb.collection('setlists').listDocuments()
        await Promise.all(refs.map((r) => r.delete()))
    })

    afterEach(async () => {
        await resetDbForTests()
    })

    it('rapid same-doc updates drain without phantom VersionMismatchError — writeback threading active', async () => {
        const adapter = new EmulatorAdapter(adminDb, Timestamp, FieldValue)
        const hub = new FakeChannelHub()
        const lock = new CrossTabLock('v60-03-canary-lock', {
            channelFactory: (n) => hub.create(n),
        })

        let lastState: string = 'idle'
        let lastQueued = 0
        const stateLog: Array<{
            state: string
            queued: number
            err?: string
        }> = []
        const onStateChange: NonNullable<SyncEngineOptions['onStateChange']> = (
            state,
            queued,
            lastError,
        ) => {
            lastState = state
            lastQueued = queued
            stateLog.push({ state, queued, err: lastError })
        }

        const engine = new SyncEngine({
            adapter,
            lock,
            onStateChange,
            isOnline: () => true,
            onlineListener: {
                addListener: () => {},
                removeListener: () => {},
            },
        })

        // Step 1: seed the remote setlist with a server-stamped updatedAt
        // via firebase-admin directly. Capture the resolved ms so we can
        // pass it as `expectedUpdatedAt` to both edits.
        const setlistId = 'h-sl-7-canary'
        const ref = adminDb.collection('setlists').doc(setlistId)
        await ref.set({
            name: 'initial',
            updatedAt: FieldValue.serverTimestamp(),
        })
        const initialSnap = await ref.get()
        const initialUpdatedAt = (
            initialSnap.get('updatedAt') as InstanceType<typeof Timestamp>
        ).toMillis()

        // Step 2: mirror the remote into the local Dexie row so applyEdit
        // can find an existing row to merge against. Without this,
        // applyEdit('update') throws WriteAtomicityError("target missing").
        await getDb().setlists.put({
            id: setlistId,
            name: 'initial',
            updatedAt: initialUpdatedAt,
        } as never)

        // Step 3: enqueue TWO rapid edits to the same doc with the SAME
        // `expectedUpdatedAt` — mirrors the v5h3-01 race where useLiveQuery
        // hadn't re-rendered between user keystrokes, so both edits captured
        // the pre-commit `updatedAt`.
        await applyEdit(
            {
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { name: 'edit-1' },
                expectedUpdatedAt: initialUpdatedAt,
            },
            { withoutUndo: true },
        )
        await applyEdit(
            {
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { description: 'edit-2-added' },
                expectedUpdatedAt: initialUpdatedAt,
            },
            { withoutUndo: true },
        )

        expect(await getDb().outbox.count()).toBe(2)

        // Step 4: kick the engine. Real timers + real network round-trips
        // against the emulator — poll until the FSM settles or we time out.
        await engine.start()
        const deadline = Date.now() + 10_000
        let drained = false
        while (Date.now() < deadline) {
            await flushAll(4)
            if (lastState === 'idle' && (await getDb().outbox.count()) === 0) {
                drained = true
                break
            }
        }
        expect(drained).toBe(true)
        expect(lastQueued).toBe(0)

        // Step 5: no VersionMismatchError surfaced. The writeback threading
        // updated edit-2's expectedUpdatedAt to match edit-1's resolved
        // updatedAt before edit-2's precondition check ran.
        const sawVersionMismatch = stateLog.some((s) =>
            (s.err ?? '').toLowerCase().includes('version mismatch'),
        )
        expect(sawVersionMismatch).toBe(false)

        // Step 6: remote doc reflects BOTH edits (LWW merge on disjoint keys;
        // name from edit-1, description from edit-2).
        const finalSnap = await ref.get()
        expect(finalSnap.exists).toBe(true)
        expect(finalSnap.get('name')).toBe('edit-1')
        expect(finalSnap.get('description')).toBe('edit-2-added')

        // Step 7: final updatedAt is strictly later than the initial — proves
        // both writes actually committed, not just no-oped.
        const finalUpdatedAt = (
            finalSnap.get('updatedAt') as InstanceType<typeof Timestamp>
        ).toMillis()
        expect(finalUpdatedAt).toBeGreaterThan(initialUpdatedAt)

        engine.shutdown()
    })
})
