"use client"

import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CalendarMode } from "@/hooks/use-calendar-data"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"

/** A Sunday-to-Saturday week at UTC noon (Sun 4 Oct 2026); formatted in UTC so the weekday never shifts with the zone. */
const WEEK_UTC = Array.from({ length: 7 }, (_, i) => Date.UTC(2026, 9, 4 + i, 12))

interface CalendarHeaderProps {
    monthLabel: string
    mode: CalendarMode
    onPrev: () => void
    onNext: () => void
}

export function CalendarHeader({ monthLabel, mode, onPrev, onNext }: CalendarHeaderProps) {
    const t = useT()
    const fmt = useFormat()
    const weekdays = WEEK_UTC.map(d => ({
        short: fmt.date(d, { weekday: 'short', timeZone: 'UTC' }),
        narrow: fmt.date(d, { weekday: 'narrow', timeZone: 'UTC' }),
    }))
    return (
        <div className="space-y-0">
            {/* Month nav */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/50">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand/10">
                        <CalendarIcon className="h-4 w-4 text-brand" />
                    </div>
                    {monthLabel}
                </h2>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label={t("calendar.previousMonth")} onClick={onPrev} className="h-8 w-8 rounded-lg fluid-interaction">
                        <DirectionalIcon icon={ChevronLeft} className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={t("calendar.nextMonth")} onClick={onNext} className="h-8 w-8 rounded-lg fluid-interaction">
                        <DirectionalIcon icon={ChevronRight} className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Legend — only in planning mode */}
            {mode === 'planning' && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-border/40 text-xs text-muted-foreground bg-muted/20">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" /> {t("calendar.legendFullyStaffed")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" /> {t("calendar.legendNeedsAttention")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20" /> {t("calendar.legendNoMusicians")}
                    </span>
                </div>
            )}

            {/* Day headers */}
            <div className="grid grid-cols-7 bg-muted/50 border-b border-border/40">
                {weekdays.map((day, i) => (
                    <div key={i} className={cn(
                        "p-2 text-xs font-semibold text-center",
                        (i === 5 || i === 6) ? 'text-brand' : 'text-muted-foreground'
                    )}>
                        <span className="sm:hidden">{day.narrow}</span>
                        <span className="hidden sm:inline">{day.short}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
