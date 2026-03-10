"use client"

import React from "react"
import {
    Plus, CheckCircle2, Clock, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CalendarMode, CalendarDayData } from "@/hooks/use-calendar-data"
import type { SchedulingAssignment } from "@/types/models"
import type { Setlist } from "@/lib/setlist-firebase"

interface CalendarDayCellProps {
    date: Date
    dateKey: string
    dayData: CalendarDayData | undefined
    mode: CalendarMode
    isToday: boolean
    isPast: boolean
    onSelectSetlist: (setlist: Setlist) => void
    onCreateSetlist?: (date: Date, type?: 'shabbat_morning') => void
}

function getCoverageStatus(assignments: SchedulingAssignment[]): 'full' | 'partial' | 'empty' {
    if (assignments.length === 0) return 'empty'
    const confirmed = assignments.filter(a => a.status === 'confirmed').length
    const pending = assignments.filter(a => a.status === 'pending').length
    if (confirmed >= 2 && pending === 0) return 'full'
    if (confirmed > 0 || pending > 0) return 'partial'
    return 'empty'
}

export const CalendarDayCell = React.memo(function CalendarDayCell({
    date, dateKey, dayData, mode, isToday, isPast,
    onSelectSetlist, onCreateSetlist,
}: CalendarDayCellProps) {
    const isFriday = date.getDay() === 5
    const isSaturday = date.getDay() === 6
    const setlists = dayData?.setlists ?? []

    return (
        <div className={cn(
            "min-h-[72px] sm:min-h-[100px] p-1.5 border-b border-r border-border/20 group transition-all duration-200",
            isToday && "bg-brand/5 ring-1 ring-inset ring-brand/10",
            (isFriday || isSaturday) && !isToday && "bg-brand/[0.02]",
            "hover:bg-accent/30",
        )}>
            {/* Date number */}
            <div className="flex items-center justify-between mb-1">
                <span className={cn(
                    "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full transition-all duration-200",
                    isToday ? "bg-brand text-brand-foreground shadow-sm shadow-brand/30" : "text-muted-foreground",
                )}>
                    {date.getDate()}
                </span>
            </div>

            {/* Setlist chips */}
            <div className="space-y-1">
                {setlists.map(setlist => {
                    const setlistAssignments = dayData?.assignmentsBySetlist.get(setlist.id) ?? []
                    const coverage = getCoverageStatus(setlistAssignments)
                    const confirmed = setlistAssignments.filter(a => a.status === 'confirmed').length
                    const pending = setlistAssignments.filter(a => a.status === 'pending').length

                    return (
                        <Button
                            key={setlist.id}
                            variant="ghost"
                            onClick={() => onSelectSetlist(setlist)}
                            className={cn(
                                "w-full h-auto min-h-11 text-left p-1.5 rounded-lg text-[11px] border active:scale-[0.97] whitespace-normal flex-col items-start",
                                mode === 'planning' && coverage === 'full' && "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40",
                                mode === 'planning' && coverage === 'partial' && "bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/40",
                                mode === 'planning' && coverage === 'empty' && "bg-red-500/10 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/40",
                                mode === 'viewer' && "bg-muted hover:bg-accent border-border/50",
                            )}
                        >
                            <p className="font-medium truncate text-foreground">{setlist.name}</p>
                            {mode === 'planning' && (
                                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                                    <Users className="h-2.5 w-2.5" />
                                    {confirmed > 0 && (
                                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 className="h-2.5 w-2.5" />{confirmed}
                                        </span>
                                    )}
                                    {pending > 0 && (
                                        <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                            <Clock className="h-2.5 w-2.5" />{pending}
                                        </span>
                                    )}
                                    {setlistAssignments.length === 0 && (
                                        <span className="text-red-500 italic">none</span>
                                    )}
                                </div>
                            )}
                        </Button>
                    )
                })}

                {/* Placeholder for empty Shabbat cells */}
                {setlists.length === 0 && (isFriday || isSaturday) && onCreateSetlist && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => onCreateSetlist(date, isSaturday ? 'shabbat_morning' : undefined)}
                            className="w-full h-auto text-left p-1 rounded-md text-[10px] text-muted-foreground/40 hover:text-muted-foreground border border-dashed border-border/40 hover:border-brand/30 hover:bg-brand/5 justify-start"
                        >
                            <Plus className="h-2.5 w-2.5" />
                            {isSaturday ? 'Shabbat AM' : 'Friday Eve'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
})
