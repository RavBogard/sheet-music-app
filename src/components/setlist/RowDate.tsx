"use client"

import { useFormat } from "@/i18n/format-client"
import { cn } from "@/lib/utils"

/**
 * The list date column (web refresh, blend E): the month over a large
 * tabular day number. Shared by /setlists and the /perform listing.
 */
export function RowDate({ date, muted }: { date: Date | null; muted?: boolean }) {
    const fmt = useFormat()
    return (
        <div aria-hidden className="tnum w-12 shrink-0 flex flex-col items-center justify-center leading-none relative z-10 pointer-events-none">
            <span className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", muted ? "text-muted-foreground" : "text-brand")}>
                {date ? fmt.date(date, { month: "short" }) : ""}
            </span>
            <span className={cn("mt-1 text-[1.6rem] font-extrabold tracking-[-0.02em]", muted ? "text-muted-foreground" : "text-foreground")}>
                {date ? date.getDate() : "--"}
            </span>
        </div>
    )
}
