"use client"

import { useEffect, useState, useMemo } from "react"
import { CalendarDays, Clock, CheckCircle2, XCircle, Music, ChevronLeft, Ban, LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    subscribeToMyAssignments,
    subscribeToAllUpcomingAssignments,
} from "@/lib/scheduling-firebase"
import { ScheduleCard } from "@/components/scheduling/ScheduleCard"
import { AvailabilityManager } from "@/components/scheduling/AvailabilityManager"
import { SchedulingCalendar } from "@/components/scheduling/SchedulingCalendar"
import type { SchedulingAssignment } from "@/types/models"

type TabId = 'my_schedule' | 'calendar' | 'availability' | 'all'

export default function SchedulePage() {
    const router = useRouter()
    const { user, profile, isBandLeader } = useAuth()
    const [activeTab, setActiveTab] = useState<TabId>('my_schedule')
    const [assignments, setAssignments] = useState<SchedulingAssignment[]>([])
    const [loading, setLoading] = useState(true)

    // Subscribe to assignments based on active tab
    useEffect(() => {
        if (!user) return
        if (activeTab === 'availability' || activeTab === 'calendar') {
            setLoading(false)
            return
        }

        setLoading(true)

        const unsubscribe = activeTab === 'my_schedule'
            ? subscribeToMyAssignments(user.uid, (data) => {
                setAssignments(data)
                setLoading(false)
            })
            : subscribeToAllUpcomingAssignments((data) => {
                setAssignments(data)
                setLoading(false)
            })

        return unsubscribe
    }, [user, activeTab])

    // Group assignments by setlist to show other musicians
    const groupedBySetlist = useMemo(() => {
        const map = new Map<string, SchedulingAssignment[]>()
        for (const a of assignments) {
            const key = a.setlistId
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(a)
        }
        return map
    }, [assignments])

    // For "My Schedule" tab: show just my assignments with other musician context
    const myAssignments = useMemo(() => {
        if (!user) return []
        if (activeTab === 'all') return assignments

        return assignments
            .filter(a => a.musicianUid === user.uid)
            .sort((a, b) => {
                const dateA = getDateMs(a.eventDate)
                const dateB = getDateMs(b.eventDate)
                if (dateA !== dateB) return dateA - dateB
                return 0
            })
    }, [assignments, user, activeTab])

    // For overview mode: group by setlist
    const allBySetlist = useMemo(() => {
        if (activeTab !== 'all') return []
        const setlists = new Map<string, { name: string; eventDate: unknown; assignments: SchedulingAssignment[] }>()

        for (const a of assignments) {
            if (!setlists.has(a.setlistId)) {
                setlists.set(a.setlistId, {
                    name: a.setlistName,
                    eventDate: a.eventDate,
                    assignments: [],
                })
            }
            setlists.get(a.setlistId)!.assignments.push(a)
        }

        return Array.from(setlists.values()).sort((a, b) => {
            const dateA = getDateMs(a.eventDate)
            const dateB = getDateMs(b.eventDate)
            return dateA - dateB
        })
    }, [assignments, activeTab])

    function getOtherMusicians(assignment: SchedulingAssignment) {
        const setlistAssignments = groupedBySetlist.get(assignment.setlistId) || []
        return setlistAssignments
            .filter(a => a.musicianUid !== assignment.musicianUid)
            .map(a => ({
                name: a.musicianName,
                instrument: a.instrument,
                status: a.status,
            }))
    }

    // Stats
    const confirmedCount = assignments.filter(a => a.status === 'confirmed' && (activeTab === 'all' || a.musicianUid === user?.uid)).length
    const pendingCount = assignments.filter(a => a.status === 'pending' && (activeTab === 'all' || a.musicianUid === user?.uid)).length

    if (!user) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <p className="text-muted-foreground">Sign in to view your schedule.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col bg-background text-foreground">
            {/* Header */}
            <div className="h-20 border-b border-border flex items-center px-4 gap-4 shrink-0">
                <Button size="icon" variant="ghost" className="h-12 w-12" onClick={() => router.back()}>
                    <ChevronLeft className="h-8 w-8" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-title">Schedule</h1>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border px-4 overflow-x-auto">
                <div className="flex items-center gap-1 min-w-max">
                    <TabButton
                        active={activeTab === 'my_schedule'}
                        onClick={() => setActiveTab('my_schedule')}
                        icon={<CalendarDays className="h-4 w-4" />}
                        label="My Schedule"
                    />
                    {isBandLeader && (
                        <TabButton
                            active={activeTab === 'calendar'}
                            onClick={() => setActiveTab('calendar')}
                            icon={<LayoutGrid className="h-4 w-4" />}
                            label="Planning"
                        />
                    )}
                    <TabButton
                        active={activeTab === 'availability'}
                        onClick={() => setActiveTab('availability')}
                        icon={<Ban className="h-4 w-4" />}
                        label="Availability"
                    />
                    {isBandLeader && (
                        <TabButton
                            active={activeTab === 'all'}
                            onClick={() => setActiveTab('all')}
                            icon={<Music className="h-4 w-4" />}
                            label="Overview"
                        />
                    )}
                </div>
            </div>

            {/* Stats bar — only for schedule/overview tabs */}
            {!loading && (activeTab === 'my_schedule' || activeTab === 'all') && (
                <div className="flex items-center gap-4 px-6 py-3 text-sm text-muted-foreground border-b border-border/50">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span>{confirmedCount} confirmed</span>
                    </div>
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-amber-500" />
                            <span>{pendingCount} pending</span>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="p-6">
                {activeTab === 'availability' ? (
                    /* Availability Tab — Blockout Calendar */
                    <div className="max-w-lg mx-auto">
                        <AvailabilityManager />
                    </div>
                ) : activeTab === 'calendar' ? (
                    /* Planning Calendar Tab (band leaders only) */
                    <SchedulingCalendar />
                ) : loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-44 rounded-xl bg-card border border-border" />
                        ))}
                    </div>
                ) : activeTab === 'my_schedule' ? (
                    /* My Schedule View */
                    myAssignments.length === 0 ? (
                        <EmptySchedule />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {myAssignments.map(assignment => (
                                <ScheduleCard
                                    key={assignment.id}
                                    assignment={assignment}
                                    otherMusicians={getOtherMusicians(assignment)}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    /* Overview (Band Leader) */
                    allBySetlist.length === 0 ? (
                        <EmptySchedule isOverview />
                    ) : (
                        <div className="space-y-8">
                            {allBySetlist.map(({ name, eventDate, assignments: setlistAssignments }) => (
                                <section key={name + String(eventDate)}>
                                    <h2 className="text-eyebrow mb-3 flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4" />
                                        {name}
                                        <span className="text-muted-foreground font-normal">
                                            — {formatDateShort(eventDate)}
                                        </span>
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {setlistAssignments.map(a => (
                                            <MusicianStatusCard key={a.id} assignment={a} />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    )
}

// ── Sub-components ──

function TabButton({ active, onClick, icon, label }: {
    active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
            )}
        >
            {icon} {label}
        </button>
    )
}

/** Compact card showing a single musician's status in overview mode */
function MusicianStatusCard({ assignment }: { assignment: SchedulingAssignment }) {
    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border bg-card",
            assignment.status === 'confirmed' && "border-emerald-500/20",
            assignment.status === 'pending' && "border-amber-500/20",
            assignment.status === 'declined' && "border-red-500/20 opacity-60",
        )}>
            <div className={cn(
                "w-2 h-2 rounded-full shrink-0",
                assignment.status === 'confirmed' && "bg-emerald-500",
                assignment.status === 'pending' && "bg-amber-500 animate-pulse",
                assignment.status === 'declined' && "bg-red-500",
            )} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{assignment.musicianName}</p>
                {assignment.instrument && (
                    <p className="text-xs text-muted-foreground">{assignment.instrument}</p>
                )}
            </div>
            <span className="text-xs text-muted-foreground capitalize">{assignment.status}</span>
        </div>
    )
}

function EmptySchedule({ isOverview }: { isOverview?: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <CalendarDays className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
                {isOverview ? 'No upcoming assignments' : 'No services scheduled'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
                {isOverview
                    ? 'Assign musicians to setlists using the musician picker in the setlist editor.'
                    : 'When you\'re scheduled for a service, it will appear here. You\'ll receive a notification when assigned.'}
            </p>
        </div>
    )
}

// ── Helpers ──

function getDateMs(eventDate: unknown): number {
    if (!eventDate) return Infinity
    try {
        if (typeof eventDate === 'string') return new Date(eventDate).getTime()
        if (eventDate && typeof eventDate === 'object' && 'seconds' in eventDate) {
            return (eventDate as { seconds: number }).seconds * 1000
        }
        if (eventDate instanceof Date) return eventDate.getTime()
    } catch { }
    return Infinity
}

function formatDateShort(eventDate: unknown): string {
    const ms = getDateMs(eventDate)
    if (ms === Infinity) return 'TBD'
    try {
        return new Date(ms).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
        })
    } catch { return 'TBD' }
}
