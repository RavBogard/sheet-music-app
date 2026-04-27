"use client"

import { useEffect, useState, useMemo } from "react"
import {
    collection,
    doc,
    getDocsFromServer,
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

    // v50-07-03 + v5h-01-03: dual-read for the v5.0 lazy-hydration cutover.
    // Editor writes go to top-level `tracks/{id}`; legacy `setlists/{id}.tracks[]`
    // is post-migration STALE-by-design (kept for unhydrated setlists' first paint).
    //
    // Firestore SDK has persistentLocalCache enabled (firebase.ts), so on every
    // mount the listener delivers from IDB cache first (often stale) and then
    // from the server (fresh, can take seconds). Without distinguishing the two,
    // the dual-read swaps to top-level on the cache delivery and shows stale
    // keys until server-fresh arrives — Daniel observed 60s+ of staleness
    // requiring multiple hard refreshes for recent edits to appear.
    //
    // Fix:
    //  1. `getDocsFromServer` on mount forces a server roundtrip that updates
    //     the local cache; the listener then delivers fresh data on its next tick.
    //  2. `{ includeMetadataChanges: true }` lets us see `snap.metadata.fromCache`
    //     so we can gate the dual-read swap on a confirmed server-fresh delivery.
    //  3. The dual-read prefers the embedded fallback until `hasServerSnapshot`
    //     becomes true. After, top-level wins (hydrated-aware, so unhydrated
    //     setlists with genuinely-empty top-level still fall back).
    //  4. On listener error, DO NOT clear topLevelTracks — preserve last known
    //     good state so a transient error doesn't blank the UI.
    //
    // Invariant (avoid the v5h-01-03 reverted-attempt regression): never return
    // [] while embedded has data. The gate only delays SWAPPING from embedded
    // to top-level, never delays rendering.
    const [topLevelTracks, setTopLevelTracks] = useState<SetlistTrack[]>([])
    const [hasServerSnapshot, setHasServerSnapshot] = useState(false)

    useEffect(() => {
        if (!setlistId) return
        let cancelled = false

        const q = query(
            collection(db, "tracks"),
            where("setlistId", "==", setlistId),
        )

        // Force a server roundtrip on mount. This updates the persistent IDB
        // cache so the listener's subsequent deliveries reflect fresh data
        // within a few hundred ms instead of waiting on Firestore's cache-vs-
        // server reconciliation (which can take 30-60s on slow networks).
        // Errors here are non-fatal; the listener still recovers eventually.
        getDocsFromServer(q).catch((err) => {
            if (cancelled) return
            logger.warn(
                `[useSetlistPerformance] initial server fetch failed for ${setlistId} (listener will retry)`,
                err,
            )
        })

        const unsub = onSnapshot(
            q,
            { includeMetadataChanges: true },
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
                if (snap.metadata.fromCache === false) {
                    setHasServerSnapshot(true)
                }
            },
            (err) => {
                if (cancelled) return
                logger.warn(
                    `[useSetlistPerformance] top-level tracks subscription error for ${setlistId}`,
                    err,
                )
                // Preserve topLevelTracks at last known state — a transient
                // error (token refresh race, brief network flap) shouldn't
                // blank the perf-view. Listener will recover automatically.
            },
        )
        return () => {
            cancelled = true
            unsub()
        }
    }, [setlistId])

    // Dual-read: prefer the embedded fallback until we've confirmed a server-
    // fresh delivery. After that, trust top-level (hydrated-aware).
    const tracks: SetlistTrack[] = (() => {
        if (!hasServerSnapshot) {
            // Pre-server-fresh: top-level may be a stale cache delivery.
            // Showing embedded is safer — for hydrated setlists it's stale-by-
            // design but equal-or-better than stale cache; for unhydrated it's
            // the truth. Either way, this avoids flashing pre-edit keys.
            return setlistData?.tracks || []
        }
        if (setlistData?.hydrated === true) {
            // Server confirmed for a migrated setlist: top-level is the truth,
            // even if briefly empty (real "no tracks" state).
            return topLevelTracks
        }
        // Unhydrated setlist post-server-confirm: top-level if it has data
        // (cascade ran), else fall back to embedded (cascade hasn't fired).
        return topLevelTracks.length > 0
            ? topLevelTracks
            : setlistData?.tracks || []
    })()
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
