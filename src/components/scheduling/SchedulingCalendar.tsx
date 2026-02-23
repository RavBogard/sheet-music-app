"use client"

import { useState, useMemo, useEffect } from "react"
import {
    Calendar as CalendarIcon, ChevronLeft, ChevronRight, Users, Plus,
    CheckCircle2, Clock, AlertCircle, Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { subscribeToAllUpcomingAssignments, subscribeToAllBlockouts } from "@/lib/scheduling-firebase"
import { useCongregation } from "@/lib/congregation-store"
import type { SchedulingAssignment, MusicianBlockout } from "@/types/models"
import { useRouter } from "next/navigation"

interface SetlistInfo {
    id: string
    name: string
    eventDate: unknown
    rabbi?: string
}

interface SchedulingCalendarProps {
    setlists?: SetlistInfo[]
    onSelectSetlist?: (id: string) => void
    className?: string
}

/**
 * Monthly planning calendar for band leaders.
 * Shows services with musician assignment overlays.
 */
export function SchedulingCalendar({ setlists = [], onSelectSetlist, className }: SchedulingCalendarProps) {
    const { user, isBandLeader } = useAuth()
    const router = useRouter()
    const config = useCongregation()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [assignments, setAssignments] = useState<SchedulingAssignment[]>([])
    const [blockouts, setBlockouts] = useState<MusicianBlockout[]>([])
    const [loading, setLoading] = useState(true)

    // Subscribe to all assignments and blockouts
    useEffect(() => {
        if (!user || !isBandLeader) return
        setLoading(true)

        let assignmentsLoaded = false
        let blockoutsLoaded = false

        const checkLoaded = () => {
            if (assignmentsLoaded && blockoutsLoaded) setLoading(false)
        }

        const unsubAssignments = subscribeToAllUpcomingAssignments((data) => {
            setAssignments(data)
            assignmentsLoaded = true
            checkLoaded()
        })

        const unsubBlockouts = subscribeToAllBlockouts((data) => {
            setBlockouts(data)
            blockoutsLoaded = true
            checkLoaded()
        })

        return () => {
            unsubAssignments()
            unsubBlockouts()
        }
    }, [user, isBandLeader])

    const { days, monthLabel, year, month } = useMemo(() => {
        const y = currentDate.getFullYear()
        const m = currentDate.getMonth()
        const firstDay = new Date(y, m, 1)
        const lastDay = new Date(y, m + 1, 0)
        const startDow = firstDay.getDay()
        const totalDays = lastDay.getDate()

        const arr: (Date | null)[] = []
        for (let i = 0; i < startDow; i++) arr.push(null)
        for (let i = 1; i <= totalDays; i++) arr.push(new Date(y, m, i))

        return {
            days: arr,
            monthLabel: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            year: y,
            month: m,
        }
    }, [currentDate])

    function dateStr(date: Date): string {
        return date.toISOString().split('T')[0]
    }

    function getSetlistsForDate(date: Date): SetlistInfo[] {
        const ds = dateStr(date)
        return setlists.filter(s => {
            if (!s.eventDate) return false
            let sDate: string
            if (typeof s.eventDate === 'string') {
                sDate = s.eventDate.split('T')[0]
            } else if (s.eventDate && typeof s.eventDate === 'object' && 'seconds' in (s.eventDate as any)) {
                sDate = new Date((s.eventDate as any).seconds * 1000).toISOString().split('T')[0]
            } else {
                return false
            }
            return sDate === ds
        })
    }

    function getAssignmentsForSetlist(setlistId: string): SchedulingAssignment[] {
        return assignments.filter(a => a.setlistId === setlistId)
    }

    function getCoverageStatus(setlistAssignments: SchedulingAssignment[]): 'full' | 'partial' | 'empty' {
        if (setlistAssignments.length === 0) return 'empty'
        const confirmed = setlistAssignments.filter(a => a.status === 'confirmed').length
        const pending = setlistAssignments.filter(a => a.status === 'pending').length
        if (confirmed >= 2 && pending === 0) return 'full'
        if (confirmed > 0 || pending > 0) return 'partial'
        return 'empty'
    }

    function getBlockedCount(date: Date): number {
        const ds = dateStr(date)
        const blockedUids = new Set<string>()
        for (const b of blockouts) {
            if (ds >= b.startDate && ds <= b.endDate) {
                blockedUids.add(b.musicianUid)
            }
        }
        return blockedUids.size
    }

    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))

    return (
        <div className={cn("flex flex-col glass-card rounded-xl overflow-hidden", className)}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/50">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
                        <CalendarIcon className="h-4.5 w-4.5 text-brand" />
                    </div>
                    {monthLabel}
                </h2>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 rounded-lg fluid-interaction">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 rounded-lg fluid-interaction">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-border/40 text-xs text-muted-foreground bg-muted/20">
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" /> Fully staffed
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-500/20" /> Needs attention
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 ring-2 ring-red-500/20" /> No musicians
                </span>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-brand/60" />
                    <p className="text-xs text-muted-foreground">Loading schedule...</p>
                </div>
            ) : (
                <>
                    {/* Day headers */}
                    <div className="grid grid-cols-7 bg-muted/50 border-b border-border/40">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                            <div key={day} className={cn(
                                "p-2 text-xs font-semibold text-center",
                                (i === 5 || i === 6) ? 'text-brand' : 'text-muted-foreground'
                            )}>
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 auto-rows-fr">
                        {days.map((date, i) => {
                            if (!date) {
                                return <div key={`empty-${i}`} className="min-h-[100px] bg-background/20 border-b border-r border-border/20" />
                            }

                            const ds = dateStr(date)
                            const isToday = dateStr(new Date()) === ds
                            const isFriday = date.getDay() === 5
                            const isSaturday = date.getDay() === 6
                            const daySetlists = getSetlistsForDate(date)
                            const blockedCount = getBlockedCount(date)

                            return (
                                <div
                                    key={ds}
                                    className={cn(
                                        "min-h-[100px] p-1.5 border-b border-r border-border/20 group transition-all duration-200",
                                        isToday && "bg-brand/5 ring-1 ring-inset ring-brand/10",
                                        (isFriday || isSaturday) && !isToday && "bg-brand/[0.02]",
                                        "hover:bg-accent/30",
                                    )}
                                >
                                    {/* Date header */}
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={cn(
                                            "text-xs font-medium h-6 w-6 flex items-center justify-center rounded-full transition-all duration-200",
                                            isToday ? "bg-brand text-brand-foreground shadow-sm shadow-brand/30" : "text-muted-foreground",
                                        )}>
                                            {date.getDate()}
                                        </span>
                                        {blockedCount > 0 && (
                                            <span className="text-[10px] text-red-500 flex items-center gap-0.5 bg-red-500/10 px-1 py-0.5 rounded-full" title={`${blockedCount} musician(s) unavailable`}>
                                                <AlertCircle className="h-2.5 w-2.5" />
                                                {blockedCount}
                                            </span>
                                        )}
                                    </div>

                                    {/* Setlists with assignment status */}
                                    <div className="space-y-1">
                                        {daySetlists.map(setlist => {
                                            const setlistAssignments = getAssignmentsForSetlist(setlist.id)
                                            const coverage = getCoverageStatus(setlistAssignments)
                                            const confirmed = setlistAssignments.filter(a => a.status === 'confirmed').length
                                            const pending = setlistAssignments.filter(a => a.status === 'pending').length

                                            return (
                                                <button
                                                    key={setlist.id}
                                                    onClick={() => {
                                                        if (onSelectSetlist) onSelectSetlist(setlist.id)
                                                        else router.push(`/setlists/${setlist.id}`)
                                                    }}
                                                    className={cn(
                                                        "w-full text-left p-1.5 rounded-lg text-[11px] border transition-all duration-200 active:scale-[0.97]",
                                                        coverage === 'full' && "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40",
                                                        coverage === 'partial' && "bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/40",
                                                        coverage === 'empty' && "bg-red-500/10 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/40",
                                                    )}
                                                >
                                                    <p className="font-medium truncate text-foreground">{setlist.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                                                        <Users className="h-2.5 w-2.5" />
                                                        {confirmed > 0 && (
                                                            <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                                                                <CheckCircle2 className="h-2.5 w-2.5" />
                                                                {confirmed}
                                                            </span>
                                                        )}
                                                        {pending > 0 && (
                                                            <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                                                                <Clock className="h-2.5 w-2.5" />
                                                                {pending}
                                                            </span>
                                                        )}
                                                        {setlistAssignments.length === 0 && (
                                                            <span className="text-red-500 italic">none</span>
                                                        )}
                                                    </div>
                                                </button>
                                            )
                                        })}

                                        {/* Add setlist prompt for Shabbat dates with no setlists */}
                                        {daySetlists.length === 0 && (isFriday || isSaturday) && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <button
                                                    onClick={() => router.push(`/setlists`)}
                                                    className="w-full text-left p-1 rounded-md text-[10px] text-muted-foreground/40 hover:text-muted-foreground border border-dashed border-border/40 hover:border-brand/30 hover:bg-brand/5 flex items-center gap-1 transition-all duration-200"
                                                >
                                                    <Plus className="h-2.5 w-2.5" />
                                                    {isSaturday ? 'Shabbat AM' : 'Friday Eve'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}
