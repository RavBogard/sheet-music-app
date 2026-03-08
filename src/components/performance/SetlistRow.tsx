"use client"

import { useState } from "react"
import { SetlistTrack } from "@/types/models"
import { getTransposedKeyName } from "@/lib/music-math"
import { cn } from "@/lib/utils"

export interface SetlistRowProps {
    track: SetlistTrack
    index: number
    isCurrentPosition: boolean
    defaultTransposition: number
    isPublicView: boolean
    onSongTap: () => void
    isLeader: boolean
    onLeaderSetPosition: () => void
}

export function SetlistRow({
    track,
    index,
    isCurrentPosition,
    defaultTransposition,
    isPublicView,
    onSongTap,
    isLeader,
    onLeaderSetPosition,
}: SetlistRowProps) {
    const [showNotes, setShowNotes] = useState(false)

    const isSong = !track.type || track.type === "song"
    const isHeader = track.type === "header"

    // Compute transposed key: only for non-public views with non-zero transposition
    const displayKey = (() => {
        if (!isSong || !track.key) return null
        if (!isPublicView && defaultTransposition !== 0) {
            // getTransposedKeyName returns "Bb (+2)" format; extract just the key name
            const fullName = getTransposedKeyName(track.key, defaultTransposition)
            // Strip the semitone offset for dense display -- show just "Bb"
            const parenIdx = fullName.indexOf(" (")
            return parenIdx > -1 ? fullName.substring(0, parenIdx) : fullName
        }
        return track.key
    })()

    const hasFile = isSong && !!track.fileId
    const isClickable = hasFile

    const handleClick = () => {
        // Leader tap: set position on any row
        if (isLeader) {
            onLeaderSetPosition()
        }

        // Song tap: toggle notes or open PDF
        if (isSong) {
            if (hasFile) {
                onSongTap()
            } else {
                // Toggle notes for songs without files
                if (track.notes) setShowNotes((prev) => !prev)
            }
        } else {
            // Non-song: toggle notes if available
            if (track.notes) setShowNotes((prev) => !prev)
        }
    }

    // Header items render as inline dividers
    if (isHeader) {
        return (
            <div
                className="flex items-center gap-3 px-4 py-1.5 my-1"
                role={isLeader ? "button" : undefined}
                onClick={isLeader ? handleClick : undefined}
            >
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    {track.title}
                </span>
                <div className="h-px flex-1 bg-border/50" />
            </div>
        )
    }

    return (
        <div>
            <div
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        handleClick()
                    }
                }}
                className={cn(
                    "flex items-center gap-3 px-4 py-2 transition-colors",
                    isCurrentPosition && "bg-violet-500/15 border-l-2 border-violet-500",
                    isClickable ? "cursor-pointer hover:bg-muted/50" : "cursor-default",
                    !isSong && "opacity-70"
                )}
            >
                {isSong ? (
                    <>
                        <span className="font-semibold text-base truncate flex-1 min-w-0">
                            {track.title}
                        </span>
                        {displayKey && (
                            <span className="font-mono text-xs px-1.5 py-0.5 bg-muted rounded shrink-0">
                                {displayKey}
                            </span>
                        )}
                        {track.bpm && (
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                {track.bpm}
                            </span>
                        )}
                        {(track.leadMusician || track.performer) && (
                            <span className="text-xs text-blue-400 truncate max-w-[60px] shrink-0">
                                {track.leadMusician || track.performer}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="text-sm text-muted-foreground">{track.title}</span>
                )}
            </div>
            {/* Notes revealed on tap */}
            {showNotes && track.notes && (
                <div className="px-4 pb-2 pt-0.5">
                    <p className="text-xs text-muted-foreground/80 pl-0.5">{track.notes}</p>
                </div>
            )}
        </div>
    )
}
