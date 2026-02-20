"use client"

import Link from "next/link"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { Music2, ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Compact setlist row for non-prep-tracked lists.
 * Uses <Link> for automatic prefetching of the destination page.
 */
export function CompactSetlistRow({ setlist, onSelect }: { setlist: Setlist; onSelect?: (setlist: Setlist) => void }) {
    const router = useRouter()
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

    const eventDate = toDate(setlist.eventDate)
    const dateStr = eventDate
        ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : ''

    // Wrap onSelect to show immediate feedback before navigation
    const handleSelect = () => {
        setNavigatingTo(setlist.id)
        if (onSelect) {
            onSelect(setlist)
        } else {
            router.push(`/setlists/${setlist.id}`)
        }
    }

    const href = `/setlists/${setlist.id}`

    const content = (
        <>
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
        </>
    )

    if (onSelect) {
        return (
            <button
                onClick={handleSelect}
                className={`w-full flex items-center gap-3 bg-card hover:bg-accent rounded-xl px-3 py-2.5 transition-colors text-left group border border-border ${navigatingTo ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {content}
            </button>
        )
    }

    return (
        <Link
            href={href}
            className="w-full flex items-center gap-3 bg-card hover:bg-accent rounded-xl px-3 py-2.5 transition-colors text-left group border border-border"
        >
            {content}
        </Link>
    )
}
