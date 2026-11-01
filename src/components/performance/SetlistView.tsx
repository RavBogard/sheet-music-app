"use client"

import React, { useMemo, useState } from "react"
import { SetlistTrack } from "@/types/models"
import type { SaveFailureReason } from "@/lib/prefetch"
import { SetlistRow } from "./SetlistRow"
import { LiveDirectorGesture } from "./LiveDirectorGesture"
import { LiturgyRunDivider } from "./LiturgyRunDivider"
import { liturgyRuns, runFolios } from "./liturgy-runs"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { PAGE_WIDTH_CLASS } from "@/components/layout/Page"
import { isSectionRow, sectionBands } from "@/components/setlist/grid/section-bands"
import { isSegue, setTotalsByHeader } from "@/lib/gig/display"
import type { Gig } from "@/lib/gig/model"
import { SegueMark } from "./SegueMark"

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
    /** File ids saved on this device, or null while the device store is unread. */
    savedFileIds?: ReadonlySet<string> | null
    /** PERF-21: why a chart didn't save, per fileId (this session's save passes). */
    saveFailures?: ReadonlyMap<string, SaveFailureReason> | null
    /** BET-5: show set lengths on the section bands (band tenant, or any row has a length). */
    showTiming?: boolean
    /** BET-5: the gig, for each set's target length. */
    gig?: Gig | null
    /** Live reorder: rows just moved, highlighted for a moment. */
    highlightIds?: ReadonlySet<string> | null
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
    savedFileIds,
    saveFailures,
    showTiming = false,
    gig = null,
    highlightIds = null,
}: SetlistViewProps) {
    const t = useT()
    // Memoize transposed keys computation (pure function, keyed on tracks + transposition)
    const _transpositionKey = useMemo(
        () => `${tracks.map((tr) => tr.key || "").join(",")}-${defaultTransposition}`,
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
    // Web refresh: header rows draw as the editor's full-hue bands, with the
    // pages of the rows under each. Display only; the order is the author's.
    const bands = useMemo(() => sectionBands(tracks), [tracks])
    // BET-5: each set's running length on its band (display only).
    const setTotals = useMemo(
        () => (showTiming ? setTotalsByHeader(tracks, gig).byHeaderId : null),
        [showTiming, tracks, gig],
    )
    // Display numbers, as the editor draws them: songs and other rows count
    // 1, 2, 3 in the author's order; section labels get none. Display only.
    const positions = useMemo(() => {
        const out: number[] = []
        let n = 0
        for (const track of tracks) {
            out.push(isSectionRow(track) ? 0 : ++n)
        }
        return out
    }, [tracks])
    // Swap can apply to chart-bearing rows only; when any row can, every row
    // reserves the column so the key and page columns stay in one line.
    const canSwap = (track: SetlistTrack) =>
        !!onSwapTap && isLeader && !!track.id && track.type !== "header" && !!track.fileId
    const swapColumn = useMemo(
        () => !!onSwapTap && isLeader && tracks.some((tr) => !!tr.id && tr.type !== "header" && !!tr.fileId),
        [onSwapTap, isLeader, tracks],
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

    const savedOfflineFor = (track: SetlistTrack): boolean | undefined =>
        savedFileIds && track.fileId ? savedFileIds.has(track.fileId) : undefined
    const saveFailureFor = (track: SetlistTrack): SaveFailureReason | undefined =>
        saveFailures && track.fileId ? saveFailures.get(track.fileId) : undefined

    // BET-5: a song that runs straight into the next one gets a "→" between
    // the two rows.
    const renderRow = (track: SetlistTrack, index: number) => {
        const row = renderRowOnly(track, index)
        if (!isSegue(track) || index >= tracks.length - 1) return row
        return (
            <React.Fragment key={`segue-${track.id || index}`}>
                {row}
                <SegueMark />
            </React.Fragment>
        )
    }

    const renderRowOnly = (track: SetlistTrack, index: number) => {
        // Long-press → live-director sheet wires per-row when the viewer is a
        // band_leader/admin AND we know the setlistId (insert writes need it).
        // Headers + tracks without an id (mid-hydration) skip the wrapper —
        // there's no Firestore doc to mutate yet.
        const gestureEligible =
            isLeader && !!setlistId && !!track.id && track.type !== "header"
        // Swap is for chart-bearing rows only, and only when the page wired it.
        const swapTap = canSwap(track) && onSwapTap ? () => onSwapTap(index) : undefined
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
                    band={track.id ? bands[track.id] : undefined}
                    setTotal={track.id ? setTotals?.[track.id] : undefined}
                    savedOffline={savedOfflineFor(track)}
                    saveFailure={saveFailureFor(track)}
                    highlighted={!!track.id && !!highlightIds?.has(track.id)}
                    position={positions[index] || undefined}
                    swapColumn={swapColumn}
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
                        band={bands[track.id]}
                        setTotal={setTotals?.[track.id]}
                        savedOffline={savedOfflineFor(track)}
                        saveFailure={saveFailureFor(track)}
                        highlighted={!!highlightIds?.has(track.id)}
                        position={positions[index] || undefined}
                        swapColumn={swapColumn}
                    />
                )}
            </LiveDirectorGesture>
        )
    }

    return (
        <div className="flex-1 overflow-y-auto w-full">
            <div className={cn(PAGE_WIDTH_CLASS, "flex flex-col pb-24 pt-3 max-sm:px-0")}>
                {/* Service notes banner */}
                {serviceNotes && (
                    <div className="mx-4 sm:mx-0 mb-3 px-4 py-2.5 bg-card border border-rule rounded-lg">
                        <p className="text-sm text-foreground whitespace-pre-wrap">{serviceNotes}</p>
                    </div>
                )}

                {/* One continuous card (Option B): sections are thin labelled
                    rules inside it, never separate cards. */}
                {tracks.length > 0 && (
                <div data-testid="perform-list" className="flex flex-col bg-card border-y sm:border border-rule sm:rounded-lg overflow-hidden">
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
                </div>
                )}

                {tracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <p className="text-xl font-medium">{t("performSetlist.noTracksYet")}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
