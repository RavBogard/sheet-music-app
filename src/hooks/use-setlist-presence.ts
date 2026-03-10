"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import {
    PresenceEntry,
    writePresence,
    removePresence,
    subscribeToPresence,
} from "@/lib/setlist-live"
import { useMusicStore } from "@/lib/store"

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
    const uid = user?.uid || null
    const displayName = user?.displayName || "Anonymous"
    const photoURL = user?.photoURL || null
    const [others, setOthers] = useState<PresenceEntry[]>([])
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Write presence — use ref to avoid identity changes triggering effect re-runs
    const gigModeActive = useMusicStore(s => s.gigModeActive)

    const writeRef = useRef(() => {})
    writeRef.current = () => {
        if (!setlistId || !uid || gigModeActive) return
        writePresence(setlistId, uid, {
            uid,
            displayName,
            photoURL,
            status,
            currentSongIndex: null,
        })
    }

    useEffect(() => {
        if (!setlistId || !uid) return

        if (gigModeActive) {
            // Unmount/cleanup presence when entering gig mode
            removePresence(setlistId, uid)
            return
        }

        // Initial write
        writeRef.current()

        // Heartbeat — reads from ref so callback is always fresh
        intervalRef.current = setInterval(() => writeRef.current(), HEARTBEAT_MS)

        // Subscribe to others
        const unsub = subscribeToPresence(setlistId, (entries) => {
            // Filter out self, filter stale (> 2min)
            const now = Date.now()
            setOthers(
                entries.filter(
                    (e) =>
                        e.uid !== uid &&
                        e.lastSeen &&
                        now - e.lastSeen.toMillis() < 120_000
                )
            )
        })

        const handleUnload = () => {
            removePresence(setlistId, uid)
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                removePresence(setlistId, uid)
            } else {
                writeRef.current()
            }
        }

        window.addEventListener("beforeunload", handleUnload)
        window.addEventListener("pagehide", handleUnload)
        document.addEventListener("visibilitychange", handleVisibilityChange)

        return () => {
            window.removeEventListener("beforeunload", handleUnload)
            window.removeEventListener("pagehide", handleUnload)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            if (unsub) unsub()
            handleUnload()
        }
    }, [setlistId, uid, gigModeActive])

    return others
}

