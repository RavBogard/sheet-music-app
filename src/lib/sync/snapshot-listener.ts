// Live server state for one setlist: Firestore onSnapshot on
// `setlists/{setlistId}` and on its tracks, written into the Dexie SERVER
// CACHE (src/lib/setlist-ops-client/server-cache.ts).
//
// Setlist sync PR 3: Dexie `tracks` and `setlists` hold server state only.
// Local edits live in the intent queue and are drawn over the cache by the
// view, so this listener has no guards for them any more: no "skip if the
// outbox has a row", no tombstones, no LWW on `updatedAt`, no version-bump
// exception. Each tracks snapshot that came from the SERVER (not the local
// Firestore cache) is the full set of the setlist's rows: rows the server no
// longer has are pruned, which is what makes ghost rows impossible.
//
// The listener never throws out of its callbacks. Firestore errors are logged
// and reported; a refused tracks listener can hand over to the caller
// (`onTracksRefused`, the public endpoint fallback).

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
import { logger as defaultLogger } from '@/lib/logger'
import { markLive } from '@/lib/setlist-ops-client/freshness'
import { whenMigrated } from '@/lib/setlist-ops-client/runtime'
import { putServerSetlist, replaceServerRows, type ServerRow } from '@/lib/setlist-ops-client/server-cache'
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
     *  Firestore synchronously (no lazy-load deferral). */
    firestoreDb?: Firestore
    /** Override for tests. Defaults to the app logger. */
    logger?: ListenerLogger
    /** Called once when the rules refuse the tracks listener
     *  (`permission-denied`): a viewer signed in to another tenant than the
     *  setlist's. The caller falls back to the public tracks endpoint. */
    onTracksRefused?: (err: Error) => void
    /** Test-only: a transport that bypasses Firestore. */
    subscriber?: SnapshotSubscriber
    /** Resolves before the first prune. Defaults to the old-outbox migration
     *  (its anchors read the cache, so it must run before ghosts are pruned). */
    ready?: () => Promise<void>
}

/** A setlist doc delivery. `fromCache` deliveries are ignored. */
export interface SetlistDelivery {
    data: Record<string, unknown>
    updatedAt: number
    fromCache?: boolean
}

/** One tracks snapshot: every row of the setlist. `fromCache` ones are ignored. */
export interface TracksDelivery {
    rows: ServerRow[]
    fromCache: boolean
}

/** Test-seam: an injectable transport for snapshot deliveries. */
export interface SnapshotSubscriber {
    subscribeSetlist(
        setlistId: string,
        onNext: (delivery: SetlistDelivery | null) => void,
        onError: (err: Error) => void,
    ): () => void
    subscribeTracks(
        setlistId: string,
        onSet: (delivery: TracksDelivery) => void,
        onError: (err: Error) => void,
        /** The setlist's tenant, when the caller knows it. */
        orgId?: string,
    ): () => void
}

function timestampToMs(value: unknown): number {
    if (value instanceof Timestamp) return value.toMillis()
    if (typeof value === 'number') return value
    return 0
}

function toTracksDelivery(snap: QuerySnapshot): TracksDelivery {
    return {
        fromCache: snap.metadata.fromCache,
        rows: snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
    }
}

/** The live tracks query. The orgId filter is what makes it legal: the
 *  `tracks` list rule (`atLeast(listOrg(), 'pe')`) reads
 *  `resource.data.orgId`, and a query that does not pin orgId is refused for
 *  everyone but the platform owner. Exported so the emulator rules test runs
 *  this exact query. */
export function liveTracksQuery(
    firestoreDb: Firestore,
    setlistId: string,
    orgId: string,
): Query {
    return setlistTracksQuery(firestoreDb, orgId, setlistId)
}

/** Attach the tracks listener once the tenant is known (see `orgId`).
 *  `includeMetadataChanges` so the server's confirmation of a set that the
 *  local Firestore cache already held still arrives as a non-cache snapshot. */
function attachTracks(
    firestoreDb: Firestore,
    setlistId: string,
    orgId: string | undefined,
    onSet: (delivery: TracksDelivery) => void,
    onError: (err: Error) => void,
): () => void {
    const listen = (tenant: string) =>
        onSnapshot(
            liveTracksQuery(firestoreDb, setlistId, tenant),
            { includeMetadataChanges: true },
            (snap) => onSet(toTracksDelivery(snap)),
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

function attachSetlist(
    firestoreDb: Firestore,
    setlistId: string,
    onNext: (delivery: SetlistDelivery | null) => void,
    onError: (err: Error) => void,
): () => void {
    return onSnapshot(
        fsDoc(firestoreDb, 'setlists', setlistId),
        { includeMetadataChanges: true },
        (snap) => {
            if (!snap.exists()) {
                if (!snap.metadata.fromCache) onNext(null)
                return
            }
            const data = snap.data() as Record<string, unknown>
            onNext({ data, updatedAt: timestampToMs(data.updatedAt), fromCache: snap.metadata.fromCache })
        },
        (err) => onError(err as Error),
    )
}

function makeFirestoreSubscriber(firestoreDb: Firestore): SnapshotSubscriber {
    return {
        subscribeSetlist: (setlistId, onNext, onError) => attachSetlist(firestoreDb, setlistId, onNext, onError),
        subscribeTracks: (setlistId, onSet, onError, orgId) => attachTracks(firestoreDb, setlistId, orgId, onSet, onError),
    }
}

/** Production subscriber: lazy-resolves Firestore via `subscribeWithDb` so the
 *  SDK chunk stays out of the eager preload graph. */
function makeLazyFirestoreSubscriber(): SnapshotSubscriber {
    return {
        subscribeSetlist: (setlistId, onNext, onError) =>
            subscribeWithDb((firestoreDb) => attachSetlist(firestoreDb, setlistId, onNext, onError)),
        subscribeTracks: (setlistId, onSet, onError, orgId) =>
            subscribeWithDb((firestoreDb) => attachTracks(firestoreDb, setlistId, orgId, onSet, onError)),
    }
}

/** Firestore error code, when there is one (`permission-denied`, …). */
function errorCode(err: unknown): string | undefined {
    const code = (err as { code?: unknown } | null)?.code
    return typeof code === 'string' ? code : undefined
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
        ready = whenMigrated,
    } = opts
    const logError = logger.error ?? defaultLogger.error
    const logInfo = logger.info ?? defaultLogger.info

    const transport =
        subscriber ??
        (firestoreDb
            ? makeFirestoreSubscriber(firestoreDb)
            : makeLazyFirestoreSubscriber())

    let cancelled = false
    // Deliveries apply one at a time, in arrival order.
    let chain: Promise<void> = Promise.resolve()
    const serial = (fn: () => Promise<void>) => {
        chain = chain.then(fn, fn)
    }

    async function handleSetlist(delivery: SetlistDelivery | null): Promise<void> {
        if (cancelled || !delivery || delivery.fromCache) return
        try {
            await putServerSetlist(db, setlistId, { ...delivery.data, updatedAt: delivery.updatedAt })
            markLive('setlist', setlistId)
        } catch (err) {
            logger.warn('[SnapshotListener] setlist apply failed', err)
            captureSyncFailure(err, {
                feature: 'snapshot-listener',
                site: 'setlist-apply',
                setlistId,
            })
        }
    }

    async function handleTracks(delivery: TracksDelivery): Promise<void> {
        if (cancelled || delivery.fromCache) return
        try {
            await ready()
            if (cancelled) return
            const r = await replaceServerRows(db, setlistId, delivery.rows)
            markLive('rows', setlistId)
            void recordEdit({
                ts: Date.now(),
                source: 'snapshot-listener',
                collection: 'tracks',
                docId: setlistId,
                outcome: r.pruned > 0 ? 'set-applied-pruned' : 'set-applied',
                payloadKeys: [`put:${r.put}`, `pruned:${r.pruned}`, `kept:${r.kept}`],
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
        (delivery) => serial(() => handleSetlist(delivery)),
        (err) => reportSubscribeError('setlist', err),
    )

    const unsubTracks = transport.subscribeTracks(
        setlistId,
        (delivery) => serial(() => handleTracks(delivery)),
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
    // listener on error and this module does not re-attach it. So it logs at
    // error level with the Firestore code and goes to Sentry.
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
