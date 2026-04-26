'use client'

import { useEffect } from 'react'
import {
    Timestamp,
    deleteDoc,
    doc,
    runTransaction,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore'

import { auth, db as firestoreDb } from '@/lib/firebase'
import { logger } from '@/lib/logger'
import type { OutboxRow } from '@/lib/local/types'

import { CrossTabLock } from './cross-tab-lock'
import { SyncEngine } from './engine'
import {
    AuthError,
    type FirestoreAdapter,
    NetworkError,
    TransientError,
    VersionMismatchError,
} from './firestore-adapter'
import { wireSyncEngineToStore } from './store'

class ProductionFirestoreAdapter implements FirestoreAdapter {
    async commitOutboxRow(row: OutboxRow): Promise<void> {
        try {
            switch (row.op) {
                case 'set': {
                    const ref = doc(firestoreDb, row.collection, row.docId)
                    await setDoc(ref, {
                        ...row.payload,
                        updatedAt: serverTimestamp(),
                    })
                    return
                }
                case 'update': {
                    const ref = doc(firestoreDb, row.collection, row.docId)
                    await runTransaction(firestoreDb, async (tx) => {
                        const snap = await tx.get(ref)
                        if (!snap.exists()) {
                            throw new TransientError(
                                `Remote doc missing: ${row.collection}/${row.docId}`,
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
                    return
                }
                case 'delete': {
                    await deleteDoc(doc(firestoreDb, row.collection, row.docId))
                    return
                }
            }
        } catch (err) {
            if (err instanceof VersionMismatchError) throw err
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
}

let booted = false
let engineSingleton: SyncEngine | null = null
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

export function shutdownSyncEngine(): void {
    if (engineSingleton) {
        engineSingleton.shutdown()
        engineSingleton = null
    }
    if (unsubscribeStore) {
        unsubscribeStore()
        unsubscribeStore = null
    }
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
