"use client"

import { useState, useMemo } from "react"
import { Setlist } from "@/lib/setlist-firebase"
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CalendarViewProps {
    setlists: Setlist[]
    onSelectSetlist: (setlist: Setlist) => void
    onCreateSetlist: (date: Date, type?: 'shabbat_morning') => void
}

export function CalendarView({ setlists, onSelectSetlist, onCreateSetlist }: CalendarViewProps) {
    const [currentDate, setCurrentDate] = useState(new Date())

    const { days, monthLabel } = useMemo(() => {
        const year = currentDate.getFullYear()
        const month = currentDate.getMonth()

        const firstDayOfMonth = new Date(year, month, 1)
        const lastDayOfMonth = new Date(year, month + 1, 0)

        const startingDayOfWeek = firstDayOfMonth.getDay() // 0 = Sunday
        const totalDays = lastDayOfMonth.getDate()

        const daysArray = []

        // Pad previous month
        for (let i = 0; i < startingDayOfWeek; i++) {
            daysArray.push(null)
        }

        // Days of current month
        for (let i = 1; i <= totalDays; i++) {
            daysArray.push(new Date(year, month, i))
        }

        return {
            days: daysArray,
            monthLabel: firstDayOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        }
    }, [currentDate])

    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

    // Group setlists by date key (YYYY-MM-DD or similar comparison)
    const getSetlistsForDate = (date: Date) => {
        return setlists.filter(s => {
            if (!s.eventDate) return false
            // Handle Firestore Timestamp or string
            const d = typeof s.eventDate === 'string' ? new Date(s.eventDate) : (s.eventDate as any).toDate()
            return d.getDate() === date.getDate() &&
                d.getMonth() === date.getMonth() &&
                d.getFullYear() === date.getFullYear()
        })
    }

    return (
        <div className="flex flex-col h-full bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <CalendarIcon className="h-5 w-5 text-blue-400" />
                        {monthLabel}
                    </h2>
                    <div className="flex items-center bg-zinc-800 rounded-lg p-1">
                        <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8 hover:bg-zinc-700">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8 hover:bg-zinc-700">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid Header */}
            <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-900/50">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                    <div key={day} className={`p-3 text-sm font-medium text-center ${i === 6 || i === 5 ? 'text-blue-400' : 'text-zinc-500'}`}>
                        {day}
                    </div>
                ))}
            </div>

            {/* Grid Body */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-zinc-900">
                {days.map((date, i) => {
                    if (!date) return <div key={`empty-${i}`} className="bg-zinc-950/30 border-b border-r border-zinc-800 min-h-[120px]" />

                    const daySetlists = getSetlistsForDate(date)
                    const isSaturday = date.getDay() === 6
                    const isFriday = date.getDay() === 5
                    const isToday = new Date().toDateString() === date.toDateString()

                    return (
                        <div key={date.toISOString()} className={`relative p-2 border-b border-r border-zinc-800 min-h-[120px] group transition-colors hover:bg-zinc-800/20 ${isToday ? 'bg-blue-500/5' : ''}`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-sm font-medium h-7 w-7 flex items-center justify-center rounded-full ${isToday ? 'bg-blue-600 text-white' : 'text-zinc-400'}`}>
                                    {date.getDate()}
                                </span>
                                {(isSaturday || isFriday) && (
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-blue-400"
                                        onClick={() => onCreateSetlist(date, isSaturday ? 'shabbat_morning' : undefined)}
                                        title="Add Setlist"
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>

                            <div className="space-y-1">
                                {daySetlists.map(setlist => (
                                    <button
                                        key={setlist.id}
                                        onClick={() => onSelectSetlist(setlist)}
                                        className="w-full text-left p-1.5 rounded-md text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 truncate transition-colors"
                                    >
                                        {setlist.name}
                                    </button>
                                ))}

                                {daySetlists.length === 0 && isSaturday && (
                                    <button
                                        onClick={() => onCreateSetlist(date, 'shabbat_morning')}
                                        className="w-full text-left p-1.5 rounded-md text-xs border border-dashed border-zinc-800 text-zinc-600 hover:text-blue-400 hover:border-blue-400/50 transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Shabbat
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
