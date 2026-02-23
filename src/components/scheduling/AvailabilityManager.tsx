"use client"

import { useState, useMemo, useEffect } from "react"
import { Calendar, Plus, X, ChevronLeft, ChevronRight, Loader2, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { subscribeToMyBlockouts, createBlockout, deleteBlockout } from "@/lib/scheduling-firebase"
import type { MusicianBlockout } from "@/types/models"
import { toast } from "sonner"

interface AvailabilityManagerProps {
    className?: string
    compact?: boolean
}

/**
 * Calendar interface for musicians to manage their blockout dates.
 * Click/drag to create blockout ranges, view existing blockouts as red overlays.
 */
export function AvailabilityManager({ className, compact }: AvailabilityManagerProps) {
    const { user } = useAuth()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [blockouts, setBlockouts] = useState<MusicianBlockout[]>([])
    const [loading, setLoading] = useState(true)

    // Selection state for creating new blockouts
    const [selecting, setSelecting] = useState(false)
    const [selectionStart, setSelectionStart] = useState<string | null>(null)
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null)
    const [reason, setReason] = useState("")
    const [saving, setSaving] = useState(false)

    // Subscribe to blockouts
    useEffect(() => {
        if (!user) return
        setLoading(true)
        const unsub = subscribeToMyBlockouts(user.uid, (data) => {
            setBlockouts(data)
            setLoading(false)
        })
        return unsub
    }, [user])

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

    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))

    function dateStr(date: Date): string {
        return date.toISOString().split('T')[0]
    }

    function isBlockedDate(date: Date): MusicianBlockout | null {
        const ds = dateStr(date)
        return blockouts.find(b => ds >= b.startDate && ds <= b.endDate) || null
    }

    function isInSelection(date: Date): boolean {
        if (!selectionStart) return false
        const ds = dateStr(date)
        const end = selectionEnd || selectionStart
        const min = selectionStart < end ? selectionStart : end
        const max = selectionStart > end ? selectionStart : end
        return ds >= min && ds <= max
    }

    function handleDayClick(date: Date) {
        const ds = dateStr(date)
        const today = dateStr(new Date())

        // Don't allow blocking past dates
        if (ds < today) return

        // If clicking on an existing blockout, ignore (they can delete from the list)
        if (isBlockedDate(date)) return

        if (!selecting) {
            // Start new selection
            setSelecting(true)
            setSelectionStart(ds)
            setSelectionEnd(ds)
        } else {
            // Complete the selection
            setSelectionEnd(ds)
        }
    }

    function handleDayHover(date: Date) {
        if (selecting && selectionStart) {
            setSelectionEnd(dateStr(date))
        }
    }

    async function handleCreateBlockout() {
        if (!user || !selectionStart) return

        const end = selectionEnd || selectionStart
        const start = selectionStart < end ? selectionStart : end
        const finalEnd = selectionStart > end ? selectionStart : end

        setSaving(true)
        try {
            await createBlockout(user.uid, start, finalEnd, reason || undefined)
            toast.success('Blockout dates saved')
            cancelSelection()
        } catch (e) {
            toast.error('Failed to save blockout dates')
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteBlockout(blockoutId: string) {
        try {
            await deleteBlockout(blockoutId)
            toast.success('Blockout removed')
        } catch (e) {
            toast.error('Failed to remove blockout')
        }
    }

    function cancelSelection() {
        setSelecting(false)
        setSelectionStart(null)
        setSelectionEnd(null)
        setReason("")
    }

    function formatDateRange(start: string, end: string): string {
        const s = new Date(start + 'T12:00:00')
        const e = new Date(end + 'T12:00:00')
        const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
        if (start === end) {
            return s.toLocaleDateString('en-US', opts)
        }
        return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`
    }

    if (loading) {
        return (
            <div className={cn("flex items-center justify-center py-12", className)}>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className={cn("space-y-5", className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className={cn("font-semibold text-foreground flex items-center gap-2", compact ? "text-sm" : "text-base")}>
                    <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <Ban className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    My Blockout Dates
                </h3>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 rounded-lg fluid-interaction">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-semibold text-foreground min-w-[140px] text-center">{monthLabel}</span>
                    <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 rounded-lg fluid-interaction">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
                Click dates when you are <strong className="text-foreground">unavailable</strong>. Band leaders will see these when scheduling.
            </p>

            {/* Calendar Grid */}
            <div className="border border-border/60 rounded-xl overflow-hidden bg-card/70 backdrop-blur-sm shadow-sm">
                <div className="grid grid-cols-7 bg-muted/60">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <div key={`${d}-${i}`} className="p-2 text-xs font-semibold text-center text-muted-foreground">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((date, i) => {
                        if (!date) {
                            return <div key={`empty-${i}`} className="aspect-square bg-background/20 border-t border-r border-border/20" />
                        }

                        const ds = dateStr(date)
                        const today = dateStr(new Date())
                        const isPast = ds < today
                        const isToday = ds === today
                        const blockout = isBlockedDate(date)
                        const inSelection = isInSelection(date)

                        return (
                            <button
                                key={ds}
                                onClick={() => handleDayClick(date)}
                                onMouseEnter={() => handleDayHover(date)}
                                disabled={isPast}
                                className={cn(
                                    "aspect-square flex items-center justify-center text-sm border-t border-r border-border/20 transition-all duration-200 relative",
                                    isPast && "opacity-30 cursor-not-allowed",
                                    isToday && "font-bold",
                                    blockout && "bg-red-500/15 text-red-700 dark:text-red-300 cursor-default",
                                    inSelection && !blockout && "bg-red-500/25 text-red-800 dark:text-red-200",
                                    !isPast && !blockout && !inSelection && "hover:bg-accent/50 cursor-pointer active:scale-95",
                                )}
                            >
                                <span className={cn(
                                    "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
                                    isToday && "bg-brand text-brand-foreground ring-2 ring-brand/20",
                                )}>
                                    {date.getDate()}
                                </span>
                                {blockout && (
                                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Selection confirmation */}
            {selecting && selectionStart && (
                <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 space-y-3 animate-spring">
                    <p className="text-sm font-medium text-foreground">
                        Mark as unavailable: <span className="text-red-600 dark:text-red-400">{formatDateRange(
                            selectionStart < (selectionEnd || selectionStart) ? selectionStart : (selectionEnd || selectionStart),
                            selectionStart > (selectionEnd || selectionStart) ? selectionStart : (selectionEnd || selectionStart),
                        )}</span>
                    </p>
                    <Input
                        placeholder="Reason (optional) -- e.g., vacation, out of town"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="h-9 text-sm rounded-lg"
                    />
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelSelection}
                            className="text-xs rounded-lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleCreateBlockout}
                            disabled={saving}
                            className="text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5 rounded-lg fluid-interaction"
                        >
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                            {saving ? 'Saving...' : 'Block These Dates'}
                        </Button>
                    </div>
                </div>
            )}

            {/* Existing blockouts list */}
            {blockouts.length > 0 && (
                <div className="space-y-2.5">
                    <h4 className="text-eyebrow">Active Blockouts</h4>
                    <div className="space-y-2">
                        {blockouts
                            .filter(b => b.endDate >= dateStr(new Date())) // Only future/current
                            .map(b => (
                                <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl bg-card/70 border border-red-500/15 transition-all duration-200 hover:border-red-500/30 hover:shadow-sm">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/20 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground">
                                            {formatDateRange(b.startDate, b.endDate)}
                                        </p>
                                        {b.reason && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{b.reason}</p>
                                        )}
                                    </div>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 shrink-0 transition-colors duration-200"
                                        onClick={() => handleDeleteBlockout(b.id)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    )
}
