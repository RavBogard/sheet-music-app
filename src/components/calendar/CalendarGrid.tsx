"use client"

import { useMemo } from "react"
import { CalendarDayCell } from "./CalendarDayCell"
import type { CalendarMode, CalendarDayData } from "@/hooks/use-calendar-data"
import type { Setlist } from "@/lib/setlist-firebase"

interface CalendarGridProps {
    currentDate: Date
    mode: CalendarMode
    dayMap: Map<string, CalendarDayData>
    onSelectSetlist: (setlist: Setlist) => void
    onCreateSetlist?: (date: Date, type?: 'shabbat_morning') => void
}

function todayKey(): string {
    return new Date().toISOString().split('T')[0]
}

export function CalendarGrid({
    currentDate, mode, dayMap,
    onSelectSetlist, onCreateSetlist,
}: CalendarGridProps) {
    const { days } = useMemo(() => {
        const y = currentDate.getFullYear()
        const m = currentDate.getMonth()
        const firstDay = new Date(y, m, 1)
        const lastDay = new Date(y, m + 1, 0)
        const startDow = firstDay.getDay()
        const totalDays = lastDay.getDate()

        const arr: (Date | null)[] = []
        for (let i = 0; i < startDow; i++) arr.push(null)
        for (let i = 1; i <= totalDays; i++) arr.push(new Date(y, m, i))

        return { days: arr }
    }, [currentDate])

    const today = todayKey()

    return (
        <div className="grid grid-cols-7 auto-rows-fr">
            {days.map((date, i) => {
                if (!date) {
                    return (
                        <div
                            key={`empty-${i}`}
                            className="min-h-[72px] sm:min-h-[100px] bg-background/20 border-b border-r border-border/20"
                        />
                    )
                }

                const dateKey = date.toISOString().split('T')[0]
                const isToday = dateKey === today
                const isPast = dateKey < today

                return (
                    <CalendarDayCell
                        key={dateKey}
                        date={date}
                        dateKey={dateKey}
                        dayData={dayMap.get(dateKey)}
                        mode={mode}
                        isToday={isToday}
                        isPast={isPast}
                        onSelectSetlist={onSelectSetlist}
                        onCreateSetlist={onCreateSetlist}
                    />
                )
            })}
        </div>
    )
}
