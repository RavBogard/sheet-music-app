"use client"

import { useMemo } from "react"
import { SetlistTrack } from "@/types/models"
import { SetlistRow } from "./SetlistRow"

export interface SetlistViewProps {
    tracks: SetlistTrack[]
    currentTrackIndex: number
    defaultTransposition: number
    isPublicView: boolean
    isLeader: boolean
    onSongTap: (index: number) => void
    onLeaderSetPosition: (index: number) => void
    serviceNotes?: string | null
}

export function SetlistView({
    tracks,
    currentTrackIndex,
    defaultTransposition,
    isPublicView,
    isLeader,
    onSongTap,
    onLeaderSetPosition,
    serviceNotes,
}: SetlistViewProps) {
    // Memoize transposed keys computation (pure function, keyed on tracks + transposition)
    const _transpositionKey = useMemo(
        () => `${tracks.map((t) => t.key || "").join(",")}-${defaultTransposition}`,
        [tracks, defaultTransposition]
    )

    return (
        <div className="flex-1 overflow-y-auto w-full">
            <div className="flex flex-col pb-24">
                {/* Service notes banner */}
                {serviceNotes && (
                    <div className="mx-3 mt-2 mb-1 p-3 bg-brand/10 border border-brand/20 rounded-lg">
                        <p className="text-sm text-brand whitespace-pre-wrap">{serviceNotes}</p>
                    </div>
                )}

                {/* Single flat scrollable list */}
                {tracks.map((track, index) => (
                    <SetlistRow
                        key={track.id || `track-${index}`}
                        track={track}
                        index={index}
                        isCurrentPosition={index === currentTrackIndex}
                        defaultTransposition={defaultTransposition}
                        isPublicView={isPublicView}
                        isLeader={isLeader}
                        onSongTap={() => onSongTap(index)}
                        onLeaderSetPosition={() => onLeaderSetPosition(index)}
                    />
                ))}

                {tracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <p className="text-lg font-medium">No tracks yet</p>
                    </div>
                )}
            </div>
        </div>
    )
}
