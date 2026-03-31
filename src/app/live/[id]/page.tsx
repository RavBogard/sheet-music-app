"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { db } from "@/lib/firebase"
import { doc, onSnapshot } from "firebase/firestore"
import { Setlist } from "@/lib/setlist-firebase"
import { LiveState, subscribeToPresence, PresenceEntry } from "@/lib/setlist-live"
import { SetlistTrack } from "@/types/models"
import { Radio, ChevronRight, Users, BookOpen, Heart, ArrowLeftRight, Music } from "lucide-react"
import { cn } from "@/lib/utils"
import { logger } from "@/lib/logger"

/**
 * Public LIVE view — follows the leader's position in real-time.
 *
 * No auth required. Shows Now/Next cards that update as the leader
 * advances through the service. Designed for display on stage monitors,
 * TV screens in the lobby, or the rabbi's iPad.
 */
export default function LivePage() {
    const params = useParams<{ id: string }>()
    const setlistId = params.id

    const [setlist, setSetlist] = useState<Setlist | null>(null)
    const [liveState, setLiveState] = useState<LiveState | null>(null)
    const [presence, setPresence] = useState<PresenceEntry[]>([])
    const [error, setError] = useState(false)

    // Subscribe to setlist document (includes liveState)
    useEffect(() => {
        if (!setlistId) return
        const ref = doc(db, "setlists", setlistId)
        const unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) {
                setError(true)
                return
            }
            const data = snap.data()
            setSetlist({ id: snap.id, ...data } as Setlist)
            setLiveState((data.liveState as LiveState) || null)
        }, (err) => {
            logger.error("[Live] Setlist listener error:", err)
            setError(true)
        })
        return () => unsub()
    }, [setlistId])

    // Subscribe to presence
    useEffect(() => {
        if (!setlistId) return
        const unsub = subscribeToPresence(setlistId, setPresence)
        return () => unsub()
    }, [setlistId])

    if (error) {
        return (
            <div className="dark min-h-screen bg-background flex items-center justify-center">
                <p className="text-muted-foreground text-lg">Setlist not found</p>
            </div>
        )
    }

    if (!setlist) {
        return (
            <div className="dark min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground/60 animate-pulse text-lg">Loading...</div>
            </div>
        )
    }

    const tracks = setlist.tracks || []
    const currentIndex = liveState?.currentTrackIndex ?? -1
    const isLive = liveState?.enabled === true
    const currentTrack = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null
    const nextTrack = currentIndex + 1 < tracks.length ? tracks[currentIndex + 1] : null

    return (
        <div className="dark min-h-screen bg-background text-foreground flex flex-col">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                    <Radio className={cn(
                        "w-5 h-5",
                        isLive ? "text-red-500 animate-pulse" : "text-muted-foreground/60"
                    )} />
                    <h1 className="text-lg font-semibold text-foreground/90 truncate">
                        {setlist.name}
                    </h1>
                    {isLive && (
                        <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Live
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Users className="w-4 h-4" />
                    {presence.length}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
                {!isLive ? (
                    <div className="text-center space-y-4">
                        <Radio className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                        <p className="text-muted-foreground text-xl">Waiting for service to begin...</p>
                        <p className="text-muted-foreground/60 text-sm">{tracks.length} items in this setlist</p>
                    </div>
                ) : currentTrack ? (
                    <div className="w-full max-w-2xl space-y-8">
                        {/* NOW card */}
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                Now
                            </div>
                            <TrackCard track={currentTrack} variant="now" index={currentIndex} total={tracks.length} />
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                            <div className="h-px flex-1 bg-border" />
                        </div>

                        {/* NEXT card */}
                        {nextTrack ? (
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
                                    Next
                                </div>
                                <TrackCard track={nextTrack} variant="next" index={currentIndex + 1} total={tracks.length} />
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground/60 text-sm py-4">
                                Last item in the service
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-lg">Service started — waiting for first item...</p>
                )}
            </div>

            {/* Footer: track position */}
            {isLive && currentIndex >= 0 && (
                <div className="px-6 py-3 border-t border-border flex items-center justify-between text-sm text-muted-foreground/60">
                    <span>{currentIndex + 1} / {tracks.length}</span>
                    {liveState?.updatedByName && (
                        <span>Led by {liveState.updatedByName}</span>
                    )}
                </div>
            )}
        </div>
    )
}

const TRACK_ICONS: Record<string, typeof Music> = {
    song: Music,
    reading: BookOpen,
    prayer: Heart,
    transition: ArrowLeftRight,
    header: ArrowLeftRight,
}

function TrackCard({
    track,
    variant,
}: {
    track: SetlistTrack
    variant: 'now' | 'next'
    index: number
    total: number
}) {
    const Icon = TRACK_ICONS[track.type || 'song'] || Music
    const isNow = variant === 'now'

    return (
        <div className={cn(
            "rounded-2xl border p-6",
            isNow
                ? "bg-muted/80 border-border"
                : "bg-muted/50 border-border/50"
        )}>
            <div className="flex items-start gap-4">
                <div className={cn(
                    "p-3 rounded-xl",
                    isNow ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"
                )}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className={cn(
                        "font-bold truncate",
                        isNow ? "text-2xl text-foreground" : "text-xl text-muted-foreground"
                    )}>
                        {track.title}
                    </h2>
                    {track.performer && (
                        <p className={cn("mt-1", isNow ? "text-muted-foreground" : "text-muted-foreground/60")}>
                            {track.performer}
                        </p>
                    )}
                    {track.key && (
                        <span className={cn(
                            "inline-block mt-2 text-xs font-mono px-2 py-0.5 rounded",
                            isNow
                                ? "bg-brand/10 text-brand"
                                : "bg-muted text-muted-foreground"
                        )}>
                            Key: {track.key}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
