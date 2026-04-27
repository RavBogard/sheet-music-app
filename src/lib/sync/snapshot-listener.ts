// Cross-leader live-edit visibility (v50-06-03): Firestore onSnapshot
// listeners for `setlists/{setlistId}` + `tracks where setlistId == X` that
// write deliveries directly into Dexie via `db.{setlists|tracks}.put` —
// NOT via applyEdit. Server data is authoritative; bypassing the outbox
// matches SetlistGridHydrator's idempotent priming pattern.
//
// Two safety guards:
//   1. "Skip if our own outbox has a pending row for this docId" — prevents
//      a remote echo of our own in-flight edit from clobbering the local
//      write before the engine drains it.
//   2. LWW guard — only put if remote.updatedAt > local.updatedAt. Stale
//      deliveries (queued before a more recent local commit's writeback)
//      are dropped silently. NOTE: when local.updatedAt is undefined (e.g.,
//      engine writeback skipped because adapter returned `{}` with no
//      committedAt), we PREFER the local row — the alternative
//      ((undefined ?? 0) >= remote) → false → put would silently overwrite
//      a user edit the engine has yet to resolve. v5h-01-02 fix (B): the
//      guard skips delivery under uncertainty rather than clobbering. See
//      the v5h-01-01 reproduction harness in property-failures.test.ts.
//
// The listener never throws out of its callbacks. Firestore errors are
// swallowed + logged; engine writes remain authoritative.

'use client'

import {
    Timestamp,
    collection as fsCollection,
    doc as fsDoc,
    onSnapshot,
    query,
    where,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

import { db as defaultFirestoreDb } from '@/lib/firebase'
import type { LocalDb } from '@/lib/local/schema'
import type { LocalCollection, LocalSetlist, LocalTrack } from '@/lib/local/types'
import { logger as defaultLogger } from '@/lib/logger'
import { captureSyncFailure } from './sentry-capture'

interface ListenerLogger {
    warn: (msg: string, err?: unknown) => void
}

export interface SnapshotListenerOpts {
    setlistId: string
    db: LocalDb
    /** Override for tests. Defaults to the production Firestore from
     *  `@/lib/firebase`. */
    firestoreDb?: Firestore
    /** Override for tests. Defaults to the app logger. */
    logger?: ListenerLogger
    /** Test-only injection: a function pair returning unsubscribers for
     *  setlist + tracks subscriptions. When provided, bypasses Firestore
     *  entirely so unit tests don't need a live Firestore. */
    subscriber?: SnapshotSubscriber
}

/** Test-seam: an injectable transport for snapshot deliveries. Production
 *  uses Firestore's onSnapshot; tests provide a hand-rolled fake that
 *  triggers callbacks on demand. */
export interface SnapshotSubscriber {
    subscribeSetlist(
        setlistId: string,
        onNext: (delivery: SetlistDelivery | null) => void,
        onError: (err: Error) => void,
    ): () => void
    subscribeTracks(
        setlistId: string,
        onChanges: (changes: TrackChange[]) => void,
        onError: (err: Error) => void,
    ): () => void
}

export interface SetlistDelivery {
    data: Record<string, unknown>
    updatedAt: number
}

export type TrackChangeType = 'added' | 'modified' | 'removed'

export interface TrackChange {
    type: TrackChangeType
    docId: string
    /** For 'added' / 'modified': the new doc data. For 'removed': last
     *  known data (Firestore provides this on removal). */
    data: Record<string, unknown>
    /** Server-stamped updatedAt in ms. 0 for 'removed' deliveries. */
    updatedAt: number
}

function timestampToMs(value: unknown): number {
    if (value instanceof Timestamp) return value.toMillis()
    if (typeof value === 'number') return value
    return 0
}

/** Production subscriber: wraps `firebase/firestore` onSnapshot. */
function makeFirestoreSubscriber(firestoreDb: Firestore): SnapshotSubscriber {
    return {
        subscribeSetlist(setlistId, onNext, onError) {
            const ref = fsDoc(firestoreDb, 'setlists', setlistId)
            return onSnapshot(
                ref,
                (snap) => {
                    if (!snap.exists()) {
                        onNext(null)
                        return
                    }
                    const data = snap.data() as Record<string, unknown>
                    const updatedAt = timestampToMs(data.updatedAt)
                    onNext({ data, updatedAt })
                },
                (err) => onError(err as Error),
            )
        },
        subscribeTracks(setlistId, onChanges, onError) {
            const q = query(
                fsCollection(firestoreDb, 'tracks'),
                where('setlistId', '==', setlistId),
            )
            return onSnapshot(
                q,
                (snap) => {
                    const changes: TrackChange[] = snap.docChanges().map((c) => {
                        const data = c.doc.data() as Record<string, unknown>
                        const updatedAt =
                            c.type === 'removed' ? 0 : timestampToMs(data.updatedAt)
                        return {
                            type: c.type as TrackChangeType,
                            docId: c.doc.id,
                            data,
                            updatedAt,
                        }
                    })
                    if (changes.length > 0) onChanges(changes)
                },
                (err) => onError(err as Error),
            )
        },
    }
}

async function hasPendingOutboxRow(
    db: LocalDb,
    collection: LocalCollection,
    docId: string,
): Promise<boolean> {
    // Outbox is small (<~50 rows in practice); a filter scan is cheaper
    // than a compound index and reuses the schema as-is. Any row in outbox
    // (status ∈ {pending, sending, failed}) means "engine has a write for
    // this docId in flight or stuck — let the engine resolve it".
    const found = await db.outbox
        .filter((r) => r.collection === collection && r.docId === docId)
        .first()
    return found !== undefined
}

export function startSnapshotListener(opts: SnapshotListenerOpts): () => void {
    const {
        setlistId,
        db,
        firestoreDb = defaultFirestoreDb,
        logger = defaultLogger,
        subscriber,
    } = opts

    const transport =
        subscriber ?? makeFirestoreSubscriber(firestoreDb)

    let cancelled = false

    async function handleSetlist(delivery: SetlistDelivery | null): Promise<void> {
        if (cancelled || !delivery) return
        try {
            await db.transaction('rw', db.setlists, db.outbox, async () => {
                if (await hasPendingOutboxRow(db, 'setlists', setlistId)) return
                const local = await db.setlists.get(setlistId)
                // v5h-01-02 fix (B): strict-equality guard against undefined
                // local.updatedAt — falling open under uncertainty would let
                // a cached delivery clobber a user edit the engine hasn't
                // resolved yet. Prefer the local row in two cases:
                //   - local exists but has no resolved updatedAt yet
                //   - local.updatedAt is at least as new as delivery
                if (local) {
                    if (local.updatedAt === undefined) return
                    if (local.updatedAt >= delivery.updatedAt) return
                }
                const next: LocalSetlist = {
                    ...(delivery.data as LocalSetlist),
                    id: setlistId,
                    updatedAt: delivery.updatedAt,
                } as LocalSetlist
                await db.setlists.put(next)
            })
        } catch (err) {
            logger.warn('[SnapshotListener] setlist apply failed', err)
            captureSyncFailure(err, {
                feature: 'snapshot-listener',
                site: 'setlist-apply',
                setlistId,
            })
        }
    }

    async function handleTracks(changes: TrackChange[]): Promise<void> {
        if (cancelled || changes.length === 0) return
        try {
            await db.transaction('rw', db.tracks, db.outbox, async () => {
                for (const change of changes) {
                    if (await hasPendingOutboxRow(db, 'tracks', change.docId)) {
                        // Engine has an in-flight write for this track —
                        // skip both put and delete. Engine writeback (v50-06-01)
                        // will sync the local row when its commit lands, OR
                        // ReconciliationProvider (v50-06-02) will surface
                        // the conflict.
                        continue
                    }

                    if (change.type === 'removed') {
                        const local = await db.tracks.get(change.docId)
                        if (local) await db.tracks.delete(change.docId)
                        continue
                    }

                    // added / modified
                    const local = await db.tracks.get(change.docId)
                    // v5h-01-02 fix (B): strict-equality guard mirroring
                    // the setlists branch — preserve local row when its
                    // updatedAt is undefined (engine writeback unresolved)
                    // OR when it's at least as new as the delivery.
                    if (local) {
                        if (local.updatedAt === undefined) continue
                        if (local.updatedAt >= change.updatedAt) continue
                    }
                    const next: LocalTrack = {
                        ...(change.data as LocalTrack),
                        id: change.docId,
                        updatedAt: change.updatedAt,
                    } as LocalTrack
                    await db.tracks.put(next)
                }
            })
        } catch (err) {
            logger.warn('[SnapshotListener] tracks apply failed', err)
            captureSyncFailure(err, {
                feature: 'snapshot-listener',
                site: 'tracks-apply',
                setlistId,
            })
        }
    }

    const unsubSetlist = transport.subscribeSetlist(
        setlistId,
        (delivery) => {
            void handleSetlist(delivery)
        },
        (err) => {
            logger.warn('[SnapshotListener] setlist subscription error', err)
            captureSyncFailure(err, {
                feature: 'snapshot-listener',
                site: 'setlist-subscribe',
                setlistId,
            })
        },
    )

    const unsubTracks = transport.subscribeTracks(
        setlistId,
        (changes) => {
            void handleTracks(changes)
        },
        (err) => {
            logger.warn('[SnapshotListener] tracks subscription error', err)
            captureSyncFailure(err, {
                feature: 'snapshot-listener',
                site: 'tracks-subscribe',
                setlistId,
            })
        },
    )

    return () => {
        cancelled = true
        try {
            unsubSetlist()
        } catch {
            // ignore
        }
        try {
            unsubTracks()
        } catch {
            // ignore
        }
    }
}
