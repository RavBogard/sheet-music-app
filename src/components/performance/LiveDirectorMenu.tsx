"use client"

/**
 * Live-director action sheet — opens on long-press from PDFOverlay or a
 * SetlistRow when the calling user is `band_leader || admin`
 * (`useAuth().isBandLeader || isAdmin`). Three actions, ratified by Daniel
 * 2026-05-23 in DISCUSSION.md ##RATIFIED BUILD SPEC:
 *
 *   1. **Change key** — write `tracks/{id}.key` (label-only propagation;
 *      no SmartTransposer / chord-overlay touch).
 *   2. **Swap chart** — re-bond the row to a different library entry.
 *   3. **Insert new song** — add a fresh row before / after the long-pressed
 *      row, or append at end.
 *
 * Tap-once-commit (DISCUSSION ##ADDENDUM 4): the long-press is the deliberate
 * gesture, so no per-action confirm dialog wraps the write.
 *
 * Layout: bottom-anchored sheet, iPad-portrait-first; touch targets are
 * h-14 minimum (well above the iOS HIG 44px floor) since this is the live
 * director's surface and confidence > density. Matches the KeepAwakeToggle
 * aesthetic — OKLCH indigo primary tint, glass-on-background sheet, lucide
 * iconography (`559c6c84d`, also coder-5 lane).
 */

import { useEffect, useMemo, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileMusic, Music, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SetlistTrack } from "@/types/models"
import {
    ChangeKeyAction,
    SwapChartAction,
    InsertSongAction,
} from "./LiveDirectorActions"

export type LiveDirectorView = "menu" | "change-key" | "swap-chart" | "insert-song"

export interface LiveDirectorMenuProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** The track that was long-pressed (or, on PDFOverlay, the currently-
     *  viewed track). `id` is required for all three actions. */
    track: SetlistTrack
    /** Display index of `track` within the setlist; needed for "before/after"
     *  placement on the insert action. */
    trackIndex: number
    /** Full live setlist track list (display order). Drives placement order
     *  bumping on insert. */
    setlistTracks: SetlistTrack[]
    /** Parent setlist id; required for insert (new tracks/{id}.setlistId). */
    setlistId: string
}

export function LiveDirectorMenu({
    open,
    onOpenChange,
    track,
    trackIndex,
    setlistTracks,
    setlistId,
}: LiveDirectorMenuProps) {
    const [view, setView] = useState<LiveDirectorView>("menu")

    // Reset to the action chooser whenever the sheet closes — the next
    // long-press should always land on the top-level menu, not the
    // previously-open action.
    useEffect(() => {
        if (!open) setView("menu")
    }, [open])

    const close = () => onOpenChange(false)

    const headerTitle = useMemo(() => {
        if (view === "change-key") return "Change key"
        if (view === "swap-chart") return "Swap chart"
        if (view === "insert-song") return "Insert song"
        return track.title || "Live edit"
    }, [view, track.title])

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="h-[80vh] bg-background border-t border-border p-0 flex flex-col sm:max-w-2xl sm:mx-auto sm:rounded-t-2xl sm:shadow-2xl sm:border-x"
            >
                <SheetHeader className="p-4 border-b border-border bg-muted/40 sm:rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        {view !== "menu" && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setView("menu")}
                                aria-label="Back"
                                className="h-11 w-11 p-0 [touch-action:manipulation]"
                            >
                                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                            </Button>
                        )}
                        <SheetTitle className="text-left text-base font-semibold truncate flex-1">
                            {headerTitle}
                        </SheetTitle>
                    </div>
                    {view === "menu" && track.title && (
                        <p className="text-xs text-muted-foreground truncate text-left">
                            {track.title}
                            {track.key ? ` · ${track.key}` : ""}
                        </p>
                    )}
                </SheetHeader>

                <div className="flex-1 min-h-0 overflow-auto">
                    {view === "menu" && (
                        <ActionChooser onPick={setView} />
                    )}
                    {view === "change-key" && (
                        <ChangeKeyAction
                            track={track}
                            onDone={close}
                        />
                    )}
                    {view === "swap-chart" && (
                        <SwapChartAction
                            track={track}
                            onDone={close}
                        />
                    )}
                    {view === "insert-song" && (
                        <InsertSongAction
                            setlistId={setlistId}
                            setlistTracks={setlistTracks}
                            currentIndex={trackIndex}
                            onDone={close}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

interface ActionChooserProps {
    onPick: (view: LiveDirectorView) => void
}

function ActionChooser({ onPick }: ActionChooserProps) {
    return (
        <ul className="p-3 flex flex-col gap-2" aria-label="Live edit actions">
            <ActionTile
                icon={<Music className="h-5 w-5" aria-hidden="true" />}
                title="Change key"
                description="Update the displayed key for this row"
                onClick={() => onPick("change-key")}
            />
            <ActionTile
                icon={<FileMusic className="h-5 w-5" aria-hidden="true" />}
                title="Swap chart"
                description="Bond this row to a different chart"
                onClick={() => onPick("swap-chart")}
            />
            <ActionTile
                icon={<Plus className="h-5 w-5" aria-hidden="true" />}
                title="Insert new song"
                description="Add a song before, after, or at the end"
                onClick={() => onPick("insert-song")}
            />
        </ul>
    )
}

interface ActionTileProps {
    icon: React.ReactNode
    title: string
    description: string
    onClick: () => void
}

function ActionTile({ icon, title, description, onClick }: ActionTileProps) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    "w-full min-h-14 flex items-center gap-3 px-4 py-3 rounded-xl text-left",
                    "bg-muted/40 hover:bg-muted active:bg-muted/80 transition-colors",
                    "border border-border/60",
                    "[touch-action:manipulation]",
                )}
            >
                <span className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {icon}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-foreground">{title}</span>
                    <span className="block text-xs text-muted-foreground truncate">{description}</span>
                </span>
            </button>
        </li>
    )
}
