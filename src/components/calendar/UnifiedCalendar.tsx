"use client"

import { useState, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCalendarData, type CalendarMode } from "@/hooks/use-calendar-data"
import { CalendarHeader } from "./CalendarHeader"
import { CalendarGrid } from "./CalendarGrid"
import type { Setlist } from "@/lib/setlist-firebase"
import { useT, useFormat } from "@/i18n/client"

interface UnifiedCalendarProps {
    /** Role-based rendering mode */
    mode: CalendarMode
    /** Setlists to display (viewer + planning modes) */
    setlists?: Setlist[]
    /** Called when a setlist chip is clicked */
    onSelectSetlist?: (setlist: Setlist) => void
    /** Called when the "+" / Shabbat placeholder is clicked */
    onCreateSetlist?: (date: Date, type?: 'shabbat_morning') => void
    className?: string
}

/**
 * Unified Calendar — single, mode-aware component.
 *
 * Modes:
 *   - viewer:   setlists + my assignments (everyone)
 *   - planning: setlists + all assignment coverage (band leaders)
 */
export function UnifiedCalendar({
    mode,
    setlists = [],
    onSelectSetlist,
    onCreateSetlist,
    className,
}: UnifiedCalendarProps) {
    const t = useT()
    const fmt = useFormat()
    const [currentDate, setCurrentDate] = useState(new Date())

    const { dayMap, loading } = useCalendarData(mode, setlists)

    const { monthLabel, year, month } = useMemo(() => {
        const y = currentDate.getFullYear()
        const m = currentDate.getMonth()
        // Mid-month instant: the label shows month + year only, and a tenant
        // formatting in its own zone can never slip into the previous month.
        const midMonth = new Date(y, m, 15)
        return {
            monthLabel: fmt.date(midMonth, { month: 'long', year: 'numeric' }),
            year: y,
            month: m,
        }
    }, [currentDate, fmt])

    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))

    const handleSelectSetlist = (setlist: Setlist) => {
        onSelectSetlist?.(setlist)
    }

    return (
        <div className={cn("flex flex-col glass-card rounded-xl overflow-hidden", className)}>
            <CalendarHeader
                monthLabel={monthLabel}
                mode={mode}
                onPrev={prevMonth}
                onNext={nextMonth}
            />

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-brand/60" />
                    <p className="text-xs text-muted-foreground">{t("calendar.loading")}</p>
                </div>
            ) : (
                <CalendarGrid
                    currentDate={currentDate}
                    mode={mode}
                    dayMap={dayMap}
                    onSelectSetlist={handleSelectSetlist}
                    onCreateSetlist={onCreateSetlist}
                />
            )}

        </div>
    )
}
