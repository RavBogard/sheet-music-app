"use client"

import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface LiturgyRunDividerProps {
    /** Titles of the folded rows, in order. */
    labels: string[]
    /** Printed pages the run spans, ascending; may be empty. */
    folios: number[]
    expanded: boolean
    onToggle: () => void
    /** id of the region this controls, for `aria-controls`. */
    controls: string
}

/**
 * A folded run of fixed-liturgy rows, as one thin labelled divider.
 *
 * WHAT IS BEHIND IT. Rows the band never plays from: `fixed: true` and no
 * bonded chart. They belong on the rabbi's sheet and in the book; on a music
 * stand they are 45 lines of scrolling between one chart and the next.
 *
 * WHY A RUN AND NOT A ROW. Folding each row into its own divider would leave
 * 45 dividers, which is the same problem in a smaller typeface. Consecutive
 * fixed rows are one stretch of the service, so they fold into one bar. A run
 * of a single row is still a run — it simply reads as that row's own name.
 *
 * NOTHING IS HIDDEN SILENTLY. The bar says how many rows and which pages, so
 * the page number — the thing the eye actually hunts for mid-service — is
 * still on screen folded. Tapping opens it; the chevron and the count carry
 * the state, never colour alone.
 */
export function LiturgyRunDivider({
    labels,
    folios,
    expanded,
    onToggle,
    controls,
}: LiturgyRunDividerProps) {
    const count = labels.length
    const pages =
        folios.length === 0
            ? null
            : folios.length === 1 || folios[0] === folios[folios.length - 1]
              ? `p. ${folios[0]}`
              : `pp. ${folios[0]}–${folios[folios.length - 1]}`

    // One row folds to its own name; several fold to a count. Either way the
    // label says what is behind the bar rather than "3 items".
    const label = count === 1 ? labels[0] : `${count} liturgy rows`

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={controls}
            className={cn(
                "flex w-full items-center gap-3 px-4 min-h-11 text-left cursor-pointer",
                "border-y border-border/40 bg-muted/30",
                "hover:bg-muted/60 active:bg-muted/80 transition-colors duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset",
            )}
        >
            <ChevronDown
                aria-hidden="true"
                className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground",
                    // Transform only, and only when the reader wants motion.
                    "transition-transform duration-200 motion-reduce:transition-none",
                    expanded ? "rotate-0" : "-rotate-90",
                )}
            />
            <span className="text-sm text-muted-foreground truncate min-w-0">
                {expanded ? `Hide ${label.toLowerCase()}` : label}
            </span>
            <span className="h-px flex-1 bg-border/60" />
            {pages && (
                // Same fixed right-hand column the rows use, so a folded run's
                // pages land under the folios above and below it.
                <span className="shrink-0 w-16 text-right text-sm tabular-nums text-muted-foreground">
                    {pages}
                </span>
            )}
        </button>
    )
}
