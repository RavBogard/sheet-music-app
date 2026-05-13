'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'

import { logger } from '@/lib/logger'
import { applyEdit as defaultApplyEdit } from '@/lib/local/write'
import { getDb } from '@/lib/local/schema'
import { primeSongsLibrary as defaultPrimeSongsLibrary } from '@/lib/songs/prime'
import { subscribeSongsLibrary as defaultSubscribeSongsLibrary } from '@/lib/songs/subscribe'
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
    /** Test-seam (v53-02-01, deprecated post v60-09-01): existing tests may
     *  still inject this; production no longer calls it (subscribeSongsLibrary
     *  replaces it). Retained so old `primeSongsLibrary={spy}` test props
     *  continue to compile without forcing test rewrites; the spy will simply
     *  never fire. */
    primeSongsLibrary?: () => Promise<{ written: number }>
    /** Test-seam (v60-09-01): lets unit tests assert library subscription
     *  starts once-per-mount without booting Firestore. Defaults to the
     *  production subscribeSongsLibrary export. */
    subscribeSongsLibrary?: () => () => void
}

export function SetlistGridHydrator({
    setlistId,
    initialSetlist,
    initialTracks,
    gridProps,
    startSnapshotListener = defaultStartSnapshotListener,
    applyEdit = defaultApplyEdit,
    primeSongsLibrary: _primeSongsLibrary = defaultPrimeSongsLibrary,
    subscribeSongsLibrary = defaultSubscribeSongsLibrary,
}: SetlistGridHydratorProps) {
    void _primeSongsLibrary
    const [hydration, setHydration] = useState<'pending' | 'done'>('pending')
    /** v50-07-03 fire-once guard. Lazy-hydration is a one-shot migration
     *  cascade per mount; React effect dependency churn must not retrigger
     *  it (would enqueue duplicate outbox rows). */
    const fanoutStartedRef = useRef(false)
    /** v60-09-01 fire-once guard. The continuous songs subscription mounts
     *  once per Hydrator instance; re-mounts cleanly unsubscribe via the
     *  effect's cleanup. Replaces the v53-02-01 primedRef one-shot. */
    const songsSubscribeRef = useRef<(() => void) | null>(null)
    /** v54-01-03 trackCount reconciler memory of the last value we wrote.
     *  Declared at the top so the lazy-hydration cascade (below) can seed
     *  it after writing trackCount in the same setlist update — without
     *  the seed, the reconciler would fire spuriously on first mount. */
    const lastWrittenCountRef = useRef<number | null>(null)
    /** v60-06-02: same dedup pattern for songCount + fileIds, seeded in
     *  the cascade alongside trackCount. */
    const lastWrittenSongCountRef = useRef<number | null>(null)
    const lastWrittenFileIdsRef = useRef<string[] | null>(null)

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
                db.tombstones,
                async () => {
                    // Bug 2 fix (2026-05-12): pre-fetch tombstones in this
                    // setlist's scope so we can refuse to resurrect rows
                    // the user intentionally deleted. Without this guard,
                    // the loop below would treat "local missing" as "needs
                    // server seed" — which is wrong when the user just
                    // deleted the row and the outbox row was discarded
                    // (via auto-resolve, dead-letter, or the user
                    // clicking "Discard failed change").
                    const tombstonedSetlist = await db.tombstones.get([
                        'setlists',
                        setlistId,
                    ])

                    const setlistOutboxRow = await db.outbox
                        .filter(
                            (r) =>
                                r.collection === 'setlists' &&
                                r.docId === setlistId,
                        )
                        .first()
                    if (setlistOutboxRow === undefined && !tombstonedSetlist) {
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

                    // Pre-fetch track tombstones for this initialTracks set.
                    // We only need to check the ids the server is about to
                    // hand us, not the whole table.
                    const trackTombstoneIds = new Set<string>()
                    if (initialTracks.length > 0) {
                        const tombstones = await db.tombstones
                            .where('[collection+docId]')
                            .anyOf(
                                initialTracks.map(
                                    (t) =>
                                        [
                                            'tracks' as const,
                                            t.id,
                                        ] as [string, string],
                                ),
                            )
                            .toArray()
                        for (const tb of tombstones)
                            trackTombstoneIds.add(tb.docId)
                    }

                    const localById = new Map<string, LocalTrack>()
                    const localTracks = await db.tracks
                        .where('setlistId')
                        .equals(setlistId)
                        .toArray()
                    for (const t of localTracks) localById.set(t.id, t)

                    const toPut: LocalTrack[] = []
                    for (const t of initialTracks) {
                        if (trackOutboxIds.has(t.id)) continue
                        // Bug 2 fix: tombstone guard — user deleted this
                        // track; server priming must not resurrect it.
                        if (trackTombstoneIds.has(t.id)) continue
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
                // P0 cascade-race fix (2026-05-12): include trackCount in
                // the same setlist update that flips hydrated:true. Pre-
                // fix the trackCount reconciler (below) would fire on its
                // 800ms debounce after the live count drifted from the
                // initial snapshot's trackCount, racing the cascade's
                // hydrated:true write. The race bumped setlists/{S}'s
                // server updatedAt past initialSetlist.updatedAt, so the
                // cascade's expectedUpdatedAt precondition failed → the
                // setlist row went 'failed' → modal opened. Single-write
                // fixes both.
                // v60-06-02: bundle songCount + fileIds into the same patch
                // so all three denormalized fields land atomically with
                // hydrated:true. Computed from the legacy embedded tracks
                // (the only authoritative source pre-hydration).
                const seedSongCount = initialTracks.filter(
                    (t) => !t.type || t.type === 'song',
                ).length
                const seedFileIds = Array.from(
                    new Set(
                        initialTracks
                            .map((t) => (t as { fileId?: string }).fileId)
                            .filter(
                                (id): id is string =>
                                    typeof id === 'string' && id.length > 0,
                            ),
                    ),
                ).sort()
                await applyEdit(
                    {
                        op: 'update',
                        collection: 'setlists',
                        docId: setlistId,
                        patch: {
                            hydrated: true,
                            trackCount: initialTracks.length,
                            songCount: seedSongCount,
                            fileIds: seedFileIds,
                        },
                        expectedUpdatedAt: initialSetlist.updatedAt,
                    },
                    { withoutUndo: true },
                )
                // Seed the reconciler's last-written ref so its initial
                // diff against initialSetlist.trackCount doesn't re-fire
                // immediately for the count we just wrote.
                lastWrittenCountRef.current = initialTracks.length
                lastWrittenSongCountRef.current = seedSongCount
                lastWrittenFileIdsRef.current = seedFileIds
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
    // v60-09-01: continuous `songs/*` subscription replaces the v53-02-01
    // one-shot prime. First snapshot delivers the same population effect;
    // subsequent snapshots keep Dexie live so rename/archive/upload mutations
    // from another device propagate to the picker without a reload. Single
    // mount per Hydrator instance via songsSubscribeRef; clean unsubscribe
    // on unmount. Server-authoritative reads — direct db.songs.put inside
    // the helper, never through the engine (no circular writes).
    useEffect(() => {
        if (hydration !== 'done') return
        if (songsSubscribeRef.current) return
        songsSubscribeRef.current = subscribeSongsLibrary()
        return () => {
            songsSubscribeRef.current?.()
            songsSubscribeRef.current = null
        }
    }, [hydration, subscribeSongsLibrary])

    // v54-01-03: trackCount reconciler. v50-05 moved tracks from the embedded
    // `setlists/{id}.tracks[]` array into a top-level `tracks/{id}` collection,
    // but `setlists/{id}.trackCount` was only written at create-time from the
    // (empty) initial tracks array. Result: every v50-05+ setlist's dashboard
    // card showed "0 songs" no matter how many tracks the user actually added.
    //
    // Fix: subscribe to the live tracks-by-setlistId count via Dexie, and when
    // it drifts from the last value we wrote (or from the initial snapshot)
    // patch `setlist.trackCount` via applyEdit. Single coupling point so every
    // track-mutating path in SetlistGrid (handlePickSong / handleCreateFreeText
    // / handleAddTrackOfType / handleDelete / handleBulkDelete / handleClone /
    // bulk drag-reorder) gets correct counts without each having to update
    // setlist.trackCount itself.
    //
    // Debounced 800ms so rapid adds (e.g. paste-multiple) write one count
    // patch instead of N. Skips the redundant write when the count already
    // matches what we last wrote (avoids a write loop on listener echo).
    const liveTrackCount = useLiveQuery(
        () =>
            getDb()
                .tracks.where('setlistId')
                .equals(setlistId)
                .count(),
        [setlistId],
    )
    useEffect(() => {
        if (hydration !== 'done') return
        if (liveTrackCount === undefined) return
        const currentStored =
            lastWrittenCountRef.current ?? initialSetlist.trackCount
        if (liveTrackCount === currentStored) return
        const handle = setTimeout(() => {
            // Re-check post-debounce in case writes raced — only fire the
            // patch if we still differ.
            if (liveTrackCount === lastWrittenCountRef.current) return
            void applyEdit({
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { trackCount: liveTrackCount },
            })
                .then(() => {
                    lastWrittenCountRef.current = liveTrackCount
                })
                .catch((err) => {
                    logger.warn(
                        '[SetlistGridHydrator] trackCount reconcile failed',
                        err,
                    )
                })
        }, 800)
        return () => clearTimeout(handle)
    }, [hydration, liveTrackCount, setlistId, initialSetlist.trackCount, applyEdit])

    // v60-06-02: parallel reconcilers for songCount + fileIds. Same 800ms
    // debounced applyEdit pattern as trackCount above. JS-side filter inside
    // useLiveQuery is fine for ~50 tracks/setlist; dexie-react-hooks
    // invalidates on any setlistId-scoped track change.
    const liveSongCount = useLiveQuery(
        () =>
            getDb()
                .tracks.where('setlistId')
                .equals(setlistId)
                .filter((t) => !t.type || (t.type as unknown) === 'song')
                .count(),
        [setlistId],
    )
    useEffect(() => {
        if (hydration !== 'done') return
        if (liveSongCount === undefined) return
        const currentStored =
            lastWrittenSongCountRef.current ??
            (initialSetlist as { songCount?: number }).songCount ??
            null
        if (liveSongCount === currentStored) return
        const handle = setTimeout(() => {
            if (liveSongCount === lastWrittenSongCountRef.current) return
            void applyEdit({
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { songCount: liveSongCount },
            })
                .then(() => {
                    lastWrittenSongCountRef.current = liveSongCount
                })
                .catch((err) => {
                    logger.warn(
                        '[SetlistGridHydrator] songCount reconcile failed',
                        err,
                    )
                })
        }, 800)
        return () => clearTimeout(handle)
    }, [hydration, liveSongCount, setlistId, initialSetlist, applyEdit])

    const liveFileIds = useLiveQuery<string[]>(
        async () => {
            const rows = await getDb()
                .tracks.where('setlistId')
                .equals(setlistId)
                .toArray()
            return Array.from(
                new Set(
                    rows
                        .map((r) => (r as { fileId?: string }).fileId)
                        .filter(
                            (id): id is string =>
                                typeof id === 'string' && id.length > 0,
                        ),
                ),
            ).sort()
        },
        [setlistId],
    )
    useEffect(() => {
        if (hydration !== 'done') return
        if (liveFileIds === undefined) return
        const lastWritten = lastWrittenFileIdsRef.current
        const lastFromInitial =
            (initialSetlist as { fileIds?: string[] }).fileIds
        const currentStored = lastWritten ?? lastFromInitial
        if (
            currentStored &&
            currentStored.length === liveFileIds.length &&
            currentStored.every((id, i) => id === liveFileIds[i])
        ) {
            return
        }
        const handle = setTimeout(() => {
            const echo = lastWrittenFileIdsRef.current
            if (
                echo &&
                echo.length === liveFileIds.length &&
                echo.every((id, i) => id === liveFileIds[i])
            ) {
                return
            }
            void applyEdit({
                op: 'update',
                collection: 'setlists',
                docId: setlistId,
                patch: { fileIds: liveFileIds },
            })
                .then(() => {
                    lastWrittenFileIdsRef.current = liveFileIds
                })
                .catch((err) => {
                    logger.warn(
                        '[SetlistGridHydrator] fileIds reconcile failed',
                        err,
                    )
                })
        }, 800)
        return () => clearTimeout(handle)
    }, [hydration, liveFileIds, setlistId, initialSetlist, applyEdit])

    return (
        <div data-testid="setlist-grid-hydrator" data-hydration={hydration}>
            <SetlistGrid setlistId={setlistId} {...gridProps} />
        </div>
    )
}
