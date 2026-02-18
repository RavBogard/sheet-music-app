"use client"

import { useState, useEffect, useRef } from "react"
import { useLiveState } from "@/hooks/use-setlist-presence"
import { useMusicStore } from "@/lib/store"
import { useRouter } from "next/navigation"
import { Radio, ArrowRight, Check } from "lucide-react"

interface LiveNotificationProps {
    setlistId: string | null
}

// Persist auto-follow preference across sessions
function getAutoFollow(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('live-auto-follow') === 'true'
}
function setAutoFollowStorage(value: boolean) {
    if (typeof window === 'undefined') return
    localStorage.setItem('live-auto-follow', String(value))
    window.dispatchEvent(new CustomEvent('auto-follow-changed'))
}

/**
 * Live sync notification system with optional auto-follow mode.
 *
 * Default (auto-follow OFF): Shows a 6-second tappable notification
 * when the leader advances. Musicians tap to follow at their own pace.
 *
 * Auto-follow ON: Automatically navigates to the leader's song.
 * Shows a brief 1.5-second confirmation instead of the full notification.
 * Musicians can toggle this in the setlist drawer.
 */
export function LiveNotification({ setlistId }: LiveNotificationProps) {
    const router = useRouter()
    const liveState = useLiveState(setlistId)
    const { playbackQueue, queueIndex } = useMusicStore()
    const [autoFollow, setAutoFollowState] = useState(getAutoFollow)

    // Sync auto-follow preference when toggled in the setlist drawer
    useEffect(() => {
        const sync = () => setAutoFollowState(getAutoFollow())
        window.addEventListener('auto-follow-changed', sync)
        return () => window.removeEventListener('auto-follow-changed', sync)
    }, [])

    const [notification, setNotification] = useState<{
        trackName: string
        trackIndex: number
        updatedByName: string
        isAutoFollow: boolean
    } | null>(null)
    const lastIndexRef = useRef<number | null>(null)

    useEffect(() => {
        if (!liveState?.enabled) {
            lastIndexRef.current = null
            return
        }

        const newIndex = liveState.currentTrackIndex
        // Only act if it's a change and not the current song
        if (
            lastIndexRef.current !== null &&
            newIndex !== lastIndexRef.current &&
            newIndex !== queueIndex &&
            playbackQueue[newIndex]
        ) {
            const track = playbackQueue[newIndex]
            const leaderName = liveState.updatedByName || "Leader"

            if (autoFollow) {
                // Auto-navigate with brief confirmation
                router.push(`/perform/${track.fileId}`)
                setNotification({
                    trackName: track.name,
                    trackIndex: newIndex,
                    updatedByName: leaderName,
                    isAutoFollow: true,
                })
                const timer = setTimeout(() => setNotification(null), 1500)
                lastIndexRef.current = newIndex
                return () => clearTimeout(timer)
            } else {
                // Manual mode: show tappable notification for 6 seconds
                setNotification({
                    trackName: track.name,
                    trackIndex: newIndex,
                    updatedByName: leaderName,
                    isAutoFollow: false,
                })
                const timer = setTimeout(() => setNotification(null), 6000)
                lastIndexRef.current = newIndex
                return () => clearTimeout(timer)
            }
        }

        lastIndexRef.current = newIndex
    }, [liveState, playbackQueue, queueIndex, autoFollow, router])

    const handleJump = () => {
        if (notification && playbackQueue[notification.trackIndex]) {
            const track = playbackQueue[notification.trackIndex]
            router.push(`/perform/${track.fileId}`)
        }
        setNotification(null)
    }

    if (!notification) return null

    // Auto-follow: brief green confirmation
    if (notification.isAutoFollow) {
        return (
            <div
                role="status"
                className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] bg-green-600/90 backdrop-blur-sm
                    text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2
                    animate-in slide-in-from-top fade-in duration-300"
            >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span className="text-sm font-medium">→ {notification.trackName}</span>
            </div>
        )
    }

    // Manual mode: tappable notification
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

/**
 * Auto-follow toggle for the setlist drawer.
 * Only renders when live sync is active.
 */
export function AutoFollowToggle({ setlistId }: { setlistId: string | null }) {
    const liveState = useLiveState(setlistId)
    const [autoFollow, setAutoFollow] = useState(getAutoFollow)

    const toggle = () => {
        const newValue = !autoFollow
        setAutoFollow(newValue)
        setAutoFollowStorage(newValue)
    }

    if (!liveState?.enabled) return null

    return (
        <button
            onClick={toggle}
            className="flex items-center justify-between w-full px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
        >
            <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-foreground">Auto-follow leader</span>
            </div>
            <div className={`w-10 h-6 rounded-full relative transition-colors ${autoFollow ? 'bg-green-500' : 'bg-muted'}`}>
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoFollow ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
        </button>
    )
}
