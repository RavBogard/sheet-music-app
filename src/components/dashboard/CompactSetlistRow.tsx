"use client"

import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { Music2, ChevronRight } from "lucide-react"

/**
 * Compact setlist row for non-prep-tracked lists.
 */
export function CompactSetlistRow({ setlist, onClick }: { setlist: Setlist; onClick: () => void }) {
    const eventDate = toDate(setlist.eventDate)
    const dateStr = eventDate
        ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : ''

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 bg-card hover:bg-accent rounded-xl px-3 py-2.5 transition-colors text-left group border border-border"
        >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music2 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">{setlist.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {dateStr && <span>{dateStr}</span>}
                    <span>{setlist.tracks?.length || 0} songs</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
        </button>
    )
}
