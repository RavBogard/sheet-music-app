"use client"

import React, { useMemo, useState } from "react"
import { SetlistTrack } from "@/types/models"
import { SetlistRow } from "./SetlistRow"
import { LiveDirectorGesture } from "./LiveDirectorGesture"
import { LiturgyRunDivider } from "./LiturgyRunDivider"
import { liturgyRuns, runFolios } from "./liturgy-runs"

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
    /**
     * Fold the fixed-liturgy rows the band never plays from into one divider
     * per stretch. Per-device (`useLiturgyCollapse`), default on. Never
     * changes what is in the setlist — only what this screen draws.
     */
    collapseLiturgy?: boolean
    /** David's ask 4: open the Swap-for-tonight sheet for a row. Leader-only. */
    onSwapTap?: (index: number) => void
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
    collapseLiturgy = false,
    onSwapTap,
}: SetlistViewProps) {
    // Memoize transposed keys computation (pure function, keyed on tracks + transposition)
    const _transpositionKey = useMemo(
        () => `${tracks.map((t) => t.key || "").join(",")}-${defaultTransposition}`,
        [tracks, defaultTransposition]
    )

    // Which stretches of fixed liturgy are folded, and which the reader has
    // opened. Expansion is per run and deliberately NOT persisted: opening one
    // stretch to check a page is a thing you do once, and a tablet that
    // remembered every such tap would drift back to the unfolded list nobody
    // asked for.
    const runs = useMemo(
        () => (collapseLiturgy ? liturgyRuns(tracks) : []),
        [collapseLiturgy, tracks],
    )
    const [openRuns, setOpenRuns] = useState<Set<number>>(() => new Set())
    const runByStart = useMemo(() => new Map(runs.map((r) => [r.start, r])), [runs])
    const toggleRun = (start: number) =>
        setOpenRuns((prev) => {
            const next = new Set(prev)
            if (next.has(start)) next.delete(start)
            else next.add(start)
            return next
        })

    const renderRow = (track: SetlistTrack, index: number) => {
        // Long-press → live-director sheet wires per-row when the viewer is a
        // band_leader/admin AND we know the setlistId (insert writes need it).
        // Headers + tracks without an id (mid-hydration) skip the wrapper —
        // there's no Firestore doc to mutate yet.
        const gestureEligible =
            isLeader && !!setlistId && !!track.id && track.type !== "header"
        // Swap is for chart-bearing rows only, and only when the page wired it.
        const swapTap =
            onSwapTap && isLeader && !!track.id && track.type !== "header" && !!track.fileId
                ? () => onSwapTap(index)
                : undefined
        if (!gestureEligible) {
            return (
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
                    onSwapTap={swapTap}
                />
            )
        }
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
                        onSwapTap={swapTap}
                    />
                )}
            </LiveDirectorGesture>
        )
    }

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
                {(() => {
                    const out: React.ReactNode[] = []
                    for (let index = 0; index < tracks.length; index++) {
                        const run = runByStart.get(index)
                        if (run) {
                            const expanded = openRuns.has(run.start)
                            out.push(
                                <LiturgyRunDivider
                                    key={`liturgy-divider-${run.start}`}
                                    labels={run.indexes.map((i) => tracks[i].title ?? "")}
                                    folios={runFolios(tracks, run)}
                                    expanded={expanded}
                                    onToggle={() => toggleRun(run.start)}
                                    controls={`liturgy-run-${run.start}`}
                                />,
                            )
                            if (!expanded) {
                                index = run.indexes[run.indexes.length - 1]
                                continue
                            }
                            // Opened: the run's rows sit inside the region the
                            // divider names, so `aria-expanded`/`aria-controls`
                            // point at something real for a screen reader.
                            out.push(
                                <div
                                    key={`liturgy-run-${run.start}`}
                                    id={`liturgy-run-${run.start}`}
                                    className="flex flex-col"
                                >
                                    {run.indexes.map((i) => renderRow(tracks[i], i))}
                                </div>,
                            )
                            index = run.indexes[run.indexes.length - 1]
                            continue
                        }
                        out.push(renderRow(tracks[index], index))
                    }
                    return out
                })()}

                {tracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <p className="text-xl font-medium">No tracks yet</p>
                    </div>
                )}
            </div>
        </div>
    )
}
