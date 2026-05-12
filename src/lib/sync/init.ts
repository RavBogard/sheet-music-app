'use client'

import { useEffect } from 'react'
import {
    Timestamp,
    deleteDoc,
    doc,
    getDoc,
    runTransaction,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore'

import { auth, db as firestoreDb } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import type { LocalCollection, OutboxRow } from '@/lib/local/types'

import { CrossTabLock } from './cross-tab-lock'
import { uploadRecentEditLog } from './edit-log-upload'
import { SyncEngine } from './engine'
export { startSnapshotListener } from './snapshot-listener'
export type {
    SnapshotListenerOpts,
    SnapshotSubscriber,
    SetlistDelivery,
    TrackChange,
    TrackChangeType,
} from './snapshot-listener'
import {
    AuthError,
    type CommitResult,
    type FirestoreAdapter,
    NetworkError,
    type RemoteDocSnapshot,
    RemoteDocMissingError,
    TransientError,
    VersionMismatchError,
} from './firestore-adapter'
import { wireSyncEngineToStore } from './store'

/**
 * T1.3 (2026-05-12): exported for testing.
 *
 * Decides whether a write should proceed given the editor's expected
 * `updatedAt` and the remote doc's current `updatedAt`. Returns `null`
 * to proceed, or an error message string when the write must throw
 * `VersionMismatchError`.
 *
 * Bug fix vs. the pre-T1.3 inline code: the previous guard short-
 * circuited the precondition check when the remote stamp was
 * undefined (`remoteMs !== undefined && remoteMs !== expectedMs`).
 * That meant: if the editor saw a stamped doc at read time but the
 * remote doc had no stamp at commit time, the write proceeded as if
 * there were no precondition. Silent LWW on legacy / pre-stamp data.
 *
 * Corrected semantics:
 *  - No expectation (`expectedUpdatedAt === undefined`) → always pass;
 *    the engine treats this as "first write, no precondition" (matches
 *    LocalTrack.updatedAt semantics for freshly-created rows that
 *    haven't been server-stamped yet).
 *  - Expected stamp matches remote stamp → pass.
 *  - Expected stamp does NOT match remote stamp (including the case
 *    where remote stamp is undefined) → fail with VersionMismatch.
 */
export function checkUpdatePrecondition(
    expectedUpdatedAt: number | undefined,
    remoteMs: number | undefined,
): string | null {
    if (expectedUpdatedAt === undefined) return null
    if (remoteMs === expectedUpdatedAt) return null
    return `expected updatedAt=${expectedUpdatedAt}, remote=${remoteMs ?? 'undefined'}`
}

class ProductionFirestoreAdapter implements FirestoreAdapter {
    async commitOutboxRow(row: OutboxRow): Promise<CommitResult> {
        try {
            switch (row.op) {
                case 'set': {
                    const ref = doc(firestoreDb, row.collection, row.docId)
                    await setDoc(ref, {
                        ...row.payload,
                        updatedAt: serverTimestamp(),
                    })
                    // Re-read to capture the resolved server timestamp
                    // (serverTimestamp() is a sentinel until commit). One
                    // extra read per commit is acceptable — v50-06
                    // reconciliation depends on this freshness.
                    const after = await getDoc(ref)
                    const ms = (
                        after.data() as { updatedAt?: Timestamp } | undefined
                    )?.updatedAt?.toMillis()
                    return { updatedAt: ms }
                }
                case 'update': {
                    const ref = doc(firestoreDb, row.collection, row.docId)
                    await runTransaction(firestoreDb, async (tx) => {
                        const snap = await tx.get(ref)
                        if (!snap.exists()) {
                            // v51-h01: terminal failure, not transient. The doc
                            // either was deleted or never landed (e.g. phantom
                            // row from a flaky-signal addDoc that resolved
                            // client-side without server confirmation). Engine
                            // latches to 'failed' immediately — no retry.
                            throw new RemoteDocMissingError(
                                `This setlist isn't on the server (was deleted or never synced). Refresh your library.`,
                            )
                        }
                        // T1.3 (2026-05-12): precondition check via the
                        // exported `checkUpdatePrecondition` helper so the
                        // semantics are unit-testable. Previously the inline
                        // guard had a `remoteMs !== undefined &&` short-
                        // circuit that silently passed when local expected
                        // a stamp but remote had none — silent LWW on
                        // pre-stamp legacy data. The helper closes that gap.
                        const remote = snap.data() as {
                            updatedAt?: Timestamp
                        }
                        const remoteMs = remote.updatedAt?.toMillis()
                        const preconditionError = checkUpdatePrecondition(
                            row.expectedUpdatedAt,
                            remoteMs,
                        )
                        if (preconditionError !== null) {
                            throw new VersionMismatchError(preconditionError)
                        }
                        tx.update(ref, {
                            ...row.payload,
                            updatedAt: serverTimestamp(),
                        })
                    })
                    const after = await getDoc(ref)
                    const ms = (
                        after.data() as { updatedAt?: Timestamp } | undefined
                    )?.updatedAt?.toMillis()
                    return { updatedAt: ms }
                }
                case 'delete': {
                    await deleteDoc(doc(firestoreDb, row.collection, row.docId))
                    return {}
                }
            }
        } catch (err) {
            if (err instanceof VersionMismatchError) throw err
            if (err instanceof RemoteDocMissingError) throw err
            if (err instanceof TransientError) throw err
            if (err instanceof Error && err.name === 'StaleWriteError') {
                throw new VersionMismatchError(err.message)
            }
            const code = (err as { code?: string })?.code
            if (code === 'unauthenticated' || code === 'permission-denied') {
                throw new AuthError(
                    `Auth failure on ${row.collection}/${row.docId}: ${code}`,
                )
            }
            if (
                code === 'unavailable' ||
                code === 'deadline-exceeded' ||
                code === 'cancelled'
            ) {
                throw new NetworkError(
                    `Network failure on ${row.collection}/${row.docId}: ${code}`,
                )
            }
            throw new TransientError(
                err instanceof Error ? err.message : String(err),
            )
        }
    }

    async refreshAuthToken(): Promise<void> {
        const u = auth.currentUser
        if (!u) throw new AuthError('No authenticated user — cannot refresh token')
        await u.getIdToken(true)
    }

    async readDoc(
        collection: LocalCollection,
        docId: string,
    ): Promise<RemoteDocSnapshot | null> {
        const ref = doc(firestoreDb, collection, docId)
        const snap = await getDoc(ref)
        if (!snap.exists()) return null
        const raw = snap.data() as Record<string, unknown> & {
            updatedAt?: Timestamp | number
        }
        const ts = raw.updatedAt
        const updatedAt =
            ts instanceof Timestamp ? ts.toMillis() : typeof ts === 'number' ? ts : 0
        return { data: raw, updatedAt }
    }
}

let booted = false
let engineSingleton: SyncEngine | null = null
let adapterSingleton: FirestoreAdapter | null = null
let unsubscribeStore: (() => void) | null = null
let pagehideHookInstalled = false

/**
 * v60-02 (2026-05-12) — register a `pagehide` listener that awaits
 * `whenEngineIdle(2000)` so the outbox gets a flush window before the
 * tab is suspended (iOS Safari grants ~5s before true suspension).
 * Best-effort: the promise is intentionally not awaited; we just want
 * to nudge the engine into its drain path during the grace window.
 * Idempotent — module-level flag prevents double-registration across
 * boot retries, HMR, or repeated `SyncEngineBoot` mounts.
 *
 * Exported so the test suite can exercise it without booting the full
 * engine (which requires firebase + Dexie mocks).
 */
export function installPagehideDrainHook(): void {
    if (typeof window === 'undefined') return
    if (pagehideHookInstalled) return
    pagehideHookInstalled = true
    window.addEventListener('pagehide', () => {
        void whenEngineIdle(2000)
    })
}

function bootEngineOnce(): SyncEngine | null {
    if (typeof window === 'undefined') return null
    if (booted) return engineSingleton
    booted = true

    try {
        const lock = new CrossTabLock('crc-sync')
        const adapter = new ProductionFirestoreAdapter()
        const engine = new SyncEngine({ adapter, lock })
        unsubscribeStore = wireSyncEngineToStore(engine)
        void engine.start()
        // v5h3-01-02: flush any persisted edit-log breadcrumbs from the
        // previous session up to Sentry (most-recent 50 rows). Fire-and-
        // forget — never awaited, never blocks engine startup; the helper
        // is failure-swallowing so a Sentry/IDB hiccup doesn't crash the
        // boot path. Runs ONCE per app mount.
        void uploadRecentEditLog()
        // v60-02: pagehide → whenEngineIdle(2000) drain coordinator.
        // See installPagehideDrainHook docs for rationale.
        installPagehideDrainHook()
        engineSingleton = engine
        adapterSingleton = adapter
        return engine
    } catch (err) {
        logger.error('[SyncEngineBoot] Failed to boot sync engine', err)
        booted = false
        return null
    }
}

export function getSyncEngine(): SyncEngine | null {
    return engineSingleton
}

/** v50-06-02: the reconciliation modal needs a one-shot remote-doc read to
 *  render the "their version" side of the diff. Exposing the adapter here
 *  (instead of reaching into engine internals) keeps the engine class
 *  surface lean. The provider treats this as best-effort — null return
 *  means no modal mount or a degraded diff. */
export function getSyncAdapter(): FirestoreAdapter | null {
    return adapterSingleton
}

/**
 * T2.4 (2026-05-12) — wait for the sync engine to reach the idle/drained
 * state, with a hard timeout. Used by the SW-update reload coordinator
 * in firebase.ts so we don't reload mid-flush and lose in-flight outbox
 * rows (Dexie persists them, but giving the engine a chance to drain
 * cleanly is friendlier than depending on the cross-restart 'sending'-
 * reset path in engine.start).
 *
 * Resolves to `'idle'` when the engine reports state === 'idle' AND
 * queued === 0, or `'timeout'` if the deadline expires first. Never
 * rejects. If the engine is already idle at call time, resolves
 * synchronously on the next microtask.
 *
 * Reads from the same Zustand store the engine writes to via
 * `wireSyncEngineToStore`. No new subscriber on the engine itself —
 * onStateChange is single-callback by design.
 */
export async function whenEngineIdle(
    timeoutMs = 10_000,
): Promise<'idle' | 'timeout'> {
    // Dynamic import to avoid a top-level cycle with `./store` consumers.
    const { useSyncStatus } = await import('./store')
    return new Promise<'idle' | 'timeout'>((resolve) => {
        const isIdle = (s: { state: string; queued: number }) =>
            s.state === 'idle' && s.queued === 0
        const current = useSyncStatus.getState()
        if (isIdle(current)) {
            resolve('idle')
            return
        }
        let settled = false
        const finish = (outcome: 'idle' | 'timeout') => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            unsubscribe()
            resolve(outcome)
        }
        const unsubscribe = useSyncStatus.subscribe((s) => {
            if (isIdle(s)) finish('idle')
        })
        const timer = setTimeout(() => finish('timeout'), timeoutMs)
    })
}

export function shutdownSyncEngine(): void {
    if (engineSingleton) {
        engineSingleton.shutdown()
        engineSingleton = null
    }
    if (unsubscribeStore) {
        unsubscribeStore()
        unsubscribeStore = null
    }
    adapterSingleton = null
    booted = false
}

export function SyncEngineBoot(): null {
    useEffect(() => {
        bootEngineOnce()
        // Engine intentionally outlives this component — booted once per
        // session and shut down on `beforeunload`. The cross-tab lock leases
        // make any premature shutdown safe (other tabs take over).
    }, [])
    return null
}
