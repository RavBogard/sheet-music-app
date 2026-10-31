"use client"

import { useState } from "react"
import { StickyNote } from "lucide-react"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * PERF-11 — the row's note and its Vocal Lead, kept visible once the chart is
 * open (they used to show only in the setlist list). One slim line across the
 * top of the chart; a tap shows the whole note, another folds it back.
 * Renders nothing when the row has neither.
 *
 * It sits above the chart's scroll container, not inside it, so it never
 * scrolls away and never takes an edge-tap page turn.
 */
export interface ChartNoteStripProps {
    notes?: string
    vocalLead?: string
}

export function ChartNoteStrip({ notes, vocalLead }: ChartNoteStripProps) {
    const t = useT()
    const [expanded, setExpanded] = useState(false)
    const note = notes?.trim()
    const lead = vocalLead?.trim()
    if (!note && !lead) return null

    const leadText = lead ? t("perform.noteStrip.vocalLead", { name: lead }) : null

    return (
        <button
            type="button"
            data-testid="chart-note-strip"
            aria-expanded={expanded}
            aria-label={expanded ? t("perform.noteStrip.collapse") : t("perform.noteStrip.expand")}
            onClick={() => setExpanded((v) => !v)}
            className={cn(
                "shrink-0 w-full min-h-11 flex items-start gap-2 px-4 py-2 text-start cursor-pointer",
                "bg-muted text-foreground border-b border-border",
                "transition-colors duration-150 hover:bg-muted/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            )}
        >
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span
                data-testid="chart-note-strip-text"
                className={cn(
                    "flex-1 min-w-0 text-[15px] leading-snug",
                    expanded ? "whitespace-pre-wrap break-words" : "truncate",
                )}
            >
                {leadText && (
                    <span data-testid="chart-note-strip-lead" className="font-semibold">
                        {leadText}
                    </span>
                )}
                {leadText && note && <span aria-hidden="true" className="text-muted-foreground"> · </span>}
                {note && (
                    <bdi data-testid="chart-note-strip-note">
                        {note}
                    </bdi>
                )}
            </span>
        </button>
    )
}
