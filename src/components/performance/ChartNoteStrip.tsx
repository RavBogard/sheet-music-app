"use client"

import { useState } from "react"
import { StickyNote } from "lucide-react"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * PERF-11 — the row's note and its Vocal Lead, kept visible once the chart is
 * open (they used to show only in the setlist list). One slim line across the
 * top of the chart; a tap shows the whole note, another folds it back.
 *
 * PDFOverlay keys it on the track, so it starts collapsed on every chart.
 * - A row that has a note or Vocal Lead when the chart opens gets the in-flow
 *   strip, and its height stays reserved for that chart even if the note is
 *   removed mid-read.
 * - A note that appears mid-read (a leader edit) never shifts the chart: it
 *   shows as a small pill over the chart's top corner. Opening it is the
 *   musician's action, and it opens as an overlay.
 * Renders nothing when the row has neither and had neither at mount.
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
    const hasContent = !!(note || lead)
    // Decided once, when the chart opens (the component is keyed on the track).
    const [inFlow] = useState(hasContent)

    if (!hasContent) {
        return inFlow ? (
            <div
                data-testid="chart-note-strip-reserved"
                aria-hidden="true"
                className="shrink-0 w-full min-h-11 bg-muted border-b border-border"
            />
        ) : null
    }

    const leadText = lead ? t("perform.noteStrip.vocalLead", { name: lead }) : null
    const body = (
        <>
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
                {note && <bdi data-testid="chart-note-strip-note">{note}</bdi>}
            </span>
        </>
    )
    const stripClass = cn(
        "w-full min-h-11 flex items-start gap-2 px-4 py-2 text-start cursor-pointer",
        "bg-muted text-foreground border-b border-border",
        "transition-colors duration-150 hover:bg-muted/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    )

    if (inFlow) {
        return (
            <button
                type="button"
                data-testid="chart-note-strip"
                aria-expanded={expanded}
                aria-label={expanded ? t("perform.noteStrip.collapse") : t("perform.noteStrip.expand")}
                onClick={() => setExpanded((v) => !v)}
                className={cn("shrink-0", stripClass)}
            >
                {body}
            </button>
        )
    }

    // Arrived mid-read: a zero-height anchor, so nothing below it moves.
    return (
        <div className="relative h-0 shrink-0 z-20">
            {expanded ? (
                <button
                    type="button"
                    data-testid="chart-note-strip"
                    aria-expanded
                    aria-label={t("perform.noteStrip.collapse")}
                    onClick={() => setExpanded(false)}
                    className={cn("absolute inset-x-0 top-0 shadow-lg", stripClass)}
                >
                    {body}
                </button>
            ) : (
                <button
                    type="button"
                    data-testid="chart-note-pill"
                    aria-expanded={false}
                    aria-label={t("perform.noteStrip.expand")}
                    title={t("perform.noteStrip.expand")}
                    onClick={() => setExpanded(true)}
                    className={cn(
                        "absolute top-2 end-3 h-11 min-w-11 px-3 inline-flex items-center justify-center rounded-full cursor-pointer",
                        "bg-primary text-primary-foreground shadow-lg",
                        "transition-colors duration-150 hover:bg-primary/90",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                >
                    <StickyNote className="h-5 w-5" aria-hidden="true" />
                </button>
            )}
        </div>
    )
}
