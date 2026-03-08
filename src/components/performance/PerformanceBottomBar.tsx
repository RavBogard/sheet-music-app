"use client"

import { useMemo } from "react"
import { List, Headphones, ChevronLeft, ChevronRight, X } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { cn } from "@/lib/utils"

export interface PerformanceBottomBarProps {
    track: SetlistTrack
    tracks: SetlistTrack[]
    currentIndex: number
    isPublicView: boolean
    onDrawerToggle: () => void
    onMonitorToggle: () => void
    onNavigate: (index: number) => void
    onClose: () => void
}

export function PerformanceBottomBar({
    track,
    tracks,
    currentIndex,
    isPublicView,
    onDrawerToggle,
    onMonitorToggle,
    onNavigate,
    onClose,
}: PerformanceBottomBarProps) {
    // Compute navigable song indices (skip non-song items and songs without PDFs)
    const songIndices = useMemo(
        () =>
            tracks
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => (!t.type || t.type === "song") && t.fileId)
                .map(({ i }) => i),
        [tracks]
    )

    const currentSongPos = songIndices.indexOf(currentIndex)
    const prevSongIndex = currentSongPos > 0 ? songIndices[currentSongPos - 1] : null
    const nextSongIndex =
        currentSongPos < songIndices.length - 1 ? songIndices[currentSongPos + 1] : null

    return (
        <div className="fixed bottom-0 left-0 right-0 h-14 bg-zinc-950/95 backdrop-blur border-t border-white/10 flex items-center px-3 gap-2 z-[60] pb-safe">
            {/* Setlist drawer button */}
            <button
                onClick={onDrawerToggle}
                className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Open setlist"
            >
                <List className="h-5 w-5 text-zinc-300" />
            </button>

            {/* Monitor button (hidden for public) */}
            {!isPublicView && (
                <button
                    onClick={onMonitorToggle}
                    className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    aria-label="Open monitor mixer"
                >
                    <Headphones className="h-5 w-5 text-zinc-300" />
                </button>
            )}

            {/* Current song name (centered, truncated) */}
            <span className="flex-1 text-sm font-medium truncate text-center text-zinc-200">
                {track.title}
            </span>

            {/* Prev button */}
            <button
                onClick={() => prevSongIndex !== null && onNavigate(prevSongIndex)}
                disabled={prevSongIndex === null}
                className={cn(
                    "h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
                    prevSongIndex !== null
                        ? "hover:bg-white/10 text-zinc-300"
                        : "text-zinc-600 cursor-not-allowed"
                )}
                aria-label="Previous song"
            >
                <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Next button */}
            <button
                onClick={() => nextSongIndex !== null && onNavigate(nextSongIndex)}
                disabled={nextSongIndex === null}
                className={cn(
                    "h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
                    nextSongIndex !== null
                        ? "hover:bg-white/10 text-zinc-300"
                        : "text-zinc-600 cursor-not-allowed"
                )}
                aria-label="Next song"
            >
                <ChevronRight className="h-5 w-5" />
            </button>

            {/* Close button */}
            <button
                onClick={onClose}
                className="h-10 w-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Close PDF"
            >
                <X className="h-5 w-5 text-zinc-300" />
            </button>
        </div>
    )
}
