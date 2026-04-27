"use client"

import { useEffect, useState, useMemo } from "react"
import {
    collection,
    doc,
    onSnapshot,
    query,
    where,
    type QueryDocumentSnapshot,
    type DocumentData,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { logger } from "@/lib/logger"
import { subscribeToMusicianProfile } from "@/lib/musician-profile"
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

export function useSetlistPerformance(setlistId: string): UseSetlistPerformanceReturn {
    const { user, isAdmin, isBandLeader } = useAuth()
    const isPublicView = !user
    const isLeader = isAdmin || isBandLeader

    // Subscribe to setlist document
    const setlistRef = useMemo(
        () => (setlistId ? doc(db, "setlists", setlistId) : null),
        [setlistId]
    )
    const { data: setlistData, loading, error } = useSafeFirestoreSync<Setlist>(setlistRef)

    // v50-07-03: dual-read for the v5.0 lazy-hydration cutover. Once a
    // legacy setlist is opened in the editor, SetlistGridHydrator fans its
    // embedded `tracks[]` into the top-level `tracks/{id}` collection. The
    // perf-view subscribes to that collection here.
    //
    // v5h-01-03 fix: (1) on onSnapshot error (e.g., permission-denied from
    // a tab opened before v5h-01-02 rules deployed), retry ONCE after 1s
    // with a fresh subscription — recovers from the rules-deploy race
    // without thrashing on persistent failures. (2) For hydrated setlists,
    // ALWAYS trust top-level (no fallback to embedded — embedded is
    // intentionally stale post-migration). Closes the perf-view side of
    // Daniel's UAT save-loss report.
    const [topLevelTracks, setTopLevelTracks] = useState<SetlistTrack[]>([])

    useEffect(() => {
        if (!setlistId) return

        let cancelled = false
        let attempt = 0
        let currentUnsub: (() => void) | null = null
        let retryTimer: ReturnType<typeof setTimeout> | null = null

        const subscribe = (): (() => void) => {
            const q = query(
                collection(db, "tracks"),
                where("setlistId", "==", setlistId),
            )
            return onSnapshot(
                q,
                (snap) => {
                    if (cancelled) return
                    const next = snap.docs
                        .map((d: QueryDocumentSnapshot<DocumentData>) => ({
                            id: d.id,
                            ...(d.data() as Omit<SetlistTrack, "id"> & {
                                order?: number
                            }),
                        }))
                        .sort(
                            (a, b) =>
                                ((a as { order?: number }).order ?? 0) -
                                ((b as { order?: number }).order ?? 0),
                        ) as SetlistTrack[]
                    setTopLevelTracks(next)
                },
                (err) => {
                    logger.warn(
                        `[useSetlistPerformance] top-level tracks subscription error for ${setlistId}`,
                        err,
                    )
                    setTopLevelTracks([])
                    // Resubscribe-once on error to recover from the v5h-01-02
                    // rules-deploy race (perf-view tabs opened before rules
                    // landed see one permission-denied, then succeed). Budget
                    // is exactly 1 retry — persistent failures stay silent
                    // and surface via Sentry's feature:snapshot-listener tag.
                    if (cancelled || attempt >= 1) return
                    retryTimer = setTimeout(() => {
                        retryTimer = null
                        if (cancelled) return
                        attempt = 1
                        currentUnsub = subscribe()
                    }, 1000)
                },
            )
        }

        currentUnsub = subscribe()

        return () => {
            cancelled = true
            if (retryTimer) clearTimeout(retryTimer)
            currentUnsub?.()
        }
    }, [setlistId])

    // v5h-01-03 fix: when the setlist has been migrated (hydrated:true),
    // top-level `tracks/{id}` is the sole source of truth. Falling through
    // to the legacy embedded `setlistData.tracks` would surface stale data
    // (Daniel's UAT: editor edit landed at top-level but perf-view showed
    // pre-edit values from embedded). For unhydrated setlists, retain the
    // v50-07-03 dual-read so the legacy embedded array still renders while
    // the lazy cascade is in flight.
    const tracks: SetlistTrack[] = setlistData?.hydrated === true
        ? topLevelTracks
        : (topLevelTracks.length > 0 ? topLevelTracks : setlistData?.tracks || [])
    const name: string = setlistData?.name || "Untitled"
    const serviceNotes: string | null = setlistData?.serviceNotes || null
    const musicians: SetlistMusician[] = setlistData?.musicians || []
    const rabbi: string | undefined = setlistData?.rabbi

    const currentTrackIndex = -1

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
