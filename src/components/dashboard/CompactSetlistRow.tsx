"use client"

import Link from "next/link"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { Music2, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"

/**
 * Compact setlist row for non-prep-tracked lists.
 * Uses <Link> for automatic prefetching of the destination page.
 */
export function CompactSetlistRow({ setlist, onSelect }: { setlist: Setlist; onSelect?: (setlist: Setlist) => void }) {
    const router = useRouter()
    const t = useT()
    const fmt = useFormat()
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

    const eventDate = toDate(setlist.eventDate)
    const dateStr = eventDate
        ? fmt.date(eventDate, { weekday: 'short', month: 'short', day: 'numeric' })
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
            <Music2 aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-[0.95rem] leading-snug text-foreground truncate">{setlist.name}</div>
                <div className="tnum text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    {dateStr && <span>{dateStr}</span>}
                    <span>{t("dashboard.compactSongCount", { count: setlist.trackCount ?? 0 })}</span>
                </div>
            </div>
            <DirectionalIcon icon={ChevronRight} className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
        </>
    )

    if (onSelect) {
        return (
            <Button
                variant="ghost"
                onClick={handleSelect}
                className={`w-full h-auto min-h-11 flex items-center gap-3 bg-card hover:bg-accent/60 rounded-none px-4 py-1 text-start group active:scale-100 ${navigatingTo ? 'opacity-50 pointer-events-none' : ''}`}
            >
                {content}
            </Button>
        )
    }

    return (
        <Link
            href={href}
            className="w-full min-h-11 flex items-center gap-3 bg-card hover:bg-accent/60 px-4 py-1 transition-colors text-start group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
            {content}
        </Link>
    )
}
