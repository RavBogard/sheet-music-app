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

    // Compute display key: show original key always, transposed key when applicable
    const displayKey = (() => {
        if (!isSong || !track.key) return null
        if (!isPublicView && defaultTransposition !== 0) {
            const fullName = getTransposedKeyName(track.key, defaultTransposition)
            const parenIdx = fullName.indexOf(" (")
            return parenIdx > -1 ? fullName.substring(0, parenIdx) : fullName
        }
        return track.key
    })()

    const hasFile = isSong && !!track.fileId
    const isInteractive = hasFile || isLeader
    const hasSecondLine = !!(track.leadMusician || track.performer)

    const handleClick = () => {
        if (isLeader) {
            onLeaderSetPosition()
        }

        if (isSong && hasFile) {
            onSongTap()
        }

        if (track.notes) {
            setShowNotes(prev => !prev)
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
                <div className="h-px flex-1 bg-brand/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    {track.title}
                </span>
                <div className="h-px flex-1 bg-brand/10" />
            </div>
        )
    }

    // Song content — shared between interactive and non-interactive rows
    const songContent = isSong ? (
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lg text-foreground truncate flex-1 min-w-0">
                    {track.title}
                </span>
                {displayKey && (
                    <span
                        data-testid="key-badge"
                        className="font-mono text-sm font-bold px-2 py-0.5 bg-brand/15 text-brand rounded-lg shrink-0 text-center"
                    >
                        {displayKey}
                    </span>
                )}
                {track.bpm && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {track.bpm} BPM
                    </span>
                )}
            </div>
            {hasSecondLine && (
                <p className="text-sm text-blue-400 truncate mt-0.5">
                    {track.leadMusician || track.performer}
                </p>
            )}
        </div>
    ) : (
        <span className="text-sm text-muted-foreground">{track.title}</span>
    )

    const rowClasses = cn(
        "flex items-center px-4 py-3 transition-colors",
        isCurrentPosition && "bg-brand/20 border-l-4 border-brand",
        !isSong && "opacity-60"
    )

    const notesBlock = showNotes && track.notes && (
        <div className="px-4 pb-2 pt-0.5">
            <p className="text-xs text-muted-foreground/80">{track.notes}</p>
        </div>
    )

    // Non-interactive rows
    if (!isInteractive) {
        return (
            <div onClick={track.notes ? () => setShowNotes(prev => !prev) : undefined}>
                <div className={cn(rowClasses, "cursor-default")}>
                    {songContent}
                </div>
                {notesBlock}
            </div>
        )
    }

    // Interactive rows
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
                    rowClasses,
                    hasFile
                        ? "cursor-pointer hover:bg-muted/50 active:bg-muted/70"
                        : "cursor-default"
                )}
            >
                {songContent}
            </div>
            {notesBlock}
        </div>
    )
}
