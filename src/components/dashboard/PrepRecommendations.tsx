"use client"

import { type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { AlertTriangle } from "lucide-react"

/**
 * Practice recommendations based on unviewed charts approaching their event date.
 * Shows a gentle nudge for songs the musician hasn't reviewed yet.
 */
export function PrepRecommendations({
    items,
}: {
    items: UpcomingSetlistWithPrep[]
}) {
    // Find tracks that haven't been viewed in upcoming setlists within 3 days
    const urgent: { songTitle: string; setlistName: string; daysUntil: number }[] = []

    for (const item of items) {
        if (item.daysUntil === null || item.daysUntil > 3) continue
        const tracks = (item.setlist.tracks || []).filter(t => t.fileId && t.type !== 'header')
        for (const track of tracks) {
            if (!track.fileId || item.viewedFileIds.has(track.fileId)) continue
            urgent.push({
                songTitle: track.title,
                setlistName: item.setlist.name,
                daysUntil: item.daysUntil,
            })
        }
    }

    if (urgent.length === 0) return null

    // Show at most 3 recommendations
    const shown = urgent.slice(0, 3)

    return (
        <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-500 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Practice Recommendations
            </div>
            <div className="space-y-1">
                {shown.map((r, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                        <span className="text-foreground font-medium">{r.songTitle}</span>
                        {' — '}
                        {r.daysUntil <= 0 ? 'today' : r.daysUntil === 1 ? 'tomorrow' : `in ${r.daysUntil} days`}
                    </p>
                ))}
                {urgent.length > 3 && (
                    <p className="text-[10px] text-muted-foreground/60">
                        +{urgent.length - 3} more unreviewed charts
                    </p>
                )}
            </div>
        </div>
    )
}
