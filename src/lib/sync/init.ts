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
                        if (row.expectedUpdatedAt !== undefined) {
                            const remote = snap.data() as {
                                updatedAt?: Timestamp
                            }
                            const remoteMs = remote.updatedAt?.toMillis()
                            if (
                                remoteMs !== undefined &&
                                remoteMs !== row.expectedUpdatedAt
                            ) {
                                throw new VersionMismatchError(
                                    `expected updatedAt=${row.expectedUpdatedAt}, remote=${remoteMs}`,
                                )
                            }
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
