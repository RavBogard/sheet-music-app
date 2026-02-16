"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { useLiveState } from "@/hooks/use-setlist-presence"
import { useAuth } from "@/lib/auth-context"
import { Radio, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * LiveIndicator — shown in performance mode when the active setlist has live mode enabled.
 * Displays a pulsing LIVE badge and a "Jump to song" toast when the leader changes tracks.
 */
export function LiveIndicator() {
    const router = useRouter()
    const { user } = useAuth()
    const { currentSetlistId, playbackQueue, queueIndex } = useMusicStore()
    const liveState = useLiveState(currentSetlistId)

    const [jumpNotification, setJumpNotification] = useState<{
        trackName: string
        trackIndex: number
        leaderName: string
    } | null>(null)

    const prevTrackIndexRef = useRef<number | null>(null)
    const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Watch for live state track changes
    useEffect(() => {
        if (!liveState || !liveState.enabled) {
            setJumpNotification(null)
            prevTrackIndexRef.current = null
            return
        }

        const { currentTrackIndex, updatedBy, updatedByName } = liveState

        // Don't notify for own changes or if it's the same track we're already on
        if (updatedBy === user?.uid) {
            prevTrackIndexRef.current = currentTrackIndex
            return
        }

        // Only notify when the track actually changes
        if (prevTrackIndexRef.current !== null && currentTrackIndex !== prevTrackIndexRef.current && currentTrackIndex !== queueIndex) {
            const track = playbackQueue[currentTrackIndex]
            if (track) {
                setJumpNotification({
                    trackName: track.name,
                    trackIndex: currentTrackIndex,
                    leaderName: updatedByName || "Leader"
                })

                // Auto-dismiss after 8 seconds
                if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current)
                dismissTimeoutRef.current = setTimeout(() => setJumpNotification(null), 8000)
            }
        }

        prevTrackIndexRef.current = currentTrackIndex
    }, [liveState, user?.uid, playbackQueue, queueIndex])

    // Dismiss notification if user manually navigates to the right song
    useEffect(() => {
        if (jumpNotification && queueIndex === jumpNotification.trackIndex) {
            setJumpNotification(null)
        }
    }, [queueIndex, jumpNotification])

    const handleJump = () => {
        if (!jumpNotification) return
        const track = playbackQueue[jumpNotification.trackIndex]
        if (track) {
            // Navigate to the song
            const { nextSong, prevSong } = useMusicStore.getState()
            // Set queue index directly and navigate
            useMusicStore.setState({
                queueIndex: jumpNotification.trackIndex,
                transposition: track.transposition ?? 0,
                aiState: { isEnabled: false, scanningPages: [], pageData: {}, error: null }
            })
            router.push(`/perform/${track.fileId}`)
            setJumpNotification(null)
        }
    }

    if (!liveState?.enabled) return null

    return (
        <>
            {/* LIVE Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/20 border border-red-500/30">
                <Radio className="h-3 w-3 text-red-400 animate-pulse" />
                <span className="text-[10px] font-bold text-red-400 tracking-wider">LIVE</span>
            </div>

            {/* Jump Notification Toast */}
            {jumpNotification && (
                <div
                    className={cn(
                        "fixed top-4 left-1/2 -translate-x-1/2 z-[60]",
                        "bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl",
                        "px-4 py-3 flex items-center gap-3 max-w-sm",
                        "animate-in slide-in-from-top-2 fade-in duration-300"
                    )}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-400">
                            {jumpNotification.leaderName} moved to:
                        </p>
                        <p className="text-sm font-semibold text-white truncate">
                            {jumpNotification.trackName}
                        </p>
                    </div>
                    <button
                        onClick={handleJump}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
                    >
                        Jump <ArrowRight className="h-3 w-3" />
                    </button>
                    <button
                        onClick={() => setJumpNotification(null)}
                        className="shrink-0 text-zinc-500 hover:text-zinc-300 text-xs px-1"
                    >
                        ✕
                    </button>
                </div>
            )}
        </>
    )
}
