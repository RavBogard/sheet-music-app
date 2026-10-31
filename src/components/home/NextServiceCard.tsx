"use client"

import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { PlayCircle, Clock, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"

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
    onEdit,
    isPastSetlist = false,
    isBandLeader = false,
}: {
    setlist: Setlist
    onPerform: () => void
    onEdit?: () => void
    isPastSetlist?: boolean
    isBandLeader?: boolean
}) {
    const t = useT()
    const fmt = useFormat()
    const eventDate = toDate(setlist.eventDate)

    // Format the date in a human-friendly way
    const dateLabel = (() => {
        if (!eventDate) return isPastSetlist ? t("home.recent") : t("home.upcoming")

        const now = new Date()
        const d = new Date(eventDate)
        now.setHours(0, 0, 0, 0)
        d.setHours(0, 0, 0, 0)
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (isPastSetlist) return t("home.recent")
        if (diffDays <= 0) return t("home.today")
        if (diffDays === 1) return t("home.tomorrow")

        return fmt.date(eventDate, {
            weekday: "long",
            month: "long",
            day: "numeric",
        })
    })()

    const musicians = setlist.musicians || []
    const songCount = setlist.songCount ?? 0

    // Web refresh (blend E): one white card on the hairline. The date and
    // song count make the status line, the name is large, and the one blue
    // action is Perform (a quiet outline Practice for a past setlist).
    const meta = (
        <p className="tnum flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Clock aria-hidden="true" className="h-3.5 w-3.5" />
            <span className={isPastSetlist ? undefined : "font-bold text-brand"}>{dateLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{t("home.songCount", { count: songCount })}</span>
        </p>
    )
    const musicianChips = musicians.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
            {musicians.map((m, i) => (
                <span
                    key={m.uid || `musician-${i}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium bg-secondary text-secondary-foreground"
                >
                    {m.name}
                </span>
            ))}
        </div>
    ) : null

    return (
        <div
            onClick={onPerform}
            className="rounded-lg border border-rule bg-card p-5 shadow-[0_2px_12px_rgb(24_32_46/0.06)] cursor-pointer hover:border-brand/40 transition-colors duration-200 group"
        >
            {meta}
            <h2 className="mt-1 text-[1.35rem] font-extrabold leading-tight tracking-[-0.015em] text-foreground line-clamp-2">
                {setlist.name}
            </h2>
            {musicianChips}

            {/* Primary CTA. Band leaders get an adjacent Edit shortcut;
                musicians/members see Perform-only. */}
            <div className="flex items-center gap-2 mt-4">
                {isPastSetlist ? (
                    <Button
                        variant="outline"
                        className="flex-1 h-12 rounded-md font-bold border-border bg-card text-foreground group-hover:bg-accent transition-colors"
                    >
                        <PlayCircle className="h-4 w-4" />
                        {t("home.practice")}
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        className="flex-1 h-12 rounded-md text-[15px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground group-hover:bg-primary/90 transition-colors"
                    >
                        <PlayCircle className="h-4 w-4" />
                        {t("home.perform")}
                    </Button>
                )}
                {isBandLeader && onEdit && (
                    <Button
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onEdit() }}
                        aria-label={t("home.editSetlistAria")}
                        className="h-12 px-4 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                        <Pencil className="h-4 w-4" />
                        <span className="text-sm font-semibold">{t("home.edit")}</span>
                    </Button>
                )}
            </div>
        </div>
    )
}
