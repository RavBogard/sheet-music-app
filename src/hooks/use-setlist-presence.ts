"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import {
    PresenceEntry,
    writePresence,
    removePresence,
    subscribeToPresence,
    LiveState,
} from "@/lib/setlist-live"
import { onSnapshot, doc } from "firebase/firestore"
import { db } from "@/lib/firebase"

const HEARTBEAT_MS = 30_000

/**
 * Manages presence for a setlist — writes on mount, heartbeats,
 * subscribes to other users' presence, cleans up on unmount.
 */
export function useSetlistPresence(
    setlistId: string | null,
    status: "editing" | "performing" | "viewing" = "viewing"
) {
    const { user } = useAuth()
    const [others, setOthers] = useState<PresenceEntry[]>([])
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Write presence
    const write = useCallback(() => {
        if (!setlistId || !user) return
        writePresence(setlistId, user.uid, {
            uid: user.uid,
            displayName: user.displayName || "Anonymous",
            photoURL: user.photoURL || null,
            status,
            currentSongIndex: null,
        })
    }, [setlistId, user, status])

    useEffect(() => {
        if (!setlistId || !user) return

        // Initial write
        write()

        // Heartbeat
        intervalRef.current = setInterval(write, HEARTBEAT_MS)

        // Subscribe to others
        const unsub = subscribeToPresence(setlistId, (entries) => {
            // Filter out self, filter stale (> 2min)
            const now = Date.now()
            setOthers(
                entries.filter(
                    (e) =>
                        e.uid !== user.uid &&
                        e.lastSeen &&
                        now - e.lastSeen.toMillis() < 120_000
                )
            )
        })

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            unsub()
            removePresence(setlistId, user.uid)
        }
    }, [setlistId, user, write])

    return others
}

/**
 * Subscribe to a setlist's liveState field for real-time "go to song" commands.
 */
export function useLiveState(setlistId: string | null) {
    const [liveState, setLiveState] = useState<LiveState | null>(null)

    useEffect(() => {
        if (!setlistId) return
        const ref = doc(db, "setlists", setlistId)
        const unsub = onSnapshot(ref, (snap) => {
            const data = snap.data()
            if (data?.liveState?.enabled) {
                setLiveState(data.liveState as LiveState)
            } else {
                setLiveState(null)
            }
        })
        return unsub
    }, [setlistId])

    return liveState
}
