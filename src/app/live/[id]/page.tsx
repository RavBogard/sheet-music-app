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
        }, () => setError(true))
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
            <div className="min-h-screen bg-black flex items-center justify-center">
                <p className="text-zinc-500 text-lg">Setlist not found</p>
            </div>
        )
    }

    if (!setlist) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-zinc-600 animate-pulse text-lg">Loading...</div>
            </div>
        )
    }

    const tracks = setlist.tracks || []
    const currentIndex = liveState?.currentTrackIndex ?? -1
    const isLive = liveState?.enabled === true
    const currentTrack = currentIndex >= 0 && currentIndex < tracks.length ? tracks[currentIndex] : null
    const nextTrack = currentIndex + 1 < tracks.length ? tracks[currentIndex + 1] : null

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <Radio className={cn(
                        "w-5 h-5",
                        isLive ? "text-red-500 animate-pulse" : "text-zinc-600"
                    )} />
                    <h1 className="text-lg font-semibold text-zinc-200 truncate">
                        {setlist.name}
                    </h1>
                    {isLive && (
                        <span className="text-[10px] font-bold bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Live
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                    <Users className="w-4 h-4" />
                    {presence.length}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
                {!isLive ? (
                    <div className="text-center space-y-4">
                        <Radio className="w-12 h-12 text-zinc-700 mx-auto" />
                        <p className="text-zinc-500 text-xl">Waiting for service to begin...</p>
                        <p className="text-zinc-600 text-sm">{tracks.length} items in this setlist</p>
                    </div>
                ) : currentTrack ? (
                    <div className="w-full max-w-2xl space-y-8">
                        {/* NOW card */}
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                                Now
                            </div>
                            <TrackCard track={currentTrack} variant="now" index={currentIndex} total={tracks.length} />
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-zinc-800" />
                            <ChevronRight className="w-4 h-4 text-zinc-700" />
                            <div className="h-px flex-1 bg-zinc-800" />
                        </div>

                        {/* NEXT card */}
                        {nextTrack ? (
                            <div className="space-y-2">
                                <div className="text-xs font-bold text-zinc-600 uppercase tracking-widest">
                                    Next
                                </div>
                                <TrackCard track={nextTrack} variant="next" index={currentIndex + 1} total={tracks.length} />
                            </div>
                        ) : (
                            <div className="text-center text-zinc-600 text-sm py-4">
                                Last item in the service
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-zinc-500 text-lg">Service started — waiting for first item...</p>
                )}
            </div>

            {/* Footer: track position */}
            {isLive && currentIndex >= 0 && (
                <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between text-sm text-zinc-600">
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
                ? "bg-zinc-900 border-zinc-700"
                : "bg-zinc-900/50 border-zinc-800/50"
        )}>
            <div className="flex items-start gap-4">
                <div className={cn(
                    "p-3 rounded-xl",
                    isNow ? "bg-violet-500/15 text-violet-400" : "bg-zinc-800 text-zinc-500"
                )}>
                    <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className={cn(
                        "font-bold truncate",
                        isNow ? "text-2xl text-white" : "text-xl text-zinc-400"
                    )}>
                        {track.title}
                    </h2>
                    {track.performer && (
                        <p className={cn("mt-1", isNow ? "text-zinc-400" : "text-zinc-600")}>
                            {track.performer}
                        </p>
                    )}
                    {track.key && (
                        <span className={cn(
                            "inline-block mt-2 text-xs font-mono px-2 py-0.5 rounded",
                            isNow
                                ? "bg-violet-500/10 text-violet-400"
                                : "bg-zinc-800 text-zinc-500"
                        )}>
                            Key: {track.key}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}
