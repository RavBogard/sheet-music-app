"use client"

import { useCallback } from "react"
import { Radio, ChevronLeft, ChevronRight, Power, Copy, Music, BookOpen, Heart, ArrowLeftRight, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enableLiveMode, startLiveMode, updateLiveTrack, type LiveState, type PresenceEntry } from "@/lib/setlist-live"
import { SetlistTrack } from "@/types/models"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const TRACK_ICONS: Record<string, typeof Music> = {
    song: Music,
    reading: BookOpen,
    prayer: Heart,
    transition: ArrowLeftRight,
    header: ArrowLeftRight,
}

interface LeaderConsoleProps {
    setlistId: string
    setlistName: string
    tracks: SetlistTrack[]
    liveState: LiveState | null
    presence: PresenceEntry[]
    userId: string
    userName: string
}

/**
 * Leader Console — step-through interface for service leaders.
 *
 * Shows Now/Next cards with one-tap advance. Controls live mode
 * broadcasting to all connected devices.
 */
export function LeaderConsole({
    setlistId,
    setlistName,
    tracks,
    liveState,
    presence,
    userId,
    userName,
}: LeaderConsoleProps) {
    const isLive = liveState?.enabled === true
    const currentIndex = liveState?.currentTrackIndex ?? -1

    const currentTrack = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null
    const nextTrack = currentIndex + 1 < tracks.length ? tracks[currentIndex + 1] : null

    const toggleLive = useCallback(async () => {
        try {
            if (!isLive) {
                // Start live mode atomically — single write sets enabled + track 0 (C3 fix)
                await startLiveMode(setlistId, userId, userName)
                toast.success("Live mode started")
            } else {
                await enableLiveMode(setlistId, false)
                toast.success("Live mode ended")
            }
        } catch {
            toast.error("Failed to toggle live mode")
        }
    }, [isLive, setlistId, userId, userName])

    const advance = useCallback(async () => {
        if (currentIndex + 1 >= tracks.length) return
        try {
            await updateLiveTrack(setlistId, currentIndex + 1, userId, userName)
        } catch {
            toast.error("Failed to advance")
        }
    }, [currentIndex, tracks.length, setlistId, userId, userName])

    const goBack = useCallback(async () => {
        if (currentIndex <= 0) return
        try {
            await updateLiveTrack(setlistId, currentIndex - 1, userId, userName)
        } catch {
            toast.error("Failed to go back")
        }
    }, [currentIndex, setlistId, userId, userName])

    const jumpTo = useCallback(async (index: number) => {
        try {
            await updateLiveTrack(setlistId, index, userId, userName)
        } catch {
            toast.error("Failed to jump")
        }
    }, [setlistId, userId, userName])

    const copyLiveLink = useCallback(() => {
        const url = `${window.location.origin}/live/${setlistId}`
        navigator.clipboard.writeText(url).then(() => {
            toast.success("Live link copied!")
        }).catch(() => {
            toast.error("Failed to copy link")
        })
    }, [setlistId])

    return (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex items-center gap-2">
                    <Radio className={cn("w-4 h-4", isLive ? "text-red-500 animate-pulse" : "text-muted-foreground")} />
                    <span className="text-sm font-semibold">Services LIVE</span>
                    {isLive && (
                        <span className="text-[9px] font-bold bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded-full">
                            ON AIR
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {isLive && (
                        <Button size="sm" variant="ghost" onClick={copyLiveLink} className="gap-1 text-xs h-7">
                            <Copy className="w-3 h-3" />
                            Share link
                        </Button>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" />
                        {presence.length}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {!isLive ? (
                    /* Not live — show start button */
                    <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Start live mode to step through the service.
                            <br />
                            Musicians and displays will follow along.
                        </p>
                        <Button onClick={toggleLive} className="gap-2 bg-red-600 hover:bg-red-500 text-white">
                            <Power className="w-4 h-4" />
                            Go Live
                        </Button>
                    </div>
                ) : (
                    /* Live mode active */
                    <>
                        {/* Now / Next cards */}
                        {currentTrack && (
                            <NowNextCard track={currentTrack} label="Now" variant="now" />
                        )}
                        {nextTrack && (
                            <NowNextCard track={nextTrack} label="Next" variant="next" />
                        )}

                        {/* Navigation controls */}
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={goBack}
                                disabled={currentIndex <= 0}
                                className="flex-1 gap-1"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </Button>
                            <span className="text-xs text-muted-foreground font-mono px-2">
                                {currentIndex + 1}/{tracks.length}
                            </span>
                            <Button
                                size="sm"
                                onClick={advance}
                                disabled={currentIndex + 1 >= tracks.length}
                                className="flex-1 gap-1 bg-violet-600 hover:bg-violet-500 text-white"
                            >
                                Next
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Quick jump track list */}
                        <div className="border-t border-border pt-3 max-h-48 overflow-y-auto space-y-0.5">
                            {tracks.map((track, i) => {
                                const Icon = TRACK_ICONS[track.type || 'song'] || Music
                                const isCurrent = i === currentIndex

                                return (
                                    <button
                                        key={i}
                                        onClick={() => jumpTo(i)}
                                        className={cn(
                                            "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors",
                                            isCurrent
                                                ? "bg-violet-500/15 text-violet-400"
                                                : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        <Icon className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{track.title}</span>
                                        {isCurrent && (
                                            <span className="ml-auto text-[9px] font-bold bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full shrink-0">
                                                NOW
                                            </span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* End live */}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={toggleLive}
                            className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            <Power className="w-3.5 h-3.5 mr-1.5" />
                            End Live Mode
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}

function NowNextCard({
    track,
    label,
    variant,
}: {
    track: SetlistTrack
    label: string
    variant: 'now' | 'next'
}) {
    const Icon = TRACK_ICONS[track.type || 'song'] || Music
    const isNow = variant === 'now'

    return (
        <div className={cn(
            "rounded-xl border p-3",
            isNow
                ? "bg-violet-500/10 border-violet-500/20"
                : "bg-muted/30 border-border/50"
        )}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{
                color: isNow ? 'rgb(139, 92, 246)' : 'rgb(113, 113, 122)'
            }}>
                {label}
            </div>
            <div className="flex items-center gap-2">
                <Icon className={cn("w-4 h-4 shrink-0", isNow ? "text-violet-400" : "text-muted-foreground")} />
                <span className={cn(
                    "font-semibold text-sm truncate",
                    isNow ? "text-foreground" : "text-muted-foreground"
                )}>
                    {track.title}
                </span>
                {track.key && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
                        {track.key}
                    </span>
                )}
            </div>
            {track.performer && (
                <p className="text-xs text-muted-foreground mt-1 pl-6">{track.performer}</p>
            )}
        </div>
    )
}
