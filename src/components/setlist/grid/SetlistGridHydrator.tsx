'use client'

import { useEffect, useRef, useState } from 'react'

import { logger } from '@/lib/logger'
import { applyEdit as defaultApplyEdit } from '@/lib/local/write'
import { getDb } from '@/lib/local/schema'
import { primeSongsLibrary as defaultPrimeSongsLibrary } from '@/lib/songs/prime'
import { captureSyncFailure } from '@/lib/sync/sentry-capture'
import type {
    EditDescriptor,
    LocalSetlist,
    LocalTrack,
} from '@/lib/local/types'
import {
    type SnapshotListenerOpts,
    startSnapshotListener as defaultStartSnapshotListener,
} from '@/lib/sync/snapshot-listener'

import { SetlistGrid, type SetlistGridProps } from './SetlistGrid'

export interface SetlistGridHydratorProps {
    setlistId: string
    initialSetlist: LocalSetlist
    initialTracks: LocalTrack[]
    gridProps?: Omit<SetlistGridProps, 'setlistId'>
    /** Test-seam: lets unit tests assert the listener is started/stopped
     *  without booting Firestore. Defaults to the production
     *  startSnapshotListener export. */
    startSnapshotListener?: (opts: SnapshotListenerOpts) => () => void
    /** Test-seam (v50-07-03): lets unit tests assert lazy-hydration fan-out
     *  without booting the real applyEdit/Dexie outbox path. Defaults to the
     *  production applyEdit export. */
    applyEdit?: (
        edit: EditDescriptor,
        options?: { withoutUndo?: boolean },
    ) => Promise<void>
    /** Test-seam (v53-02-01): lets unit tests assert library priming fires
     *  once-per-mount without booting Firestore. Defaults to the production
     *  primeSongsLibrary export. */
    primeSongsLibrary?: () => Promise<{ written: number }>
}

export function SetlistGridHydrator({
    setlistId,
    initialSetlist,
    initialTracks,
    gridProps,
    startSnapshotListener = defaultStartSnapshotListener,
    applyEdit = defaultApplyEdit,
    primeSongsLibrary = defaultPrimeSongsLibrary,
}: SetlistGridHydratorProps) {
    const [hydration, setHydration] = useState<'pending' | 'done'>('pending')
    /** v50-07-03 fire-once guard. Lazy-hydration is a one-shot migration
     *  cascade per mount; React effect dependency churn must not retrigger
     *  it (would enqueue duplicate outbox rows). */
    const fanoutStartedRef = useRef(false)
    /** v53-02-01 fire-once guard. Library priming is a one-shot read per
     *  mount; effect dependency churn must not retrigger it (would burn
     *  Firestore reads for no benefit — Dexie already has the data). */
    const primedRef = useRef(false)

    useEffect(() => {
        let cancelled = false
        const db = getDb()

        async function hydrate() {
            // LWW per-document: only overwrite local rows when the server's
            // updatedAt is newer (or local is missing). Server data is
            // authoritative — write directly to Dexie, NOT via applyEdit
            // (which would enqueue an outbox row and re-send back to Firestore).
            //
            // v5h-01-02 fix (F): outbox-pending guard. Server data is
            // authoritative ONLY when local has no in-flight edit. If an
            // outbox row exists for a docId (status ∈ {pending, sending,
            // failed}), the engine has yet to resolve a local edit — server
            // priming would silently clobber user intent. Mirrors the
            // snapshot-listener.ts:197 outbox-pending guard pattern.
            await db.transaction(
                'rw',
                db.setlists,
                db.tracks,
                db.outbox,
                async () => {
                    const setlistOutboxRow = await db.outbox
                        .filter(
                            (r) =>
                                r.collection === 'setlists' &&
                                r.docId === setlistId,
                        )
                        .first()
                    if (setlistOutboxRow === undefined) {
                        const localSetlist = await db.setlists.get(setlistId)
                        if (
                            !localSetlist ||
                            (localSetlist.updatedAt ?? 0) <
                                (initialSetlist.updatedAt ?? 0)
                        ) {
                            await db.setlists.put(initialSetlist)
                        }
                    }

                    if (initialTracks.length === 0) return

                    // Pre-fetch all pending track outbox rows in one scan to
                    // avoid N round-trips inside the loop. Outbox is small
                    // (<~50 rows in practice) so the unindexed scan is cheap.
                    const trackOutboxIds = new Set<string>()
                    const trackOutboxRows = await db.outbox
                        .filter((r) => r.collection === 'tracks')
                        .toArray()
                    for (const r of trackOutboxRows)
                        trackOutboxIds.add(r.docId)

                    const localById = new Map<string, LocalTrack>()
                    const localTracks = await db.tracks
                        .where('setlistId')
                        .equals(setlistId)
                        .toArray()
                    for (const t of localTracks) localById.set(t.id, t)

                    const toPut: LocalTrack[] = []
                    for (const t of initialTracks) {
                        if (trackOutboxIds.has(t.id)) continue
                        const local = localById.get(t.id)
                        if (
                            !local ||
                            ((local.updatedAt as number | undefined) ?? 0) <
                                ((t.updatedAt as number | undefined) ?? 0)
                        ) {
                            toPut.push(t)
                        }
                    }
                    if (toPut.length > 0) await db.tracks.bulkPut(toPut)
                },
            )

            if (!cancelled) setHydration('done')
        }

        void hydrate()
        return () => {
            cancelled = true
        }
    }, [setlistId, initialSetlist, initialTracks])

    // v50-06-03: cross-leader live-edit visibility. Once the hydrator
    // primes Dexie from the server-fetched snapshot, mount a Firestore
    // onSnapshot listener so any subsequent leader-tab edit propagates
    // here via direct db.put (NOT applyEdit — server data is authoritative).
    // Replaces the deleted v50-02 live-swap UI with the implicit real-time
    // setlist sync v5.0 promised. Closes the v50-06-02 'theirs' staleness
    // gap automatically: after a 'theirs' resolution the listener delivers
    // the winner's payload + updatedAt, restoring local-row freshness.
    useEffect(() => {
        if (hydration !== 'done') return
        const stop = startSnapshotListener({ setlistId, db: getDb() })
        return stop
    }, [hydration, setlistId, startSnapshotListener])

    // v50-07-03 (Option C Hybrid Lazy Hydration): on first edit-open of a
    // legacy setlist, fan out the embedded `tracks[]` into the top-level
    // `tracks/{id}` collection via the sync engine, then mark the setlist
    // `hydrated:true` so the migration is idempotent across mounts.
    //
    // Gates (any false → skip):
    //   - Dexie priming finished (hydration === 'done')
    //   - Setlist not already hydrated (initialSetlist.hydrated !== true)
    //   - There is something to migrate (initialTracks.length > 0)
    //   - We haven't already started the fan-out this mount (ref guard)
    //
    // applyEdit('set', ...) creates the top-level track + enqueues an outbox
    // row; the engine drains them to Firestore. `withoutUndo: true` keeps the
    // migration cascade off the undo stack — this is system intent, not user
    // intent. Errors are warn-logged: the setlist stays unhydrated and will
    // retry the cascade on the next mount.
    useEffect(() => {
        if (hydration !== 'done') return
        if (initialSetlist.hydrated === true) return
        if (initialTracks.length === 0) return
        if (fanoutStartedRef.current) return
        fanoutStartedRef.current = true

        let cancelled = false

        async function fanOut() {
            try {
                await Promise.all(
                    initialTracks.map((t) =>
                        applyEdit(
                            {
                                op: 'set',
                                collection: 'tracks',
                                doc: { ...t },
                            },
                            { withoutUndo: true },
                        ),
                    ),
                )
                if (cancelled) return
                await applyEdit(
                    {
                        op: 'update',
                        collection: 'setlists',
                        docId: setlistId,
                        patch: { hydrated: true },
                        expectedUpdatedAt: initialSetlist.updatedAt,
                    },
                    { withoutUndo: true },
                )
            } catch (err) {
                logger.warn(
                    `[SetlistGridHydrator] lazy-hydration fan-out failed for setlist ${setlistId}`,
                    err,
                )
                captureSyncFailure(err, {
                    feature: 'lazy-hydration',
                    setlistId,
                    trackCount: initialTracks.length,
                })
            }
        }

        void fanOut()
        return () => {
            cancelled = true
        }
    }, [
        hydration,
        setlistId,
        initialSetlist,
        initialTracks,
        applyEdit,
    ])

    // v53-02-01: best-effort library priming after Dexie hydration
    // completes. ChartBindPopover lives off `getDb().songs`; without a
    // priming read the picker is empty on first session open. Fire-and-
    // forget — the prime helper already swallows errors (defense-in-depth
    // catch here too); priming runs concurrently with lazy-hydration and
    // never blocks the user.
    //
    // Harness Fidelity Gate waiver scope: this effect is an additive
    // one-shot getDocs alongside the v50-07-03 lazy-hydration cascade.
    // No new write paths through the sync engine, no snapshot listener
    // on `songs/*` (cross-device freshness deferred to v5.4), no Dexie
    // schema bump. Mirrors the v50-06-03 server-authoritative read
    // pattern: priming uses `db.songs.put` directly (NOT applyEdit) so
    // it never enqueues outbox rows.
    useEffect(() => {
        if (hydration !== 'done') return
        if (primedRef.current) return
        primedRef.current = true
        void primeSongsLibrary().catch(() => {})
    }, [hydration, primeSongsLibrary])

    return (
        <div data-testid="setlist-grid-hydrator" data-hydration={hydration}>
            <SetlistGrid setlistId={setlistId} {...gridProps} />
        </div>
    )
}
