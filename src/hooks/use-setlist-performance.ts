"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { subscribeToMusicianProfile } from "@/lib/musician-profile"
import { updateLiveTrack } from "@/lib/setlist-live"
import { SetlistTrack, SetlistMusician } from "@/types/models"
import { MusicianProfile } from "@/types/models"
import { LiveState } from "@/lib/setlist-live"

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
    const { data: setlistData, loading, error } = useSafeFirestoreSync<any>(setlistRef as any)

    // Extract fields from setlist data
    const tracks: SetlistTrack[] = setlistData?.tracks || []
    const name: string = setlistData?.name || "Untitled"
    const serviceNotes: string | null = setlistData?.serviceNotes || null
    const musicians: SetlistMusician[] = setlistData?.musicians || []

    // Live state: position tracking
    const liveState = setlistData?.liveState as LiveState | undefined
    const currentTrackIndex = liveState?.enabled ? liveState.currentTrackIndex : -1

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
        // Request wake lock when the performance page mounts
        // This is triggered by the user gesture of navigating to the page
        requestWakeLock()
    }, [requestWakeLock])

    // Leader position control
    const setCurrentPosition = useCallback(
        (index: number) => {
            if (!isLeader || !user) return
            updateLiveTrack(setlistId, index, user.uid, user.displayName || "Leader")
        },
        [isLeader, user, setlistId]
    )

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
    }
}
