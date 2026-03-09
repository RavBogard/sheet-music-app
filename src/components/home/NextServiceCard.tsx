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
 * Upcoming setlists render as a bold brand-gradient hero card.
 * Past setlists render in a muted card style with brand accent border.
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

    if (isPastSetlist) {
        return (
            <div className="rounded-2xl border border-brand/15 bg-card/80 backdrop-blur-sm p-5 shadow-lg">
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
                <h2 className="text-xl font-bold leading-snug mb-3 font-display text-foreground">
                    {setlist.name}
                </h2>

                {/* Musicians */}
                {musicians.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {musicians.map((m, i) => (
                            <span
                                key={m.uid || `musician-${i}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-foreground"
                            >
                                {m.name}
                            </span>
                        ))}
                    </div>
                )}

                {/* Action button — muted for past setlists */}
                <button
                    onClick={onPerform}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors cursor-pointer bg-brand/10 hover:bg-brand/15 text-foreground"
                >
                    <PlayCircle className="h-4 w-4" />
                    Practice
                </button>
            </div>
        )
    }

    // Upcoming setlist — bold brand gradient hero card
    return (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-brand to-brand/80 p-5 shadow-lg shadow-brand/20 overflow-hidden relative">
            {/* Date label — white badge on gradient */}
            <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/15 text-white/90 backdrop-blur-sm">
                    <Clock className="h-3 w-3" />
                    {dateLabel}
                </span>
                <span className="text-white/50 text-xs font-medium">
                    {songCount} song{songCount !== 1 ? "s" : ""}
                </span>
            </div>

            {/* Setlist name — white on gradient */}
            <h2 className="text-xl font-bold leading-snug mb-4 font-display text-white">
                {setlist.name}
            </h2>

            {/* Musicians — translucent white badges */}
            {musicians.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {musicians.map((m, i) => (
                        <span
                            key={m.uid || `musician-${i}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white/90"
                        >
                            {m.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Primary CTA — white button on gradient */}
            <button
                onClick={onPerform}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer bg-white text-brand hover:bg-white/90 active:scale-[0.98]"
            >
                <PlayCircle className="h-4 w-4" />
                Perform
            </button>
        </div>
    )
}
