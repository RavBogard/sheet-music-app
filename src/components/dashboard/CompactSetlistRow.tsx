"use client"

import Link from "next/link"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { Music2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
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
            router.push(`/perform/setlist/${setlist.id}`)
        }
    }

    const href = `/perform/setlist/${setlist.id}`

    const content = (
        <>
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                <Music2 className="w-3.5 h-3.5 text-brand" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">{setlist.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {dateStr && <span>{dateStr}</span>}
                    <span>{setlist.trackCount ?? 0} songs</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-brand/30 group-hover:text-brand/60 transition-colors shrink-0" />
        </>
    )

    if (onSelect) {
        return (
            <Button
                variant="ghost"
                onClick={handleSelect}
                className={`w-full h-auto flex items-center gap-3 bg-card hover:bg-brand/5 rounded-xl px-3 py-2.5 text-left group border border-brand/10 active:scale-100 ${navigatingTo ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {content}
            </Button>
        )
    }

    return (
        <Link
            href={href}
            className="w-full flex items-center gap-3 bg-card hover:bg-brand/5 rounded-xl px-3 py-2.5 transition-colors text-left group border border-brand/10"
        >
            {content}
        </Link>
    )
}
