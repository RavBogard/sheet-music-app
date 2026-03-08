"use client"

import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { PlayCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * NextServiceCard -- single focused card for the home screen.
 *
 * Shows this week's service at a glance: date, setlist name, musicians,
 * and one prominent action button. "One card, one action" philosophy.
 *
 * When isPastSetlist is true, the card shows "Recent" label and
 * "Practice" button instead of "Perform" for the most recent past setlist.
 */
export function NextServiceCard({
    setlist,
    onPerform,
    isPastSetlist = false,
}: {
    setlist: Setlist
    onPerform: () => void
    isPastSetlist?: boolean
}) {
    const eventDate = toDate(setlist.eventDate)

    // Format the date in a human-friendly way
    const dateLabel = (() => {
        if (!eventDate) return isPastSetlist ? "Recent" : "Upcoming"

        const now = new Date()
        const d = new Date(eventDate)
        now.setHours(0, 0, 0, 0)
        d.setHours(0, 0, 0, 0)
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (isPastSetlist) return "Recent"
        if (diffDays <= 0) return "Today"
        if (diffDays === 1) return "Tomorrow"

        return eventDate.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
        })
    })()

    const musicians = setlist.musicians || []
    const songCount = (setlist.tracks || []).filter(
        (t) => !t.type || t.type === "song"
    ).length

    return (
        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 shadow-lg">
            {/* Date label */}
            <div className="flex items-center gap-2 mb-3">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {dateLabel}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                    {songCount} song{songCount !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Setlist name */}
            <h2 className="text-xl font-bold leading-snug mb-3 font-display">
                {setlist.name}
            </h2>

            {/* Musicians */}
            {musicians.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {musicians.map((m, i) => (
                        <span
                            key={m.uid || `musician-${i}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                        >
                            {m.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Single action button */}
            <button
                onClick={onPerform}
                className={cn(
                    "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors",
                    isPastSetlist
                        ? "bg-muted hover:bg-muted/80 text-foreground"
                        : "bg-primary text-primary-foreground hover:opacity-90"
                )}
            >
                <PlayCircle className="h-4 w-4" />
                {isPastSetlist ? "Practice" : "Perform"}
            </button>
        </div>
    )
}
