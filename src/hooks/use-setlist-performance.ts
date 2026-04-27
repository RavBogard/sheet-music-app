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
    // from server. Without forcing a roundtrip, the dual-read used to swap to
    // top-level on a stale-cache delivery and show pre-edit keys for 60s+
    // until passive server reconciliation eventually fired — Daniel observed
    // this end-to-end and it required multiple hard refreshes to recover.
    //
    // Fix:
    //  1. `getDocsFromServer(q)` on mount forces a server roundtrip; its
    //     `.then(snap)` callback IS our authoritative server-fresh signal.
    //     We seed topLevelTracks from that snapshot and flip the gate.
    //     (Originally tried `{ includeMetadataChanges: true }` + `metadata.fromCache`
    //     to detect server-fresh, but that flag indicates SOURCE not freshness:
    //     after the server roundtrip, listener deliveries from the now-fresh
    //     cache still report fromCache=true, so the gate would never flip.)
    //  2. Dual-read prefers the embedded fallback until `hasServerSnapshot`
    //     becomes true. After, top-level wins (hydrated-aware so unhydrated
    //     setlists with genuinely-empty top-level still fall back).
    //  3. The onSnapshot listener handles ongoing updates after the initial
    //     server fetch. Its deliveries also seed topLevelTracks (so cell-
    //     commit live updates land), but the gate is owned by getDocsFromServer.
    //  4. On listener error, DO NOT clear topLevelTracks — preserve last known
    //     good state so a transient error (token refresh race, brief network
    //     flap) doesn't blank the perf-view.
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

        const sortDocs = (
            docs: Array<QueryDocumentSnapshot<DocumentData>>,
        ): SetlistTrack[] =>
            docs
                .map((d) => ({
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

        // Force a server roundtrip on mount. The .then resolves with
        // authoritative server-fresh data — that's our signal to flip the
        // dual-read gate (NOT the listener's metadata.fromCache flag, which
        // tracks source not freshness).
        getDocsFromServer(q)
            .then((snap) => {
                if (cancelled) return
                setTopLevelTracks(sortDocs(snap.docs))
                setHasServerSnapshot(true)
            })
            .catch((err) => {
                if (cancelled) return
                logger.warn(
                    `[useSetlistPerformance] initial server fetch failed for ${setlistId} (listener still active)`,
                    err,
                )
                // Stay with embedded fallback until the listener delivers
                // something. If the server is genuinely unreachable, this is
                // the safest state.
            })

        const unsub = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snap) => {
                if (cancelled) return
                setTopLevelTracks(sortDocs(snap.docs))
                // Backup gate signal: if the listener delivers a confirmed
                // non-cache snapshot, that's also server-fresh evidence.
                // (In production, after getDocsFromServer warms the cache,
                // listener deliveries from cache will report fromCache=true
                // even with fresh data — getDocsFromServer.then is the
                // primary gate. This branch handles the case where the
                // listener fires server-fresh on its own first.)
                if (snap.metadata?.fromCache === false) {
                    setHasServerSnapshot(true)
                }
            },
            (err) => {
                if (cancelled) return
                logger.warn(
                    `[useSetlistPerformance] top-level tracks subscription error for ${setlistId}`,
                    err,
                )
                // Preserve topLevelTracks at last known state.
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
