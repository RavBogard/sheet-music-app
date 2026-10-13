"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { isFileCached, cacheSetlistFiles } from "@/lib/cache-utils"
import { type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { PlayCircle, ArrowRight, CheckCircle2, Circle, Clock, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useT, useFormat } from "@/i18n/client"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"

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
    const t = useT()
    const fmt = useFormat()
    const [countdown, setCountdown] = useState<string | null>(null)
    const [offlineStatus, setOfflineStatus] = useState<{ cached: number; total: number } | null>(null)
    const [downloading, setDownloading] = useState(false)
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
            setCountdown(h > 0 ? t("dashboard.countdownHoursMinutes", { hours: h, minutes: m }) : t("dashboard.countdownMinutes", { minutes: m }))
        }

        update()
        const iv = setInterval(update, 60_000)
        return () => clearInterval(iv)
    }, [eventDate, t])

    const fileIds = useMemo(
        () => setlist.fileIds ?? [],
        [setlist.fileIds]
    )

    // Check offline readiness for this setlist's charts
    useEffect(() => {
        if (fileIds.length === 0) return
        Promise.all(fileIds.map(id => isFileCached(id))).then(results => {
            const cached = results.filter(Boolean).length
            setOfflineStatus({ cached, total: fileIds.length })
        }).catch(() => {/* non-critical: offline indicator just won't show */ })
    }, [fileIds])

    const handleDownloadForOffline = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (downloading || fileIds.length === 0) return

        setDownloading(true)
        try {
            await cacheSetlistFiles(fileIds, (cached, total) => {
                setOfflineStatus({ cached, total })
            })
        } finally {
            setDownloading(false)
        }
    }, [downloading, fileIds])

    const urgencyLabel = prep?.urgencyLabel || (() => {
        if (!eventDate) return t("dashboard.urgencyUpcoming")
        const now = new Date()
        const d = new Date(eventDate)
        now.setHours(0, 0, 0, 0)
        d.setHours(0, 0, 0, 0)
        const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diff <= 0) return t("dashboard.urgencyToday")
        if (diff === 1) return t("dashboard.urgencyTomorrow")
        return fmt.date(eventDate, { weekday: 'short', month: 'short', day: 'numeric' })
    })()

    const isImminent = countdown !== null
    const trackCount = setlist.trackCount ?? 0
    const prepData = prep?.prep
    const allCached = offlineStatus && offlineStatus.cached === offlineStatus.total

    return (
        <Button
            variant="ghost"
            onClick={isImminent ? onPerform : onClick}
            className={cn(
                "w-full h-auto text-start rounded-2xl p-5 shadow-lg active:scale-[0.98] group border relative overflow-hidden items-start whitespace-normal flex-col",
                isImminent
                    ? "bg-gradient-to-br from-brand to-brand/80 border-white/15 shadow-brand/20 hover:from-brand hover:to-brand/70"
                    : "bg-gradient-to-br from-brand/90 to-brand/80 border-white/10 hover:from-brand/95 hover:to-brand/85"
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
                            {t("dashboard.startsIn", { countdown })}
                        </>
                    ) : (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            {urgencyLabel}
                        </>
                    )}
                </span>
                <span className="text-white/50 text-xs font-medium">
                    {t("dashboard.songCount", { count: trackCount })}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-lg sm:text-xl font-bold text-white leading-snug mb-4 font-display line-clamp-2">
                {setlist.name}
            </h3>

            {/* Prep progress bar (when available) */}
            {prepData && prepData.total > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                        <span>{t("dashboard.chartsReviewed", { viewed: prepData.viewed, total: prepData.total })}</span>
                        <span className="font-semibold text-white/90">{t("dashboard.percent", { percent: prepData.percent })}</span>
                    </div>
                    <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                prepData.percent === 100 ? "bg-success" : "bg-white/70"
                            )}
                            style={{ width: `${prepData.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Offline status + download button */}
            {offlineStatus && offlineStatus.total > 0 && (
                <div className="flex items-center gap-2 mb-3">
                    {allCached ? (
                        <span className="text-green-300/80 flex items-center gap-1 text-xs font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            {t("dashboard.allChartsCached", { total: offlineStatus.total })}
                        </span>
                    ) : (
                        <>
                            <span className="text-amber-300/80 flex items-center gap-1 text-xs font-medium">
                                <Circle className="w-3 h-3" />
                                {t("dashboard.chartsCachedProgress", { cached: offlineStatus.cached, total: offlineStatus.total })}
                            </span>
                            <Button
                                variant="ghost"
                                size="xs"
                                onClick={handleDownloadForOffline}
                                disabled={downloading}
                                aria-label={t("dashboard.downloadAllAria")}
                                className={cn(
                                    "font-semibold rounded-full",
                                    downloading
                                        ? "bg-white/10 text-white/60 cursor-wait"
                                        : "bg-white/20 text-white hover:bg-white/30"
                                )}
                            >
                                {downloading ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> {t("dashboard.downloading")}</>
                                ) : (
                                    <><Download className="w-3 h-3" /> {t("dashboard.downloadAll")}</>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* Primary action */}
            {isImminent ? (
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-white text-sm font-bold group-hover:text-white transition-colors">
                        <PlayCircle className="w-5 h-5" />
                        {t("dashboard.perform")}
                        <DirectionalIcon icon={ArrowRight} className="w-4 h-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <Button
                        variant="link"
                        size="xs"
                        onClick={(e) => { e.stopPropagation(); onClick() }}
                        className="ms-auto text-xs text-white/50 hover:text-white/80"
                    >
                        {t("dashboard.editSetlist")}
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2 text-white text-sm font-semibold group-hover:text-white transition-colors">
                    <PlayCircle className="w-5 h-5" />
                    {t("dashboard.openSetlist")}
                    <DirectionalIcon icon={ArrowRight} className="w-4 h-4 ms-auto opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
            )}
        </Button>
    )
}
