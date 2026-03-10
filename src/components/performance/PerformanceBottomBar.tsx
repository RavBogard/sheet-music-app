"use client"

import { useMemo } from "react"
import { List, Headphones, ChevronLeft, ChevronRight, X } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { Button } from "@/components/ui/button"
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
        <div className="fixed bottom-0 left-0 right-0 h-14 bg-zinc-950/95 backdrop-blur border-t border-white/10 flex items-center px-3 gap-2 z-toolbar-fixed pb-safe">
            {/* Setlist drawer button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={onDrawerToggle}
                className="h-10 w-10 rounded-lg hover:bg-white/10"
                aria-label="Open setlist"
            >
                <List className="h-5 w-5 text-zinc-300" />
            </Button>

            {/* Monitor button (hidden for public) */}
            {!isPublicView && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onMonitorToggle}
                    className="h-10 w-10 rounded-lg hover:bg-white/10"
                    aria-label="Open monitor mixer"
                >
                    <Headphones className="h-5 w-5 text-zinc-300" />
                </Button>
            )}

            {/* Current song name (centered, truncated) */}
            <span className="flex-1 text-sm font-medium truncate text-center text-zinc-200">
                {track.title}
            </span>

            {/* Prev button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => prevSongIndex !== null && onNavigate(prevSongIndex)}
                disabled={prevSongIndex === null}
                className={cn(
                    "h-10 w-10 rounded-lg",
                    prevSongIndex !== null
                        ? "hover:bg-white/10 text-zinc-300"
                        : "text-zinc-600 cursor-not-allowed"
                )}
                aria-label="Previous song"
            >
                <ChevronLeft className="h-5 w-5" />
            </Button>

            {/* Next button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => nextSongIndex !== null && onNavigate(nextSongIndex)}
                disabled={nextSongIndex === null}
                className={cn(
                    "h-10 w-10 rounded-lg",
                    nextSongIndex !== null
                        ? "hover:bg-white/10 text-zinc-300"
                        : "text-zinc-600 cursor-not-allowed"
                )}
                aria-label="Next song"
            >
                <ChevronRight className="h-5 w-5" />
            </Button>

            {/* Close button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-10 w-10 rounded-lg hover:bg-white/10"
                aria-label="Close PDF"
            >
                <X className="h-5 w-5 text-zinc-300" />
            </Button>
        </div>
    )
}
