"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { Clock, ChevronRight, CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Upcoming timeline with day groupings and inline progress bars.
 * Uses <Link> for automatic prefetching of setlist pages.
 */
export function UpcomingTimeline({
    items,
    onSelect,
}: {
    items: UpcomingSetlistWithPrep[]
    onSelect?: (s: Setlist) => void
}) {
    // Group by day
    const grouped = useMemo(() => {
        const groups: { label: string; key: string; items: UpcomingSetlistWithPrep[] }[] = []
        const seen = new Map<string, UpcomingSetlistWithPrep[]>()

        for (const item of items) {
            const eventDate = toDate(item.setlist.eventDate)
            if (!eventDate) continue

            const now = new Date()
            now.setHours(0, 0, 0, 0)
            const d = new Date(eventDate)
            d.setHours(0, 0, 0, 0)
            const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

            let label: string
            if (diff <= 0) label = 'Today'
            else if (diff === 1) label = 'Tomorrow'
            else label = eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()

            const key = d.toISOString().split('T')[0]
            if (!seen.has(key)) {
                seen.set(key, [])
                groups.push({ label, key, items: seen.get(key)! })
            }
            seen.get(key)!.push(item)
        }

        return groups
    }, [items])

    const [expanded, setExpanded] = useState<string | null>(null)

    if (grouped.length === 0) return null

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-brand" />
                Coming Up
            </h2>

            <div className="flex flex-col gap-3">
                {grouped.map((group) => (
                    <div key={group.key}>
                        {/* Day label */}
                        <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 pl-1">
                            {group.label}
                        </div>

                        {/* Setlists in this day */}
                        <div className="flex flex-col gap-1.5">
                            {group.items.map((item) => {
                                const { setlist: s, prep, isNew } = item
                                const isToday = group.label === 'Today'
                                const isExp = expanded === s.id

                                return (
                                    <div key={s.id} className="bg-card border border-brand/10 rounded-xl overflow-hidden">
                                        <Link
                                            href={`/perform/setlist/${s.id}`}
                                            onClick={onSelect ? () => onSelect(s) : undefined}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-brand/5 transition-colors text-left"
                                        >
                                            {/* Status dot */}
                                            <div className={cn(
                                                "w-2 h-2 rounded-full shrink-0",
                                                isToday ? "bg-brand" : "bg-brand/20"
                                            )} />

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                                                    {s.name}
                                                    {isNew && (
                                                        <span className="text-[9px] font-bold bg-brand/15 text-foreground px-1.5 py-0.5 rounded-full shrink-0">
                                                            Updated
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Progress bar */}
                                                {prep.total > 0 && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="flex-1 h-1 bg-brand/10 rounded-full overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full dash-progress-bar",
                                                                    prep.percent === 100 ? "bg-success" : "bg-brand"
                                                                )}
                                                                style={{ width: `${prep.percent}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground font-medium w-8 text-right">
                                                            {prep.viewed}/{prep.total}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Expand toggle */}
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(isExp ? null : s.id!) }}
                                                aria-label={isExp ? "Collapse track list" : "Expand track list"}
                                                className="p-2.5 rounded-lg hover:bg-brand/10 text-muted-foreground/50 shrink-0 flex items-center justify-center min-w-[44px] min-h-[44px]"
                                            >
                                                <ChevronRight className={cn("w-4 h-4 transition-transform", isExp && "rotate-90")} />
                                            </button>
                                        </Link>

                                        {/* Expanded track list */}
                                        {isExp && (
                                            <ExpandedTrackList setlist={s} viewedFileIds={item.viewedFileIds} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

/**
 * Expanded track list inside a timeline card.
 */
function ExpandedTrackList({ setlist, viewedFileIds }: { setlist: Setlist; viewedFileIds: Set<string> }) {
    const tracks = (setlist.tracks || []).filter(t => t.type !== 'header')

    return (
        <div className="border-t border-brand/10 px-3 py-2 space-y-0.5 bg-brand/5">
            {tracks.map((track, i) => {
                const viewed = track.fileId ? viewedFileIds.has(track.fileId) : false
                return (
                    <div key={`${track.fileId}-${i}`} className="flex items-center gap-2 py-1 text-xs">
                        {track.fileId ? (
                            viewed ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                            ) : (
                                <Circle className="w-3 h-3 text-brand/25 shrink-0" />
                            )
                        ) : (
                            <span className="w-3 h-3 shrink-0" />
                        )}
                        <span className={cn("truncate", viewed ? "text-muted-foreground" : "text-foreground")}>
                            {track.title}
                        </span>
                        {track.key && (
                            <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto shrink-0">
                                {track.key}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
