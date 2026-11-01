"use client"

import { useEffect, useState, useMemo } from "react"
import { CalendarDays, LayoutGrid, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { cn } from "@/lib/utils"
import { PageContainer, PageHeader } from "@/components/layout/Page"
import { subscribeToAllUpcomingAssignments, subscribeToUpcomingSetlists } from "@/lib/scheduling-firebase"
import { ScheduleCard } from "@/components/scheduling/ScheduleCard"
import { UnifiedCalendar } from "@/components/calendar/UnifiedCalendar"
import type { SchedulingAssignment } from "@/types/models"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import type { T } from "@/i18n/core"
import type { Formatter } from "@/i18n/format"

type ViewMode = 'services' | 'calendar'

export default function SchedulePage() {
    const { user, isBandLeader } = useAuth()
    const orgId = useOrg()
    const t = useT()
    const fmt = useFormat()
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

        const unsubAssignments = subscribeToAllUpcomingAssignments(orgId, (data) => {
            setAssignments(data)
            setLoadingAssignments(false)
        })

        const unsubSetlists = subscribeToUpcomingSetlists(orgId, (data) => {
            setUpcomingSetlists(data)
            setLoadingSetlists(false)
        })

        return () => {
            unsubAssignments()
            unsubSetlists()
        }
    }, [user, viewMode, orgId])

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
                <p className="text-muted-foreground">{t("schedule.signInToView")}</p>
            </div>
        )
    }

    return (
        <PageContainer className="flex flex-col gap-4">
            {/* Consistency pass: the one page head and container. */}
            <PageHeader
                title={t("schedule.title")}
                actions={
                <div className="flex items-center gap-2">
                    {viewMode === 'services' && (
                        <button
                            onClick={() => setMineOnly(!mineOnly)}
                            aria-pressed={mineOnly}
                            className={cn(
                                // v4.3 U07: add visible focus ring that works on both the
                                // brand-tinted active state and the muted inactive state.
                                "flex items-center gap-1.5 min-h-11 px-3.5 rounded-md text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                mineOnly
                                    ? "bg-accent text-foreground border border-brand"
                                    : "bg-card text-muted-foreground border border-border hover:text-foreground"
                            )}
                        >
                            <User className="h-3.5 w-3.5" />
                            {t("schedule.mine")}
                        </button>
                    )}
                    {isBandLeader && (
                        <Button
                            size="icon"
                            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                            aria-label={viewMode === 'calendar' ? t("schedule.switchToList") : t("schedule.switchToCalendar")}
                            className={cn(
                                "h-11 w-11 rounded-md",
                                viewMode === 'calendar' && "bg-accent text-foreground"
                            )}
                            onClick={() => setViewMode(viewMode === 'calendar' ? 'services' : 'calendar')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                    )}
                </div>
                }
            />

            {/* Stats bar */}
            {!loading && viewMode === 'services' && (confirmedCount > 0 || pendingCount > 0) && (
                <div className="tnum flex items-center gap-5 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        <span className="font-medium">{confirmedCount}</span>
                        <span>{t("schedule.confirmedStat", { count: confirmedCount })}</span>
                    </div>
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-caution animate-pulse" />
                            <span className="font-medium">{pendingCount}</span>
                            <span>{t("schedule.pendingStat", { count: pendingCount })}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div>
                {viewMode === 'calendar' ? (
                    <UnifiedCalendar mode="planning" />
                ) : loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-44 rounded-lg bg-card/50 border border-border/40" />
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
                                            {formatDateShort(eventDate, t, fmt)}
                                        </span>
                                    </h2>
                                    {setlistAssignments.length === 0 ? (
                                        <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
                                            <User className="h-4 w-4 shrink-0" />
                                            {t("schedule.noMusiciansAssigned")}
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
        </PageContainer>
    )
}

// ── Sub-components ──

/** Compact card showing a single musician's status */
const STATUS_LABEL = {
    pending: "schedule.statusPending",
    confirmed: "schedule.statusConfirmed",
    declined: "schedule.statusDeclined",
    cancelled: "schedule.statusCancelled",
} as const

function MusicianStatusCard({ assignment }: { assignment: SchedulingAssignment }) {
    const t = useT()
    const statusKey = STATUS_LABEL[assignment.status as keyof typeof STATUS_LABEL]
    return (
        <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border bg-card/70 backdrop-blur-sm transition-all duration-200 hover:shadow-sm",
            assignment.status === 'confirmed' && "border-emerald-500/20 hover:border-emerald-500/40",
            assignment.status === 'pending' && "border-caution/20 hover:border-caution/40",
            assignment.status === 'declined' && "border-red-500/20 opacity-60",
        )}>
            <div className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0 ring-2",
                assignment.status === 'confirmed' && "bg-emerald-500 ring-emerald-500/20",
                assignment.status === 'pending' && "bg-caution ring-caution/20 animate-pulse",
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
                assignment.status === 'pending' && "bg-caution/10 text-caution dark:text-caution",
                assignment.status === 'declined' && "bg-red-500/10 text-red-600 dark:text-red-400",
            )}>{statusKey ? t(statusKey) : assignment.status}</span>
        </div>
    )
}

function EmptySchedule({ mineOnly }: { mineOnly?: boolean }) {
    const t = useT()
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center dash-stagger dash-stagger-0">
            <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center mb-5">
                <CalendarDays className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1.5">
                {mineOnly ? t("schedule.emptyMineTitle") : t("schedule.emptyAllTitle")}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                {mineOnly ? t("schedule.emptyMineBody") : t("schedule.emptyAllBody")}
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

function formatDateShort(eventDate: unknown, t: T, fmt: Formatter): string {
    const ms = getDateMs(eventDate)
    if (ms === Infinity) return t("schedule.dateTbd")
    return fmt.date(ms, {
        weekday: 'short', month: 'short', day: 'numeric',
    }) || t("schedule.dateTbd")
}
