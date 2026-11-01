"use client"

import { ArrowDown } from "lucide-react"

import { useT } from "@/i18n/client"

/**
 * BET-5: the "→" between two songs on the Perform setlist: the song above runs
 * straight into the one below. Sits on the row hairline, in the brand colour,
 * and states itself for a screen reader. Not interactive.
 */
export function SegueMark() {
    const t = useT()
    return (
        <div
            data-testid="perform-segue"
            role="img"
            aria-label={t("gig.segueMark")}
            className="relative z-10 -my-2.5 flex h-5 items-center ps-14 text-brand"
        >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-rule bg-card">
                <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
        </div>
    )
}
