"use client"

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
    const isSong = !track.type || track.type === "song"
    const isHeader = track.type === "header"

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
                <button
                    type="button"
                    onClick={handleClick}
                    className="flex items-center gap-3 px-4 min-h-11 w-full text-left my-1 cursor-pointer"
                >
                    {headerInner}
                </button>
            )
        }
        return (
            <div className="flex items-center gap-3 px-4 py-1.5 my-1">
                {headerInner}
            </div>
        )
    }

    // Song content — key and notes directly after title, BPM pushed right
    const songContent = isSong ? (
        <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
                <span className="font-semibold text-lg text-foreground truncate shrink min-w-0">
                    {track.title}
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
                    <span className="text-xs text-amber-300 truncate max-w-[200px] md:max-w-[300px] shrink">
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
        !isCurrentPosition && isSong && (index % 2 === 0 ? "bg-amber-500/[0.10]" : "bg-brand/[0.12]"),
        !isSong && "opacity-60"
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
    return (
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
    )
}
