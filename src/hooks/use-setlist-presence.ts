"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import {
    PresenceEntry,
    writePresence,
    removePresence,
    subscribeToPresence,
} from "@/lib/setlist-live"

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

    // Write presence
    const write = useCallback(() => {
        if (!setlistId || !uid) return
        writePresence(setlistId, uid, {
            uid,
            displayName,
            photoURL,
            status,
            currentSongIndex: null,
        })
    }, [setlistId, uid, displayName, photoURL, status])

    useEffect(() => {
        if (!setlistId || !uid) return

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
                write()
            }
        }

        window.addEventListener("beforeunload", handleUnload)
        window.addEventListener("pagehide", handleUnload)
        document.addEventListener("visibilitychange", handleVisibilityChange)

        return () => {
            window.removeEventListener("beforeunload", handleUnload)
            window.removeEventListener("pagehide", handleUnload)
            document.removeEventListener("visibilitychange", handleVisibilityChange)
            if (intervalRef.current) clearInterval(intervalRef.current)
            unsub()
            handleUnload()
        }
    }, [setlistId, uid, write])

    return others
}

