"use client"

import { useEffect, useState, useMemo } from "react"
import { doc } from "firebase/firestore"
import { useLiveQuery } from "dexie-react-hooks"

import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { logger } from "@/lib/logger"
import { subscribeToMusicianProfile } from "@/lib/musician-profile"
import { getDb } from "@/lib/local/schema"
import type { LocalTrack } from "@/lib/local/types"
import { getTracksForSetlistClient } from "@/lib/client-tracks"
import {
    type SnapshotListenerOpts,
    startSnapshotListener as defaultStartSnapshotListener,
} from "@/lib/sync/snapshot-listener"
import { Setlist, SetlistTrack, SetlistMusician } from "@/types/models"
import { MusicianProfile } from "@/types/models"

interface UseSetlistPerformanceReturn {
    tracks: SetlistTrack[]
    name: string
    serviceNotes: string | null
    loading: boolean
    error: Error | null
    currentTrackIndex: number
    defaultTransposition: number
    isWakeLockActive: boolean
    isLeader: boolean
    isPublicView: boolean
    setCurrentPosition: (index: number) => void
    musicians: SetlistMusician[]
    setlistId: string
    rabbi: string | undefined
}

interface UseSetlistPerformanceOpts {
    /** Test-seam: lets unit tests assert listener wiring without booting
     *  Firestore. Defaults to the production startSnapshotListener. */
    startSnapshotListener?: (opts: SnapshotListenerOpts) => () => void
}

/**
 * v5h-01-04: perf-view tracks are sourced from Dexie via useLiveQuery —
 * the same data path the editor uses. The previous implementation read
 * directly from Firestore via onSnapshot which was bound to the SDK's
 * persistent IDB cache + multi-tab manager and produced 60s+ staleness
 * on recent edits (Daniel UAT 2026-04-27). Reading from Dexie eliminates
 * that class of bugs:
 *  - Same-device same/cross-tab: Dexie writes propagate via dexie-react-
 *    hooks' BroadcastChannel-aware live query, instant.
 *  - Cross-device: snapshot-listener (mounted here for perf-view-only
 *    sessions) writes Firestore deliveries directly into Dexie via
 *    db.put with outbox-pending + LWW guards.
 *
 * Setlist metadata (name, rabbi, musicians, hydrated flag) still come
 * from Firestore via useSafeFirestoreSync — slow-changing, single-doc.
 *
 * Embedded fallback for unhydrated legacy setlists: when the cascade
 * hasn't run (setlistData.hydrated !== true), Dexie has no track rows
 * for the setlist. Fall back to setlistData.tracks[] — that's the
 * pre-v5.0 source. The lazy-cascade is intentionally NOT run here:
 *  (a) it would write to Firestore from a read-surface, semantically wrong;
 *  (b) the editor's SetlistGridHydrator already runs it on the next edit
 *     session, marking hydrated:true; subsequent perf-view mounts read
 *     from Dexie naturally.
 */
export function useSetlistPerformance(
    setlistId: string,
    opts: UseSetlistPerformanceOpts = {},
): UseSetlistPerformanceReturn {
    const { user, isAdmin, isBandLeader } = useAuth()
    const isPublicView = !user
    const isLeader = isAdmin || isBandLeader

    const startSnapshotListener =
        opts.startSnapshotListener ?? defaultStartSnapshotListener

    const setlistRef = useMemo(
        () => (setlistId ? doc(db, "setlists", setlistId) : null),
        [setlistId]
    )
    const { data: setlistData, loading: setlistLoading, error } =
        useSafeFirestoreSync<Setlist>(setlistRef)

    // Mount the snapshot-listener for cross-device delivery into Dexie.
    // Skip for unauthenticated public sessions — they'd hit permission-denied
    // on the underlying onSnapshot calls (see firestore.rules: read requires
    // isMember()). The page itself renders an error for public users.
    useEffect(() => {
        if (!setlistId || !user) return
        try {
            const stop = startSnapshotListener({
                setlistId,
                db: getDb(),
            })
            return stop
        } catch (err) {
            logger.warn(
                `[useSetlistPerformance] failed to mount snapshot listener for ${setlistId}`,
                err,
            )
        }
    }, [setlistId, user, startSnapshotListener])

    // Tracks: live-query Dexie, sorted by order. dexie-react-hooks returns
    // undefined while the query is in flight, [] when it resolves with no
    // rows. We distinguish the two for accurate loading semantics.
    const dexieTracks = useLiveQuery<LocalTrack[] | undefined>(
        () =>
            setlistId
                ? getDb()
                      .tracks.where("setlistId")
                      .equals(setlistId)
                      .sortBy("order")
                : Promise.resolve([]),
        [setlistId],
    )

    // v60-08-01: helper is single-branch (Dexie wins, else []). setlistData
    // param is retained for ABI stability; no longer in the dep list.
    const tracks: SetlistTrack[] = useMemo(
        () => getTracksForSetlistClient(dexieTracks, setlistData ?? undefined),
        [dexieTracks],
    )

    const name: string = setlistData?.name || "Untitled"
    const serviceNotes: string | null = setlistData?.serviceNotes || null
    const musicians: SetlistMusician[] = setlistData?.musicians || []
    const rabbi: string | undefined = setlistData?.rabbi

    const currentTrackIndex = -1

    // Loading: setlist still loading OR (hydrated setlist where Dexie is in
    // flight). For unhydrated setlists, loading=false once setlist resolves
    // because the embedded fallback is immediately available.
    const loading =
        setlistLoading ||
        (setlistData?.hydrated === true && dexieTracks === undefined)

    // Musician profile for default transposition
    const [musicianProfile, setMusicianProfile] = useState<MusicianProfile | null>(null)

    useEffect(() => {
        if (!user?.uid) return
        const unsub = subscribeToMusicianProfile(user.uid, (p) => {
            setMusicianProfile(p)
        })
        return unsub
    }, [user?.uid])

    const defaultTransposition = musicianProfile?.defaultTransposition || 0

    // Wake lock: acquire on mount
    const { isLocked: isWakeLockActive, requestWakeLock } = useWakeLock()

    useEffect(() => {
        requestWakeLock()
    }, [requestWakeLock])

    // No-op position control (live stepping removed)
    const setCurrentPosition = () => {}

    return {
        tracks,
        name,
        serviceNotes,
        loading,
        error,
        currentTrackIndex,
        defaultTransposition,
        isWakeLockActive,
        isLeader,
        isPublicView,
        setCurrentPosition,
        musicians,
        setlistId,
        rabbi,
    }
}
