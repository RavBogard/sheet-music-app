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
    doc as fsDoc,
    getDoc,
    onSnapshot,
} from 'firebase/firestore'
import type { Firestore, Query, QuerySnapshot } from 'firebase/firestore'

import { tenantOfSetlist } from '@/lib/client-tracks'
import { setlistTracksQuery } from '@/lib/tenant-query'
import { subscribeWithDb } from '@/lib/firebase'
import type { LocalDb } from '@/lib/local/schema'
import type { LocalCollection, LocalSetlist, LocalTrack } from '@/lib/local/types'
import { logger as defaultLogger } from '@/lib/logger'
import { recordEdit } from './edit-log'
import { captureSyncFailure } from './sentry-capture'

interface ListenerLogger {
    warn: (msg: string, err?: unknown) => void
    /** An expected, handled refusal goes here. Falls back to the app logger. */
    info?: (msg: string, err?: unknown) => void
    /** A refused subscription goes here. Falls back to the app logger. */
    error?: (msg: string, err?: unknown) => void
}

export interface SnapshotListenerOpts {
    setlistId: string
    db: LocalDb
    /** The setlist's tenant (`tenantOfSetlist`). The tracks query filters by
     *  it, which is what the rules require. Leave it out only when the caller
     *  does not have the setlist yet: the Firestore subscriber then reads the
     *  setlist doc first and attaches the tracks query after, never with a
     *  guessed tenant. */
    orgId?: string
    /** Override for tests. When provided, the subscriber wraps the given
     *  Firestore synchronously (no lazy-load deferral). When absent, the
     *  default subscriber lazy-resolves Firestore via `subscribeWithDb`
     *  so the SDK chunk stays out of the eager preload graph. */
    firestoreDb?: Firestore
    /** Override for tests. Defaults to the app logger. */
    logger?: ListenerLogger
    /** Called once when the rules refuse the tracks listener
     *  (`permission-denied`): a viewer signed in to another tenant than the
     *  setlist's. The caller falls back to the public tracks endpoint. */
    onTracksRefused?: (err: Error) => void
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
        /** The setlist's tenant, when the caller knows it. */
        orgId?: string,
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

function toTrackChanges(snap: QuerySnapshot): TrackChange[] {
    return snap.docChanges().map((c) => {
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
}

/** The live tracks query. The orgId filter is what makes it legal: the
 *  `tracks` list rule (`atLeast(listOrg(), 'pe')`) reads
 *  `resource.data.orgId`, and a query that does not pin orgId is refused for
 *  everyone but the platform owner. From caacfb34 (2026-10-13) until this fix
 *  the listener sent setlistId alone, so no band device got live rows.
 *  Exported so the emulator rules test runs this exact query. */
export function liveTracksQuery(
    firestoreDb: Firestore,
    setlistId: string,
    orgId: string,
): Query {
    return setlistTracksQuery(firestoreDb, orgId, setlistId)
}

/** Attach the tracks listener once the tenant is known. With `orgId` it
 *  attaches at once. Without it, it reads the setlist doc first (a public
 *  `get`) and uses that doc's tenant, else the host's (`tenantOfSetlist`), so
 *  the query never goes out on a guess. A setlist that does not exist has no
 *  rows to watch, so nothing attaches. */
function attachTracks(
    firestoreDb: Firestore,
    setlistId: string,
    orgId: string | undefined,
    onChanges: (changes: TrackChange[]) => void,
    onError: (err: Error) => void,
): () => void {
    const listen = (tenant: string) =>
        onSnapshot(
            liveTracksQuery(firestoreDb, setlistId, tenant),
            (snap) => {
                const changes = toTrackChanges(snap)
                if (changes.length > 0) onChanges(changes)
            },
            (err) => onError(err as Error),
        )
    if (orgId) return listen(orgId)

    let cancelled = false
    let inner: (() => void) | null = null
    getDoc(fsDoc(firestoreDb, 'setlists', setlistId))
        .then((snap) => {
            if (cancelled || !snap.exists()) return
            inner = listen(tenantOfSetlist(snap.data()))
        })
        .catch((err) => {
            if (!cancelled) onError(err as Error)
        })
    return () => {
        cancelled = true
        if (inner) inner()
        inner = null
    }
}

/** Test-path subscriber: wraps `firebase/firestore` onSnapshot synchronously
 *  against a caller-provided Firestore instance. Used only when tests inject
 *  `opts.firestoreDb`. */
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
        subscribeTracks(setlistId, onChanges, onError, orgId) {
            return attachTracks(firestoreDb, setlistId, orgId, onChanges, onError)
        },
    }
}

/** Production subscriber: lazy-resolves Firestore via `subscribeWithDb` so the
 *  SDK chunk stays out of the eager preload graph. The sync unsubscribe
 *  contract is preserved by `subscribeWithDb` (calling it before the inner
 *  attach lands cleanly cancels). */
function makeLazyFirestoreSubscriber(): SnapshotSubscriber {
    return {
        subscribeSetlist(setlistId, onNext, onError) {
            return subscribeWithDb((firestoreDb) => {
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
            })
        },
        subscribeTracks(setlistId, onChanges, onError, orgId) {
            return subscribeWithDb((firestoreDb) =>
                attachTracks(firestoreDb, setlistId, orgId, onChanges, onError),
            )
        },
    }
}

/** Firestore error code, when there is one (`permission-denied`, …). */
function errorCode(err: unknown): string | undefined {
    const code = (err as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : undefined
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
        orgId,
        firestoreDb,
        logger = defaultLogger,
        subscriber,
        onTracksRefused,
    } = opts
    const logError = logger.error ?? defaultLogger.error
    const logInfo = logger.info ?? defaultLogger.info

    const transport =
        subscriber ??
        (firestoreDb
            ? makeFirestoreSubscriber(firestoreDb)
            : makeLazyFirestoreSubscriber())

    let cancelled = false

    async function handleSetlist(delivery: SetlistDelivery | null): Promise<void> {
        if (cancelled || !delivery) return
        try {
            await db.transaction(
                'rw',
                db.setlists,
                db.outbox,
                db.tombstones,
                async () => {
                    if (await hasPendingOutboxRow(db, 'setlists', setlistId))
                        return
                    // Bug 2 fix (2026-05-12): tombstone guard. If the user
                    // intentionally deleted this setlist, server priming must
                    // not resurrect it — even if the outbox row was discarded
                    // (auto-resolve / dead-letter / user-discard) since the
                    // delete attempt.
                    const tombstone = await db.tombstones.get([
                        'setlists',
                        setlistId,
                    ])
                    if (tombstone) return
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
                },
            )
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
            // v5h3-01-02: collect per-change outcomes inside the tx so we
            // can fire the recordEdit breadcrumbs OUTSIDE the tx (avoids
            // nesting a second Dexie transaction inside this one).
            const outcomes: Array<{
                docId: string
                outcome: string
                localUpdatedAt?: number
            }> = []
            await db.transaction(
                'rw',
                db.tracks,
                db.outbox,
                db.tombstones,
                async () => {
                for (const change of changes) {
                    if (await hasPendingOutboxRow(db, 'tracks', change.docId)) {
                        // Engine has an in-flight write for this track —
                        // skip both put and delete. Engine writeback (v50-06-01)
                        // will sync the local row when its commit lands, OR
                        // ReconciliationProvider (v50-06-02) will surface
                        // the conflict.
                        outcomes.push({
                            docId: change.docId,
                            outcome: 'guard-skipped-pending',
                        })
                        continue
                    }

                    if (change.type === 'removed') {
                        const local = await db.tracks.get(change.docId)
                        if (local) await db.tracks.delete(change.docId)
                        // Server confirmed the delete — clear any tombstone
                        // we wrote locally so it doesn't linger.
                        await db.tombstones.delete(['tracks', change.docId])
                        outcomes.push({
                            docId: change.docId,
                            outcome: 'remove-applied',
                        })
                        continue
                    }

                    // added / modified
                    // Bug 2 fix (2026-05-12): tombstone guard. User
                    // intentionally deleted this track; server priming must
                    // not resurrect it.
                    const tombstone = await db.tombstones.get([
                        'tracks',
                        change.docId,
                    ])
                    if (tombstone) {
                        outcomes.push({
                            docId: change.docId,
                            outcome: 'guard-skipped-tombstoned',
                        })
                        continue
                    }
                    const local = await db.tracks.get(change.docId)
                    // v5h-01-02 fix (B): strict-equality guard mirroring
                    // the setlists branch — preserve local row when its
                    // updatedAt is undefined (engine writeback unresolved)
                    // OR when it's at least as new as the delivery.
                    if (local) {
                        if (local.updatedAt === undefined) {
                            outcomes.push({
                                docId: change.docId,
                                outcome: 'guard-skipped-undefined',
                            })
                            continue
                        }
                        if (local.updatedAt >= change.updatedAt) {
                            outcomes.push({
                                docId: change.docId,
                                outcome: 'guard-skipped-stale',
                                localUpdatedAt: local.updatedAt,
                            })
                            continue
                        }
                    }
                    const next: LocalTrack = {
                        ...(change.data as LocalTrack),
                        id: change.docId,
                        updatedAt: change.updatedAt,
                    } as LocalTrack
                    await db.tracks.put(next)
                    outcomes.push({
                        docId: change.docId,
                        outcome: 'applied',
                        localUpdatedAt: change.updatedAt,
                    })
                }
            })
            // v5h3-01-02: emit edit-log breadcrumbs AFTER the tx commits.
            // Fire-and-forget; recordEdit is failure-swallowing so this
            // never blocks or crashes the listener.
            const breadcrumbTs = Date.now()
            for (const o of outcomes) {
                void recordEdit({
                    ts: breadcrumbTs,
                    source: 'snapshot-listener',
                    collection: 'tracks',
                    docId: o.docId,
                    outcome: o.outcome,
                    localUpdatedAt: o.localUpdatedAt,
                })
            }
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
        (err) => reportSubscribeError('setlist', err),
    )

    const unsubTracks = transport.subscribeTracks(
        setlistId,
        (changes) => {
            void handleTracks(changes)
        },
        (err) => {
            // A refusal the caller handles (another tenant's setlist, read
            // through the public endpoint instead) is expected: info, no Sentry.
            if (errorCode(err) === 'permission-denied' && onTracksRefused) {
                logInfo(
                    `[SnapshotListener] tracks listener refused for setlist=${setlistId} (org=${orgId ?? 'from-setlist'}); using the public endpoint`,
                    err,
                )
                if (!cancelled) onTracksRefused(err)
                return
            }
            reportSubscribeError('tracks', err)
        },
        orgId,
    )

    // A refused subscription is a dead one: Firestore terminates a query
    // listener on error and this module does not re-attach it, so there is
    // no retry loop to throttle. What it must not be is quiet: before the
    // tracks orgId fix every band device's live rows died here at warn level.
    // So it logs at error level with the Firestore code and goes to Sentry.
    function reportSubscribeError(kind: 'setlist' | 'tracks', err: Error): void {
        const code = errorCode(err) ?? 'unknown'
        logError(
            `[SnapshotListener] ${kind} subscription refused or failed (code=${code}, setlist=${setlistId}${
                kind === 'tracks' ? `, org=${orgId ?? 'from-setlist'}` : ''
            }); live updates for this ${kind === 'tracks' ? 'setlist\'s rows' : 'setlist'} are off until reload`,
            err,
        )
        captureSyncFailure(err, {
            feature: 'snapshot-listener',
            site: kind === 'tracks' ? 'tracks-subscribe' : 'setlist-subscribe',
            setlistId,
        })
    }

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
