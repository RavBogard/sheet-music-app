"use client"

import { useMemo } from "react"
import { SetlistTrack } from "@/types/models"
import { SetlistRow } from "./SetlistRow"
import { LiveDirectorGesture } from "./LiveDirectorGesture"

export interface SetlistViewProps {
    tracks: SetlistTrack[]
    currentTrackIndex: number
    defaultTransposition: number
    isPublicView: boolean
    isLeader: boolean
    onSongTap: (index: number) => void
    onLeaderSetPosition: (index: number) => void
    serviceNotes?: string | null
    /**
     * Parent setlist id. Threaded down so the long-press → live-director
     * action sheet (`LiveDirectorGesture`) can attribute insert writes to
     * the right setlist. Required for the gesture to mount; omit on
     * routes that don't yet wire the gesture (e.g. /perform/[fileId]
     * single-chart probe view).
     */
    setlistId?: string
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
    setlistId,
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
                        <p className="text-base text-brand whitespace-pre-wrap">{serviceNotes}</p>
                    </div>
                )}

                {/* Single flat scrollable list */}
                {tracks.map((track, index) => {
                    // Long-press → live-director sheet wires per-row when the
                    // viewer is a band_leader/admin AND we know the setlistId
                    // (insert writes need it). Headers + tracks without an id
                    // (mid-hydration) skip the wrapper — there's no Firestore
                    // doc to mutate yet.
                    const gestureEligible =
                        isLeader && !!setlistId && !!track.id && track.type !== "header"
                    const row = (
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
                    )
                    if (!gestureEligible) return row
                    return (
                        <LiveDirectorGesture
                            key={track.id}
                            enabled
                            track={track}
                            trackIndex={index}
                            setlistTracks={tracks}
                            setlistId={setlistId!}
                        >
                            {({ handlers }) => (
                                <SetlistRow
                                    track={track}
                                    index={index}
                                    isCurrentPosition={index === currentTrackIndex}
                                    defaultTransposition={defaultTransposition}
                                    isPublicView={isPublicView}
                                    isLeader={isLeader}
                                    onSongTap={() => onSongTap(index)}
                                    onLeaderSetPosition={() => onLeaderSetPosition(index)}
                                    gestureHandlers={handlers}
                                />
                            )}
                        </LiveDirectorGesture>
                    )
                })}

                {tracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <p className="text-xl font-medium">No tracks yet</p>
                    </div>
                )}
            </div>
        </div>
    )
}
