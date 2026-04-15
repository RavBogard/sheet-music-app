"use client"

import { useEffect, useState, useMemo } from "react"
import { CalendarDays, ChevronLeft, LayoutGrid, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { subscribeToAllUpcomingAssignments, subscribeToUpcomingSetlists } from "@/lib/scheduling-firebase"
import { ScheduleCard } from "@/components/scheduling/ScheduleCard"
import { UnifiedCalendar } from "@/components/calendar/UnifiedCalendar"
import type { SchedulingAssignment } from "@/types/models"

type ViewMode = 'services' | 'calendar'

export default function SchedulePage() {
    const router = useRouter()
    const { user, isBandLeader } = useAuth()
    const [viewMode, setViewMode] = useState<ViewMode>('services')
    const [mineOnly, setMineOnly] = useState(false)
    const [assignments, setAssignments] = useState<SchedulingAssignment[]>([])
    const [upcomingSetlists, setUpcomingSetlists] = useState<Array<{ id: string; name: string; eventDate: unknown }>>([])
    const [loadingAssignments, setLoadingAssignments] = useState(true)
    const [loadingSetlists, setLoadingSetlists] = useState(true)
    const loading = loadingAssignments || loadingSetlists

    // Subscribe to both assignments and upcoming setlists
    useEffect(() => {
        if (!user) return
        if (viewMode === 'calendar') {
            setLoadingAssignments(false)
            setLoadingSetlists(false)
            return
        }

        setLoadingAssignments(true)
        setLoadingSetlists(true)

        const unsubAssignments = subscribeToAllUpcomingAssignments((data) => {
            setAssignments(data)
            setLoadingAssignments(false)
        })

        const unsubSetlists = subscribeToUpcomingSetlists((data) => {
            setUpcomingSetlists(data)
            setLoadingSetlists(false)
        })

        return () => {
            unsubAssignments()
            unsubSetlists()
        }
    }, [user, viewMode])

    // Group assignments by setlist
    const groupedBySetlist = useMemo(() => {
        const map = new Map<string, SchedulingAssignment[]>()
        for (const a of assignments) {
            if (!map.has(a.setlistId)) map.set(a.setlistId, [])
            map.get(a.setlistId)!.push(a)
        }
        return map
    }, [assignments])

    // Filtered assignments for "Mine only" mode
    const myAssignments = useMemo(() => {
        if (!user || !mineOnly) return []
        return assignments
            .filter(a => a.musicianUid === user.uid)
            .sort((a, b) => getDateMs(a.eventDate) - getDateMs(b.eventDate))
    }, [assignments, user, mineOnly])

    // All services grouped by setlist (default view) — merges setlists + assignments
    const servicesBySetlist = useMemo(() => {
        if (mineOnly) return []
        const setlists = new Map<string, { id: string; name: string; eventDate: unknown; assignments: SchedulingAssignment[] }>()

        // Start with all upcoming setlists (even those without assignments)
        for (const s of upcomingSetlists) {
            setlists.set(s.id, {
                id: s.id,
                name: s.name,
                eventDate: s.eventDate,
                assignments: [],
            })
        }

        // Layer in assignment data
        for (const a of assignments) {
            if (!setlists.has(a.setlistId)) {
                setlists.set(a.setlistId, {
                    id: a.setlistId,
                    name: a.setlistName,
                    eventDate: a.eventDate,
                    assignments: [],
                })
            }
            setlists.get(a.setlistId)!.assignments.push(a)
        }

        return Array.from(setlists.values()).sort((a, b) =>
            getDateMs(a.eventDate) - getDateMs(b.eventDate)
        )
    }, [assignments, upcomingSetlists, mineOnly])

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

    // Stats based on current filter
    const visibleAssignments = mineOnly
        ? assignments.filter(a => a.musicianUid === user?.uid)
        : assignments
    const confirmedCount = visibleAssignments.filter(a => a.status === 'confirmed').length
    const pendingCount = visibleAssignments.filter(a => a.status === 'pending').length

    if (!user) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <p className="text-muted-foreground">Sign in to view your schedule.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col bg-background text-foreground min-h-screen">
            {/* Header */}
            <div className="h-20 border-b border-border/60 flex items-center px-3 md:px-6 gap-3 md:gap-4 shrink-0 bg-card/50 backdrop-blur-sm">
                <Button size="icon" variant="ghost" aria-label="Back" className="h-10 w-10 rounded-xl fluid-interaction" onClick={() => router.back()}>
                    <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h1 className="text-title">Schedule</h1>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    {viewMode === 'services' && (
                        <button
                            onClick={() => setMineOnly(!mineOnly)}
                            aria-pressed={mineOnly}
                            className={cn(
                                // v4.3 U07: add visible focus ring that works on both the
                                // brand-tinted active state and the muted inactive state.
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                mineOnly
                                    ? "bg-brand/15 text-brand border border-brand/30"
                                    : "bg-muted/50 text-muted-foreground border border-border/40 hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <User className="h-3.5 w-3.5" />
                            Mine
                        </button>
                    )}
                    {isBandLeader && (
                        <Button
                            size="icon"
                            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                            aria-label={viewMode === 'calendar' ? 'Switch to list view' : 'Switch to calendar view'}
                            className={cn(
                                "h-9 w-9 rounded-xl",
                                viewMode === 'calendar' && "bg-brand text-white"
                            )}
                            onClick={() => setViewMode(viewMode === 'calendar' ? 'services' : 'calendar')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats bar */}
            {!loading && viewMode === 'services' && (confirmedCount > 0 || pendingCount > 0) && (
                <div className="flex items-center gap-5 px-3 md:px-6 py-3 text-sm text-muted-foreground border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-medium">{confirmedCount}</span>
                        <span>confirmed</span>
                    </div>
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span className="font-medium">{pendingCount}</span>
                            <span>pending</span>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="p-3 md:p-6">
                {viewMode === 'calendar' ? (
                    <UnifiedCalendar mode="planning" />
                ) : loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-44 rounded-xl bg-card/50 border border-border/40" />
                        ))}
                    </div>
                ) : mineOnly ? (
                    /* My Assignments (filtered) */
                    myAssignments.length === 0 ? (
                        <EmptySchedule mineOnly />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {myAssignments.map((assignment, i) => (
                                <div key={assignment.id} className={`dash-stagger dash-stagger-${Math.min(i, 5)}`}>
                                    <ScheduleCard
                                        assignment={assignment}
                                        otherMusicians={getOtherMusicians(assignment)}
                                    />
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    /* All Services (default) */
                    servicesBySetlist.length === 0 ? (
                        <EmptySchedule />
                    ) : (
                        <div className="space-y-8">
                            {servicesBySetlist.map(({ name, eventDate, assignments: setlistAssignments }, sectionIdx) => (
                                <section key={name + String(eventDate)} className={`dash-stagger dash-stagger-${Math.min(sectionIdx, 5)}`}>
                                    <h2 className="text-eyebrow mb-3 flex items-center gap-2">
                                        <CalendarDays className="h-4 w-4" />
                                        {name}
                                        <span className="text-muted-foreground font-normal normal-case tracking-normal">
                                            {formatDateShort(eventDate)}
                                        </span>
                                    </h2>
                                    {setlistAssignments.length === 0 ? (
                                        <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
                                            <User className="h-4 w-4 shrink-0" />
                                            No musicians assigned yet
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {setlistAssignments.map(a => (
                                                <MusicianStatusCard key={a.id} assignment={a} />
                                            ))}
                                        </div>
                                    )}
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

/** Compact card showing a single musician's status */
function MusicianStatusCard({ assignment }: { assignment: SchedulingAssignment }) {
    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-xl border bg-card/70 backdrop-blur-sm transition-all duration-200 hover:shadow-sm",
            assignment.status === 'confirmed' && "border-emerald-500/20 hover:border-emerald-500/40",
            assignment.status === 'pending' && "border-amber-500/20 hover:border-amber-500/40",
            assignment.status === 'declined' && "border-red-500/20 opacity-60",
        )}>
            <div className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0 ring-2",
                assignment.status === 'confirmed' && "bg-emerald-500 ring-emerald-500/20",
                assignment.status === 'pending' && "bg-amber-500 ring-amber-500/20 animate-pulse",
                assignment.status === 'declined' && "bg-red-500 ring-red-500/20",
            )} />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{assignment.musicianName}</p>
                {assignment.instrument && (
                    <p className="text-xs text-muted-foreground">{assignment.instrument}</p>
                )}
            </div>
            <span className={cn(
                "text-xs font-medium capitalize px-2 py-0.5 rounded-full",
                assignment.status === 'confirmed' && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                assignment.status === 'pending' && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                assignment.status === 'declined' && "bg-red-500/10 text-red-600 dark:text-red-400",
            )}>{assignment.status}</span>
        </div>
    )
}

function EmptySchedule({ mineOnly }: { mineOnly?: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center dash-stagger dash-stagger-0">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1.5">
                {mineOnly ? 'No services scheduled for you' : 'No upcoming services'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                {mineOnly
                    ? 'You haven\'t been assigned to any upcoming services yet. You\'ll receive a notification when assigned.'
                    : 'No upcoming services found. Assign musicians to setlists using the musician picker in the setlist editor.'}
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
