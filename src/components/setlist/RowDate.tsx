"use client"

import { useFormat } from "@/i18n/format-client"
import { cn } from "@/lib/utils"

/**
 * The list date column (Option B): the month over the day number, both at
 * row scale, no large numerals. Shared by /setlists and the /perform listing.
 */
export function RowDate({ date, muted }: { date: Date | null; muted?: boolean }) {
    const fmt = useFormat()
    return (
        <div aria-hidden className="tnum w-9 shrink-0 flex flex-col items-center justify-center leading-none relative z-10 pointer-events-none">
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.08em]", muted ? "text-muted-foreground" : "text-brand")}>
                {date ? fmt.date(date, { month: "short" }) : ""}
            </span>
            <span className={cn("mt-0.5 text-[0.95rem] font-bold", muted ? "text-muted-foreground" : "text-foreground")}>
                {date ? date.getDate() : "--"}
            </span>
        </div>
    )
}
