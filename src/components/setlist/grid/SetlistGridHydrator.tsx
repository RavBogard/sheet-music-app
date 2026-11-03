'use client'

import { useEffect, useRef } from 'react'

import { useAuth } from '@/lib/auth-context'
import { getDb } from '@/lib/local/schema'
import { primeSongsLibrary as defaultPrimeSongsLibrary } from '@/lib/songs/prime'
import {
    subscribeSongsLibrary as defaultSubscribeSongsLibrary,
    type SubscribeSongsLibraryOptions,
} from '@/lib/songs/subscribe'
import { tenantOfSetlist } from '@/lib/client-tracks'
import { useOrg } from '@/lib/org/org-context'
import type { LocalSetlist, LocalTrack } from '@/lib/local/types'
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
     *  without booting Firestore. */
    startSnapshotListener?: (opts: SnapshotListenerOpts) => () => void
    /** Deprecated test-seam (v53-02-01); production no longer calls it. */
    primeSongsLibrary?: () => Promise<{ written: number }>
    /** Test-seam (v60-09-01): the continuous songs subscription. */
    subscribeSongsLibrary?: (opts?: SubscribeSongsLibraryOptions) => () => void
}

/**
 * The editor page's live wiring (setlist sync PR 3).
 *
 * It no longer writes Dexie. The server frame the page was rendered with goes
 * to the grid as `initialSetlist` / `initialTracks`, and the view shows it
 * until this tab's listener delivers a live server set. The listener is then
 * the cache's only writer besides /ops answers (src/lib/setlist-ops-client/
 * server-cache.ts). The old priming pass (LWW put with outbox / tombstone /
 * content-hash guards) and the lazy-hydration fan-out (which re-`set` every
 * server row from the SSR copy) are gone with the outbox path they served.
 *
 * SIGNED OUT, DO NOT SUBSCRIBE (R-0919-audit-2): the tracks `list` rule needs
 * sign-in; a signed-out view renders from the server frame alone.
 */
export function SetlistGridHydrator({
    setlistId,
    initialSetlist,
    initialTracks,
    gridProps,
    startSnapshotListener = defaultStartSnapshotListener,
    primeSongsLibrary: _primeSongsLibrary = defaultPrimeSongsLibrary,
    subscribeSongsLibrary = defaultSubscribeSongsLibrary,
}: SetlistGridHydratorProps) {
    void _primeSongsLibrary
    const { user } = useAuth()
    const songsSubscribeRef = useRef<(() => void) | null>(null)

    // The tracks query filters by the setlist's tenant; without it the rules
    // refuse it for every non-po user (2026-11-03 fix).
    const listenerOrg = tenantOfSetlist(initialSetlist)
    useEffect(() => {
        if (!user) return
        const stop = startSnapshotListener({ setlistId, db: getDb(), orgId: listenerOrg })
        return stop
    }, [setlistId, startSnapshotListener, user, listenerOrg])

    // v60-09-01: continuous `songs/*` subscription (the chart pickers read
    // `getDb().songs`). Scoped to the HOST org and re-subscribed when the
    // org or the signed-in account changes.
    const hostOrg = useOrg()
    const songsUid = user?.uid ?? null
    useEffect(() => {
        if (songsSubscribeRef.current) return
        songsSubscribeRef.current = subscribeSongsLibrary({ orgId: hostOrg, uid: songsUid })
        return () => {
            songsSubscribeRef.current?.()
            songsSubscribeRef.current = null
        }
    }, [subscribeSongsLibrary, hostOrg, songsUid])

    return (
        <div data-testid="setlist-grid-hydrator" data-hydration="done">
            <SetlistGrid
                setlistId={setlistId}
                initialSetlist={initialSetlist}
                initialTracks={initialTracks}
                {...gridProps}
            />
        </div>
    )
}
