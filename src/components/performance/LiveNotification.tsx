"use client"

import { useState, useEffect, useRef } from "react"
import { useLiveState } from "@/hooks/use-setlist-presence"
import { useMusicStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { Radio, ArrowRight } from "lucide-react"

interface LiveNotificationProps {
    setlistId: string | null
}

/**
 * Floating notification that appears when a leader sends a "go to song" command.
 * Shows for 6 seconds, tappable to jump to the indicated track.
 */
export function LiveNotification({ setlistId }: LiveNotificationProps) {
    const router = useRouter()
    const liveState = useLiveState(setlistId)
    const { playbackQueue, queueIndex } = useMusicStore()
    const [notification, setNotification] = useState<{
        trackName: string
        trackIndex: number
        updatedByName: string
    } | null>(null)
    const lastIndexRef = useRef<number | null>(null)

    useEffect(() => {
        if (!liveState?.enabled) {
            lastIndexRef.current = null
            return
        }

        const newIndex = liveState.currentTrackIndex
        // Only notify if it's a change and not the current song
        if (
            lastIndexRef.current !== null &&
            newIndex !== lastIndexRef.current &&
            newIndex !== queueIndex &&
            playbackQueue[newIndex]
        ) {
            setNotification({
                trackName: playbackQueue[newIndex].name,
                trackIndex: newIndex,
                updatedByName: liveState.updatedByName || "Leader",
            })

            // Auto-dismiss after 6s
            const timer = setTimeout(() => setNotification(null), 6000)
            return () => clearTimeout(timer)
        }

        lastIndexRef.current = newIndex
    }, [liveState, playbackQueue, queueIndex])

    const handleJump = () => {
        if (notification && playbackQueue[notification.trackIndex]) {
            const track = playbackQueue[notification.trackIndex]
            router.push(`/perform/${track.fileId}`)
        }
        setNotification(null)
    }

    if (!notification) return null

    return (
        <button
            onClick={handleJump}
            role="alert"
            aria-label={`${notification.updatedByName} moved to ${notification.trackName}. Tap to jump.`}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-red-600/95 backdrop-blur-sm text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300"
        >
            <Radio className="w-4 h-4 animate-pulse shrink-0" />
            <div className="text-left text-sm">
                <div className="font-semibold">{notification.updatedByName} moved to:</div>
                <div className="text-white/80 text-xs">{notification.trackName}</div>
            </div>
            <ArrowRight className="w-4 h-4 shrink-0 opacity-60" />
        </button>
    )
}

/**
 * Small LIVE badge indicator for the performance toolbar.
 */
export function LiveBadge({ setlistId }: { setlistId: string | null }) {
    const liveState = useLiveState(setlistId)
    if (!liveState?.enabled) return null

    return (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-600/20 border border-red-500/30 rounded-full" aria-label="Live sync active" role="status">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Live</span>
        </div>
    )
}
