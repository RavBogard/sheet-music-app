"use client"

import { FileMusic, ChevronRight, User } from "lucide-react"
import { SetlistTrack } from "@/types/models"
import { getTransposedKeyName } from "@/lib/music-math"
import { displayChartTitle } from "@/lib/format/chart-title"
import { cn } from "@/lib/utils"
import type { UseLongPressBag } from "@/hooks/use-long-press"

export interface SetlistRowProps {
    track: SetlistTrack
    index: number
    isCurrentPosition: boolean
    defaultTransposition: number
    isPublicView: boolean
    onSongTap: () => void
    isLeader: boolean
    onLeaderSetPosition: () => void
    /**
     * Optional pointer/long-press handler bag from `useLongPress`. When
     * present, the gesture target (the interactive row root) wires its
     * pointer events so a ~500ms hold opens the live-director action sheet
     * (`LiveDirectorGesture` upstream). The hook's `onClick` is composed
     * with the existing tap-to-open click so a fired long-press suppresses
     * the synthetic click. Absent on non-leader iPads and on the
     * `openableNonSong` chevron rows (gesture only applies to song rows).
     */
    gestureHandlers?: UseLongPressBag
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
    gestureHandlers,
}: SetlistRowProps) {
    const isSong = !track.type || track.type === "song"
    const isHeader = track.type === "header"
    // v11.5-05-02 (Q5): some write paths (MCP / legacy upload / .docx import)
    // stored the raw filename — extension and all — as the track title. Strip a
    // stray chart/doc extension at DISPLAY time on the consumer surface. Headers
    // are user-typed section labels (not filenames), so they keep `track.title`.
    const title = displayChartTitle(track.title)

    // Compute display key. Precedence mirrors use-musician-transposition:
    // per-track override (track.transposition) wins over the musician's profile
    // default. Public view always shows the original key.
    const displayKey = (() => {
        if (!isSong || !track.key) return null
        if (isPublicView) return track.key
        const override = track.transposition
        const effective = override !== undefined && override !== 0
            ? override
            : defaultTransposition
        if (effective === 0) return track.key
        const fullName = getTransposedKeyName(track.key, effective)
        const parenIdx = fullName.indexOf(" (")
        return parenIdx > -1 ? fullName.substring(0, parenIdx) : fullName
    })()

    // A bonded chart is openable for ANY non-header track (song, prayer,
    // reading…), not just `song`-typed rows. Previously gated on `isSong`,
    // which left real charts on prayer/reading tracks unopenable in Perform
    // (R1 launch finding — e.g. a bonded Barechu / Adonai Sifatai).
    const hasFile = !isHeader && !!track.fileId
    const isInteractive = hasFile || isLeader
    // A non-song track that nonetheless carries an openable chart — it needs an
    // explicit tap affordance (icon + chevron + label) since it doesn't get the
    // song row's striped/bold treatment.
    const openableNonSong = hasFile && !isSong
    const hasSecondLine = !!(track.leadMusician || track.performer)

    // Outline fields — rendered for every row type. `folio` is stored at
    // authoring time (never resolved at render), so this is a pure read.
    const folio = track.liturgyRef?.folio
    const honors = track.honors?.filter((h) => h?.name?.trim()) ?? []
    const outlinePerformer = !isSong ? track.performer : undefined

    // The field the eye hunts for mid-service. Right-aligned in a fixed column
    // so folios line up down the list; `p.` prefix so the meaning is never
    // carried by position or color alone. Full-strength foreground even on
    // de-emphasised rows — the row title may be muted, the page number never is.
    const folioBadge = folio !== undefined ? (
        <span
            data-testid="folio"
            className="shrink-0 w-16 text-right font-bold text-lg tabular-nums text-foreground"
        >
            p.&nbsp;{folio}
        </span>
    ) : null

    const outlineDetail = (
        <>
            {outlinePerformer && (
                <p className="text-sm text-blue-700 dark:text-blue-400 truncate mt-0.5">
                    {outlinePerformer}
                </p>
            )}
            {honors.length > 0 && (
                <ul className="mt-0.5 space-y-0.5">
                    {honors.map((h, i) => (
                        <li key={`${h.name}-${i}`} className="flex items-center gap-1.5 text-sm">
                            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="text-foreground truncate">{h.name}</span>
                            {h.note && (
                                <span className="text-muted-foreground truncate">— {h.note}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {track.description && (
                // Clamped: the full text lives in the book on the page named to the
                // right. Two lines is enough to identify the moment, not read it.
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {track.description}
                </p>
            )}
        </>
    )

    const headerExtra = (folio !== undefined || honors.length > 0) ? (
        <div className="flex items-center gap-2 px-4 pb-1">
            {honors.length > 0 && (
                <span className="flex items-center gap-1.5 text-sm min-w-0">
                    <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="text-foreground truncate">
                        {honors.map((h) => h.note ? `${h.name} — ${h.note}` : h.name).join(", ")}
                    </span>
                </span>
            )}
            <span className="flex-1" />
            {folioBadge}
        </div>
    ) : null

    const handleClick = () => {
        if (isLeader) {
            onLeaderSetPosition()
        }

        if (hasFile) {
            onSongTap()
        }
    }

    // Header items render as inline dividers. For leaders, wrap in a real
    // <button> so the whole row is a ≥44px tap target with native keyboard
    // activation. Musicians see a plain, non-interactive label.
    if (isHeader) {
        const headerInner = (
            <>
                <div className="h-px flex-1 bg-brand/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    {track.title}
                </span>
                <div className="h-px flex-1 bg-brand/10" />
            </>
        )
        if (isLeader) {
            return (
                <>
                    <button
                        type="button"
                        onClick={handleClick}
                        className="flex items-center gap-3 px-4 min-h-11 w-full text-left my-1 cursor-pointer"
                    >
                        {headerInner}
                    </button>
                    {headerExtra}
                </>
            )
        }
        return (
            <>
                <div className="flex items-center gap-3 px-4 py-1.5 my-1">
                    {headerInner}
                </div>
                {headerExtra}
            </>
        )
    }

    // Song content — key and notes directly after title, BPM pushed right
    const songContent = isSong ? (
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lg text-foreground truncate shrink min-w-0">
                    {title}
                </span>
                {displayKey && (
                    // C5B-015: switched from `bg-brand/15 text-brand` (sub-AA in
                    // both light + dark per axe-core) to solid `bg-brand` with
                    // `text-brand-foreground` inverse. Light: bg L 0.50 vs fg
                    // L 0.985 → ~6.5:1 AA. Dark: bg L 0.55 vs fg L 0.97 → ~5.5:1 AA.
                    <span
                        data-testid="key-badge"
                        className="font-mono text-sm font-bold px-2 py-0.5 bg-brand text-brand-foreground rounded-lg shrink-0 text-center"
                    >
                        {displayKey}
                    </span>
                )}
                {track.notes && (
                    // text-amber-800 in light mode (text-amber-300 fails WCAG AA
                    // contrast on the light-theme row backgrounds — axe color-
                    // contrast, ~1.1:1); dark mode keeps the vivid amber-300.
                    <span className="text-xs text-amber-800 dark:text-amber-300 truncate max-w-[200px] md:max-w-[300px] shrink">
                        {track.notes}
                    </span>
                )}
                <span className="flex-1" />
                {track.bpm && (
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {track.bpm} BPM
                    </span>
                )}
            </div>
            {hasSecondLine && (
                // text-blue-700 in light mode (text-blue-400 fails WCAG AA
                // contrast on the light-theme row backgrounds — axe color-
                // contrast, 2.18:1); dark mode keeps the lighter blue-400.
                <p className="text-sm text-blue-700 dark:text-blue-400 truncate mt-0.5">
                    {track.leadMusician || track.performer}
                </p>
            )}
        </div>
    ) : openableNonSong ? (
        // Prayer/reading WITH a bonded chart: must read as tappable, not as a
        // passive dimmed label. Leading chart glyph + foreground title + trailing
        // chevron — affordance is shape-based (color-not-alone).
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
                <FileMusic className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="text-base text-foreground truncate min-w-0">{title}</span>
                <span className="flex-1" />
                {folioBadge}
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            {outlineDetail}
        </div>
    ) : (
        // Passive outline row. Title stays muted to preserve the song/non-song
        // distinction, but rises to 16px — 14px is below the readable floor for a
        // tablet read at arm's length while standing. De-emphasis is COLOR ONLY;
        // never re-introduce opacity here (see the rowClasses comment).
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <span className="text-base text-muted-foreground truncate min-w-0">{title}</span>
                <span className="flex-1" />
                {folioBadge}
            </div>
            {outlineDetail}
        </div>
    )

    const rowClasses = cn(
        "flex items-center px-4 py-3 transition-colors",
        isCurrentPosition && "bg-brand/20 border-l-4 border-brand",
        !isCurrentPosition && isSong && (index % 2 === 0 ? "bg-amber-500/[0.10]" : "bg-brand/[0.12]")
        // Passive non-song labels are de-emphasized via the muted *title color*
        // (songContent's text-muted-foreground span), NOT row opacity. opacity-60
        // composited the muted text below WCAG AA on the light theme (axe color-
        // contrast, 3.59:1). An openable prayer/reading still reads full-prominence.
    )

    // Non-interactive rows
    if (!isInteractive) {
        return (
            <div className={cn(rowClasses, "cursor-default")}>
                {songContent}
            </div>
        )
    }

    // Interactive rows
    // Compose the gesture handlers' onClick with the row's own click. The
    // long-press hook calls e.preventDefault()+stopPropagation() when a
    // long-press fired, and we then bail on the row's click handler.
    const composedClick = (e: React.MouseEvent) => {
        if (gestureHandlers) {
            gestureHandlers.onClick(e)
            if (e.defaultPrevented) return
        }
        handleClick()
    }

    return (
        <div
            role="button"
            tabIndex={0}
            aria-label={openableNonSong ? `Open chart: ${title}` : undefined}
            onClick={composedClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    handleClick()
                }
            }}
            {...(gestureHandlers
                ? {
                    onPointerDown: gestureHandlers.onPointerDown,
                    onPointerUp: gestureHandlers.onPointerUp,
                    onPointerMove: gestureHandlers.onPointerMove,
                    onPointerCancel: gestureHandlers.onPointerCancel,
                    onContextMenu: gestureHandlers.onContextMenu,
                    style: gestureHandlers.style,
                }
                : {})}
            className={cn(
                rowClasses,
                "min-h-11",
                hasFile
                    ? "cursor-pointer hover:bg-muted/50 active:bg-muted/70"
                    : "cursor-default"
            )}
        >
            {songContent}
        </div>
    )
}
