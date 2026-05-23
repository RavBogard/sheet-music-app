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
    isWakeLockSupported: boolean
    requestWakeLock: () => Promise<void>
    releaseWakeLock: () => Promise<void>
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
    /** UNAUTH-009 (cycle-4 supplement): SSR-primed initial state. When the
     *  parent server component fetches setlist + tracks via Admin SDK and
     *  passes them in, the hook returns them immediately (no loading flicker)
     *  while the realtime subscriptions warm up in the background. Once the
     *  subscriptions deliver a value, the hook switches over to live data
     *  transparently — same data path as a fresh client mount, just with a
     *  non-empty starting frame. */
    initial?: {
        setlist: Setlist | null
        tracks: SetlistTrack[]
    } | null
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

    // v60-12-01: Mount the snapshot-listener for cross-device delivery into
    // Dexie, INCLUDING unauthenticated public sessions. Prior version skipped
    // public users because firestore.rules required isMember() to read
    // tracks/{trackId}; v60-12-01 opened tracks/* to public read (setlists
    // are already public, tracks are the natural extension). The stale
    // comment claiming "the page itself renders an error for public users"
    // was never true — the page renders the regular empty-state ("No tracks
    // yet"), which is what Daniel UAT 2026-05-13 reported as the bug.
    useEffect(() => {
        if (!setlistId) return
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
    }, [setlistId, startSnapshotListener])

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
    //
    // UNAUTH-009 (cycle-4 supplement): when SSR primed `opts.initial.tracks`
    // and Dexie's live-query is still in flight (`dexieTracks === undefined`),
    // surface the SSR rows so the band member sees the setlist on FCP rather
    // than a spinner. Once Dexie resolves (even to []), we trust its result.
    const initial = opts.initial ?? null
    const liveTracks: SetlistTrack[] = useMemo(
        () => getTracksForSetlistClient(dexieTracks, setlistData ?? undefined),
        [dexieTracks],
    )
    const tracks: SetlistTrack[] =
        dexieTracks === undefined && initial?.tracks?.length
            ? initial.tracks
            : liveTracks

    const name: string =
        setlistData?.name || initial?.setlist?.name || "Untitled"
    const serviceNotes: string | null =
        setlistData?.serviceNotes ?? initial?.setlist?.serviceNotes ?? null
    const musicians: SetlistMusician[] =
        setlistData?.musicians || initial?.setlist?.musicians || []
    const rabbi: string | undefined =
        setlistData?.rabbi ?? initial?.setlist?.rabbi

    const currentTrackIndex = -1

    // Loading: setlist still loading OR (hydrated setlist where Dexie is in
    // flight). For unhydrated setlists, loading=false once setlist resolves
    // because the embedded fallback is immediately available.
    //
    // UNAUTH-009: if SSR primed initial setlist + at least one track, we
    // already have a renderable frame — skip the loading spinner entirely.
    // Subscriptions still warm up in the background and replace state once
    // delivered.
    const hasSsrFrame = !!initial?.setlist && (initial?.tracks?.length ?? 0) >= 0
    const loading =
        !hasSsrFrame &&
        (setlistLoading ||
            (setlistData?.hydrated === true && dexieTracks === undefined))

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

    // Wake lock: surface the controls so the caller can render a
    // gesture-gated toggle (e.g. SetlistPerformClient's "Keep screen on"
    // header button). DO NOT auto-call requestWakeLock on mount — iOS Safari
    // rejects `navigator.wakeLock.request('screen')` with NotAllowedError
    // outside a transient user-activation context, and the rejection is
    // swallowed as a debug log. The Yizkor-service regression 2026-05-23
    // (iPad screen timed out mid-service) was exactly this: the hook fired
    // on mount, iOS no-op'd it, no UI surfaced the failure, the iPad slept.
    const {
        isSupported: isWakeLockSupported,
        isLocked: isWakeLockActive,
        requestWakeLock,
        releaseWakeLock,
    } = useWakeLock()

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
        isWakeLockSupported,
        requestWakeLock,
        releaseWakeLock,
        isLeader,
        isPublicView,
        setCurrentPosition,
        musicians,
        setlistId,
        rabbi,
    }
}
