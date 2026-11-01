"use client"

import { Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { PlayCircle, Clock, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
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

    // Option B: one compact white card on the hairline. The name at
    // 1rem/800 with ONE meta line under it (date · songs · who's playing), and
    // the one blue action, Perform, on the right (a quiet outline Practice for
    // a past setlist).
    const meta = (
        <p className="tnum flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock aria-hidden="true" className="h-3 w-3 shrink-0" />
            <span className={cn("shrink-0", !isPastSetlist && "font-bold text-brand")}>{dateLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="shrink-0">{t("home.songCount", { count: songCount })}</span>
            {musicians.length > 0 ? (
                <span className="min-w-0 truncate">
                    {musicians.map((m, i) => (
                        <span key={m.uid || `musician-${i}`}>
                            <span aria-hidden="true">{i === 0 ? " · " : ", "}</span>
                            <span>{m.name}</span>
                        </span>
                    ))}
                </span>
            ) : null}
        </p>
    )

    return (
        <div
            onClick={onPerform}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rule bg-card ps-3 pe-2 sm:ps-4 py-2 cursor-pointer hover:border-brand/40 transition-colors duration-200 group"
        >
            <div className="min-w-0 flex-[1_1_14rem]">
                <h2 className="text-[0.95rem] font-bold leading-snug text-foreground line-clamp-2">
                    {setlist.name}
                </h2>
                {meta}
            </div>

            {/* Primary CTA. Band leaders get an adjacent Edit shortcut;
                musicians/members see Perform-only. */}
            <div className="ms-auto flex shrink-0 items-center gap-1">
                {isBandLeader && onEdit && (
                    // The one row-edit control: a ghost pencil, as on /setlists.
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); onEdit() }}
                        aria-label={t("home.editSetlistAria")}
                        title={t("home.edit")}
                        className="touch-hit h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                        <Pencil className="h-4 w-4" />
                    </Button>
                )}
                {isPastSetlist ? (
                    <Button
                        variant="outline"
                        size="sm"
                        className="touch-hit h-9 rounded-md px-3.5 text-sm font-bold border-border bg-card text-foreground group-hover:bg-accent transition-colors"
                    >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {t("home.practice")}
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="touch-hit h-9 rounded-md px-3.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground group-hover:bg-primary/90 transition-colors"
                    >
                        <PlayCircle className="h-3.5 w-3.5" />
                        {t("home.perform")}
                    </Button>
                )}
            </div>
        </div>
    )
}
