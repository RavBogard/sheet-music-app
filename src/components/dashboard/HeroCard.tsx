"use client"

import { useState, useEffect } from "react"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { isFileCached } from "@/lib/cache-utils"
import { type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { PlayCircle, ArrowRight, CheckCircle2, Circle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Hero card — the next imminent setlist with integrated prep progress.
 * Always renders instantly (no stagger delay) for gig-load speed.
 */
export function HeroCard({
    setlist,
    prep,
    onClick,
    onPerform,
}: {
    setlist: Setlist
    prep: UpcomingSetlistWithPrep | null
    onClick: () => void
    onPerform: () => void
}) {
    const [countdown, setCountdown] = useState<string | null>(null)
    const [offlineStatus, setOfflineStatus] = useState<{ cached: number; total: number } | null>(null)
    const eventDate = toDate(setlist.eventDate)

    // Live countdown when event is within 4 hours
    useEffect(() => {
        if (!eventDate) return

        const update = () => {
            const msLeft = eventDate.getTime() - Date.now()
            if (msLeft <= 0) { setCountdown(null); return }
            if (msLeft > 4 * 60 * 60 * 1000) { setCountdown(null); return }

            const h = Math.floor(msLeft / (1000 * 60 * 60))
            const m = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
            setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`)
        }

        update()
        const iv = setInterval(update, 60_000)
        return () => clearInterval(iv)
    }, [eventDate])

    // Check offline readiness for this setlist's charts
    useEffect(() => {
        const fileIds = (setlist.tracks || []).filter(t => t.fileId).map(t => t.fileId!)
        if (fileIds.length === 0) return
        Promise.all(fileIds.map(id => isFileCached(id))).then(results => {
            const cached = results.filter(Boolean).length
            setOfflineStatus({ cached, total: fileIds.length })
        }).catch(() => {/* silent */ })
    }, [setlist.tracks])

    const urgencyLabel = prep?.urgencyLabel || (() => {
        if (!eventDate) return 'Upcoming'
        const now = new Date()
        const d = new Date(eventDate)
        now.setHours(0, 0, 0, 0)
        d.setHours(0, 0, 0, 0)
        const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diff <= 0) return 'Today'
        if (diff === 1) return 'Tomorrow'
        return eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    })()

    const isImminent = countdown !== null
    const trackCount = setlist.tracks?.length || 0
    const prepData = prep?.prep

    return (
        <button
            onClick={isImminent ? onPerform : onClick}
            className={cn(
                "w-full text-left rounded-2xl p-5 shadow-lg active:scale-[0.98] transition-all group border relative overflow-hidden",
                isImminent
                    ? "bg-gradient-to-br from-violet-600 to-indigo-700 border-white/15 shadow-violet-500/20"
                    : "bg-gradient-to-br from-indigo-600/90 to-violet-600/90 border-white/10"
            )}
        >
            {/* Urgency badge */}
            <div className="flex items-start justify-between mb-3">
                <span className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                    isImminent
                        ? "bg-white/25 text-white backdrop-blur-sm"
                        : "bg-white/15 text-white/90 backdrop-blur-sm"
                )}>
                    {isImminent ? (
                        <>
                            <Clock className="w-3 h-3" />
                            Starts in {countdown}
                        </>
                    ) : (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            {urgencyLabel}
                        </>
                    )}
                </span>
                <span className="text-white/50 text-xs font-medium">
                    {trackCount} song{trackCount !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-white leading-snug mb-4">
                {setlist.name}
            </h3>

            {/* Prep progress bar (when available) */}
            {prepData && prepData.total > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                        <span>{prepData.viewed}/{prepData.total} charts reviewed</span>
                        <span className="font-semibold text-white/90">{prepData.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                prepData.percent === 100 ? "bg-green-400" : "bg-white/70"
                            )}
                            style={{ width: `${prepData.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* CTA */}
            {offlineStatus && offlineStatus.total > 0 && (
                <div className="flex items-center gap-1.5 mb-3 text-xs font-medium">
                    {offlineStatus.cached === offlineStatus.total ? (
                        <span className="text-green-300/80 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            All {offlineStatus.total} charts cached
                        </span>
                    ) : (
                        <span className="text-amber-300/80 flex items-center gap-1">
                            <Circle className="w-3 h-3" />
                            {offlineStatus.cached}/{offlineStatus.total} charts cached
                        </span>
                    )}
                </div>
            )}

            {/* Primary action */}
            {isImminent ? (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-white text-sm font-bold group-hover:text-white transition-colors">
                        <PlayCircle className="w-5 h-5" />
                        Perform
                        <ArrowRight className="w-4 h-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClick() }}
                        className="ml-auto text-xs text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors"
                    >
                        Edit setlist
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-white text-sm font-semibold group-hover:text-white transition-colors">
                    <PlayCircle className="w-5 h-5" />
                    Open Setlist
                    <ArrowRight className="w-4 h-4 ml-auto opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
            )}
        </button>
    )
}
