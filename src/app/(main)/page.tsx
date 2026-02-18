"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { useLibraryStore } from "@/lib/library-store"
import { getContextualGreeting } from "@/lib/greeting"
import { toDate } from "@/lib/firestore-helpers"
import { PendingAccountIllustration } from "@/components/ui/illustrations"
import { Button } from "@/components/ui/button"
import {
    FileMusic,
    ListMusic,
    PlayCircle,
    Plus,
    Sparkles,
    ArrowRight,
    Music2,
    ChevronRight,
    CheckCircle2,
    Circle,
    Clock,
} from "lucide-react"
import { useChatStore } from "@/lib/chat-store"
import { useCongregation } from "@/lib/congregation-context"
import { useUpcomingPrep, type UpcomingSetlistWithPrep } from "@/hooks/use-upcoming-prep"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
    const router = useRouter()
    const { user, profile, signIn, isMember, isLeader } = useAuth()
    const { loadLibrary } = useLibraryStore()
    const congregation = useCongregation()
    const { open: openChat } = useChatStore()

    const [upcomingSetlists, setUpcomingSetlists] = useState<Setlist[]>([])
    const [recentPublicSetlists, setRecentPublicSetlists] = useState<Setlist[]>([])

    // Cold-launch detection: animate only on first mount per session
    const [shouldAnimate, setShouldAnimate] = useState(false)
    useEffect(() => {
        try {
            const key = 'dash-visited'
            if (!sessionStorage.getItem(key)) {
                setShouldAnimate(true)
                sessionStorage.setItem(key, '1')
            }
        } catch { /* SSR or private mode */ }
    }, [])

    // Greeting
    const greeting = useMemo(() => {
        const firstName = user?.displayName?.split(' ')[0] || null
        return getContextualGreeting(firstName, undefined, congregation.shortName)
    }, [user?.displayName, congregation.shortName])

    // Prep data for upcoming setlists (members only)
    const { items: upcomingWithPrep, hasData: hasWeekData } = useUpcomingPrep()

    // Setlist Service for primary upcoming/recent fetching
    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user])

    // Fetch upcoming setlists (personal or public)
    useEffect(() => {
        if (!setlistService) return

        let unsubPersonal: (() => void) | null = null
        let unsubPublic: (() => void) | null = null

        const now = new Date()
        now.setHours(0, 0, 0, 0)

        const filterUpcoming = (setlists: Setlist[]) => {
            return setlists.filter(s => {
                if (!s.eventDate) return false
                const d = toDate(s.eventDate)
                if (!d) return false
                d.setHours(0, 0, 0, 0)
                return d >= now
            }).sort((a, b) => {
                const da = toDate(a.eventDate)
                const db = toDate(b.eventDate)
                return (da?.getTime() || 0) - (db?.getTime() || 0)
            })
        }

        if (user) {
            unsubPersonal = setlistService.subscribeToPersonalSetlists((setlists) => {
                setUpcomingSetlists(filterUpcoming(setlists).slice(0, 5))
            })
        }

        unsubPublic = setlistService.subscribeToPublicSetlists((setlists) => {
            const upcoming = filterUpcoming(setlists)
            const recent = setlists
                .filter(s => s.eventDate)
                .sort((a, b) => (toDate(b.eventDate)?.getTime() || 0) - (toDate(a.eventDate)?.getTime() || 0))
                .slice(0, 5)
            setRecentPublicSetlists(recent)

            if (!user) setUpcomingSetlists(upcoming.slice(0, 5))
        })

        return () => { unsubPersonal?.(); unsubPublic?.() }
    }, [setlistService, user])

    useEffect(() => { loadLibrary() }, [loadLibrary])

    const tonightSetlist = upcomingSetlists[0]
    const additionalUpcoming = upcomingSetlists.slice(1)

    // Find prep data for tonight's setlist
    const tonightPrep = useMemo(() => {
        if (!tonightSetlist) return null
        return upcomingWithPrep.find(u => u.setlist.id === tonightSetlist.id) || null
    }, [tonightSetlist, upcomingWithPrep])

    // Atmosphere gradient classes
    const atmosphereClasses = useMemo(() => {
        switch (greeting.atmosphere) {
            case 'shabbat':
                return 'from-amber-500/8 via-orange-500/5 to-transparent dark:from-amber-500/10 dark:via-orange-900/8 dark:to-transparent'
            case 'holiday':
                return 'from-yellow-500/8 via-amber-500/5 to-transparent dark:from-yellow-500/10 dark:via-amber-900/8 dark:to-transparent'
            case 'morning':
                return 'from-sky-500/5 via-blue-500/3 to-transparent dark:from-sky-900/10 dark:via-blue-900/5 dark:to-transparent'
            case 'evening':
                return 'from-indigo-500/5 via-violet-500/3 to-transparent dark:from-indigo-900/10 dark:via-violet-900/5 dark:to-transparent'
            default:
                return 'from-slate-500/3 to-transparent dark:from-slate-800/10 dark:to-transparent'
        }
    }, [greeting.atmosphere])

    const stagger = (n: number) =>
        shouldAnimate ? `dash-stagger dash-stagger-${n}` : ''

    const navigateToSetlist = (s: Setlist) => {
        router.push(`/setlists/${s.id}${s.isPublic && !user ? '?public=true' : ''}`)
    }

    // Timeline items exclude the hero setlist to avoid duplication
    const timelineItems = useMemo(() => {
        if (!tonightSetlist) return upcomingWithPrep
        return upcomingWithPrep.filter(u => u.setlist.id !== tonightSetlist.id)
    }, [upcomingWithPrep, tonightSetlist])

    return (
        <div className={cn("flex flex-col w-full pb-28", !shouldAnimate && "dash-no-animate")}>

            {/* ══════════════════════════════════════════
                ATMOSPHERIC HERO ZONE
                Always renders instantly (no animation)
               ══════════════════════════════════════════ */}
            <div className={`bg-gradient-to-b ${atmosphereClasses} px-4 md:px-6 pt-4 pb-6`}>
                <div className="max-w-2xl mx-auto w-full">

                    {/* Branding */}
                    <div className="flex items-center gap-2.5 mb-5">
                        <img
                            src="/logo.jpg"
                            alt={congregation.shortName}
                            className="w-8 h-8 rounded-full border border-border/50"
                        />
                        <span className="text-xs font-semibold text-muted-foreground/70 tracking-wider uppercase">
                            {congregation.shortName}
                        </span>
                    </div>

                    {/* Greeting */}
                    <div className="mb-5">
                        <h1 className={cn(
                            "text-[26px] font-bold tracking-tight leading-tight",
                            greeting.isSpecial
                                ? "bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text"
                                : "text-foreground"
                        )}>
                            {greeting.text}
                            {greeting.isSpecial && (
                                <span className="inline-block ml-2 text-lg align-middle opacity-80">
                                    {greeting.atmosphere === 'shabbat' ? '✨' : '🎉'}
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground/80 mt-1 font-medium tracking-wide">
                            {greeting.hebrewDate.split(' ').map((part, i, arr) => (
                                <span key={i}>
                                    {part}
                                    {i < arr.length - 1 && (i === arr.length - 2
                                        ? <span className="mx-1.5 text-muted-foreground/40">·</span>
                                        : ' '
                                    )}
                                </span>
                            ))}
                        </p>
                    </div>

                    {/* Desktop: two-column layout */}
                    <div className="flex flex-col md:flex-row md:gap-6">

                        {/* Left column: hero card + command row */}
                        <div className="flex-1 min-w-0 flex flex-col gap-4">
                            {/* Hero: Tonight's Setlist */}
                            {tonightSetlist && (
                                <HeroCard
                                    setlist={tonightSetlist}
                                    prep={tonightPrep}
                                    onClick={() => navigateToSetlist(tonightSetlist)}
                                />
                            )}

                            {/* No upcoming → show recent or empty */}
                            {!tonightSetlist && (
                                <div className="text-center py-4">
                                    {recentPublicSetlists.length > 0 ? (
                                        <p className="text-sm text-muted-foreground">No upcoming services this week</p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No setlists yet</p>
                                    )}
                                </div>
                            )}

                            {/* Command Row */}
                            <CommandRow
                                isMember={isMember}
                                isLeader={isLeader}
                                isLoggedIn={!!user}
                                onLibrary={() => router.push('/library')}
                                onSetlists={() => router.push('/setlists')}
                                onNewSetlist={() => router.push('/setlists/new')}
                                onAI={() => openChat()}
                                className={stagger(1)}
                                hasAI={congregation.features.ai}
                            />
                        </div>

                        {/* Right column (desktop only): Upcoming timeline */}
                        {hasWeekData && timelineItems.length > 0 && (
                            <div className={cn(
                                "hidden md:block w-80 shrink-0",
                                stagger(2)
                            )}>
                                <UpcomingTimeline
                                    items={timelineItems}
                                    onSelect={(s) => navigateToSetlist(s)}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════
                BELOW HERO — content area
               ══════════════════════════════════════════ */}
            <div className="flex flex-col gap-6 px-4 md:px-6 pt-6 max-w-2xl mx-auto w-full">

                {/* ── Onboarding: Pending User ── */}
                {user && profile?.role === "pending" && (
                    <div className={cn("bg-card border border-border rounded-2xl p-6 space-y-4", stagger(2))}>
                        <div className="flex flex-col items-center text-center gap-3">
                            <PendingAccountIllustration className="w-20 h-20 text-muted-foreground" />
                            <div>
                                <h2 className="text-lg font-semibold">Welcome to {congregation.shortName}!</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Your account is being reviewed. An admin will approve you shortly.
                                </p>
                            </div>
                        </div>
                        <Button onClick={() => router.push("/settings")} variant="outline" className="w-full gap-2">
                            <Music2 className="w-4 h-4" />
                            Set Up My Instrument
                        </Button>
                    </div>
                )}

                {/* ── Onboarding: First-time approved ── */}
                {user && isMember && profile && !profile.musicianProfile?.instrument && !profile.viewedWelcomeModal && (
                    <div className={cn("bg-card border-2 border-violet-500/30 rounded-2xl p-6 space-y-4", stagger(2))}>
                        <div className="text-center">
                            <span className="text-2xl">🎉</span>
                            <h2 className="text-lg font-semibold mt-2">You&apos;re approved!</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Set up your instrument to get transposed charts and personalized gig packets.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => router.push("/settings")} className="flex-1 gap-2">
                                <Music2 className="w-4 h-4" />
                                Set Up Instrument
                            </Button>
                            <Button
                                variant="ghost"
                                className="text-muted-foreground"
                                onClick={async () => {
                                    if (user) {
                                        const { doc, updateDoc } = await import("firebase/firestore")
                                        const { db } = await import("@/lib/firebase")
                                        await updateDoc(doc(db, "users", user.uid), { viewedWelcomeModal: true })
                                    }
                                }}
                            >
                                Skip
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── Upcoming Timeline (mobile) ── */}
                {hasWeekData && timelineItems.length > 0 && (
                    <div className={cn("md:hidden", stagger(3))}>
                        <UpcomingTimeline
                            items={timelineItems}
                            onSelect={(s) => navigateToSetlist(s)}
                        />
                    </div>
                )}

                {/* ── Additional upcoming (non-prep-tracked, e.g. personal setlists not in Your Week) ── */}
                {additionalUpcoming.length > 0 && !hasWeekData && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Coming Up
                        </h2>
                        {additionalUpcoming.slice(0, 3).map(s => (
                            <CompactSetlistRow
                                key={s.id}
                                setlist={s}
                                onClick={() => navigateToSetlist(s)}
                            />
                        ))}
                    </div>
                )}

                {/* ── Recent Public Setlists (fallback when no upcoming) ── */}
                {!tonightSetlist && recentPublicSetlists.length > 0 && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Recent Setlists
                        </h2>
                        {recentPublicSetlists.slice(0, 4).map(s => (
                            <CompactSetlistRow
                                key={s.id}
                                setlist={s}
                                onClick={() => navigateToSetlist(s)}
                            />
                        ))}
                    </div>
                )}

                {/* ── Guest Sign-In ── */}
                {!user && (
                    <div className={cn("bg-card rounded-2xl p-5 text-center space-y-3 border border-border", stagger(4))}>
                        <p className="text-muted-foreground text-sm">
                            Sign in to access the full library, create setlists, and use AI tools.
                        </p>
                        <Button
                            onClick={signIn}
                            className="w-full h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90"
                        >
                            Sign In
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}


/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */


/**
 * Hero card — the next imminent setlist with integrated prep progress.
 * Always renders instantly (no stagger delay) for gig-load speed.
 */
function HeroCard({
    setlist,
    prep,
    onClick,
}: {
    setlist: Setlist
    prep: UpcomingSetlistWithPrep | null
    onClick: () => void
}) {
    const [countdown, setCountdown] = useState<string | null>(null)
    const eventDate = toDate(setlist.eventDate)

    // Live countdown when event is within 4 hours
    useEffect(() => {
        if (!eventDate) return

        const update = () => {
            const msLeft = eventDate.getTime() - Date.now()
            if (msLeft <= 0) { setCountdown(null); return }
            if (msLeft > 4 * 60 * 60 * 1000) { setCountdown(null); return }

            const h = Math.floor(msLeft / (1000 * 60 * 60))
            const m = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60))
            setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m`)
        }

        update()
        const iv = setInterval(update, 60_000)
        return () => clearInterval(iv)
    }, [eventDate])

    const urgencyLabel = prep?.urgencyLabel || (() => {
        if (!eventDate) return 'Upcoming'
        const now = new Date()
        const d = new Date(eventDate)
        now.setHours(0, 0, 0, 0)
        d.setHours(0, 0, 0, 0)
        const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        if (diff <= 0) return 'Today'
        if (diff === 1) return 'Tomorrow'
        return eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    })()

    const isImminent = countdown !== null
    const trackCount = setlist.tracks?.length || 0
    const prepData = prep?.prep

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full text-left rounded-2xl p-5 shadow-lg active:scale-[0.98] transition-all group border relative overflow-hidden",
                isImminent
                    ? "bg-gradient-to-br from-violet-600 to-indigo-700 border-white/15 shadow-violet-500/20"
                    : "bg-gradient-to-br from-indigo-600/90 to-violet-600/90 border-white/10"
            )}
        >
            {/* Urgency badge */}
            <div className="flex items-start justify-between mb-3">
                <span className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                    isImminent
                        ? "bg-white/25 text-white backdrop-blur-sm"
                        : "bg-white/15 text-white/90 backdrop-blur-sm"
                )}>
                    {isImminent ? (
                        <>
                            <Clock className="w-3 h-3" />
                            Starts in {countdown}
                        </>
                    ) : (
                        <>
                            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                            {urgencyLabel}
                        </>
                    )}
                </span>
                <span className="text-white/50 text-xs font-medium">
                    {trackCount} song{trackCount !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-white leading-snug mb-4">
                {setlist.name}
            </h3>

            {/* Prep progress bar (when available) */}
            {prepData && prepData.total > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                        <span>{prepData.viewed}/{prepData.total} charts reviewed</span>
                        <span className="font-semibold text-white/90">{prepData.percent}%</span>
                    </div>
                    <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                        <div
                            className={cn(
                                "h-full rounded-full transition-all duration-500",
                                prepData.percent === 100 ? "bg-green-400" : "bg-white/70"
                            )}
                            style={{ width: `${prepData.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* CTA */}
            <div className="flex items-center gap-2 text-white text-sm font-semibold group-hover:text-white transition-colors">
                <PlayCircle className="w-5 h-5" />
                Open Setlist
                <ArrowRight className="w-4 h-4 ml-auto opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
        </button>
    )
}


/**
 * Compact horizontal command row — always above the fold.
 */
function CommandRow({
    isMember,
    isLeader,
    isLoggedIn,
    onLibrary,
    onSetlists,
    onNewSetlist,
    onAI,
    hasAI,
    className,
}: {
    isMember: boolean
    isLeader: boolean
    isLoggedIn: boolean
    onLibrary: () => void
    onSetlists: () => void
    onNewSetlist: () => void
    onAI: () => void
    hasAI: boolean
    className?: string
}) {
    if (!isLoggedIn && !isMember) return null

    const actions: { icon: typeof FileMusic; label: string; onClick: () => void; color: string }[] = []

    actions.push({ icon: FileMusic, label: 'Library', onClick: onLibrary, color: 'text-blue-500 bg-blue-500/10' })
    actions.push({ icon: ListMusic, label: 'Setlists', onClick: onSetlists, color: 'text-emerald-500 bg-emerald-500/10' })

    if (hasAI && isMember) {
        actions.push({ icon: Sparkles, label: 'Ask AI', onClick: onAI, color: 'text-violet-500 bg-violet-500/10' })
    }

    if (isLeader) {
        actions.push({ icon: Plus, label: 'New', onClick: onNewSetlist, color: 'text-amber-500 bg-amber-500/10' })
    }

    return (
        <div className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}>
            {actions.map(({ icon: Icon, label, onClick, color }) => (
                <button
                    key={label}
                    onClick={onClick}
                    className="flex items-center justify-center gap-2 py-3 px-2 bg-card hover:bg-accent rounded-xl transition-all active:scale-95 border border-border group"
                >
                    <div className={cn("p-1.5 rounded-lg", color)}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
                        {label}
                    </span>
                </button>
            ))}
        </div>
    )
}


/**
 * Upcoming timeline with day groupings and inline progress bars.
 */
function UpcomingTimeline({
    items,
    onSelect,
}: {
    items: UpcomingSetlistWithPrep[]
    onSelect: (s: Setlist) => void
}) {
    // Group by day
    const grouped = useMemo(() => {
        const groups: { label: string; key: string; items: UpcomingSetlistWithPrep[] }[] = []
        const seen = new Map<string, UpcomingSetlistWithPrep[]>()

        for (const item of items) {
            const eventDate = toDate(item.setlist.eventDate)
            if (!eventDate) continue

            const now = new Date()
            now.setHours(0, 0, 0, 0)
            const d = new Date(eventDate)
            d.setHours(0, 0, 0, 0)
            const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

            let label: string
            if (diff <= 0) label = 'Today'
            else if (diff === 1) label = 'Tomorrow'
            else label = eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()

            const key = d.toISOString().split('T')[0]
            if (!seen.has(key)) {
                seen.set(key, [])
                groups.push({ label, key, items: seen.get(key)! })
            }
            seen.get(key)!.push(item)
        }

        return groups
    }, [items])

    const [expanded, setExpanded] = useState<string | null>(null)

    if (grouped.length === 0) return null

    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Coming Up
            </h2>

            <div className="flex flex-col gap-3">
                {grouped.map((group) => (
                    <div key={group.key}>
                        {/* Day label */}
                        <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mb-1.5 pl-1">
                            {group.label}
                        </div>

                        {/* Setlists in this day */}
                        <div className="flex flex-col gap-1.5">
                            {group.items.map((item) => {
                                const { setlist: s, prep, isNew } = item
                                const isToday = group.label === 'Today'
                                const isExp = expanded === s.id

                                return (
                                    <div key={s.id} className="bg-card border border-border rounded-xl overflow-hidden">
                                        <button
                                            onClick={() => onSelect(s)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 transition-colors text-left"
                                        >
                                            {/* Status dot */}
                                            <div className={cn(
                                                "w-2 h-2 rounded-full shrink-0",
                                                isToday ? "bg-violet-500" : "bg-muted-foreground/25"
                                            )} />

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-foreground truncate flex items-center gap-1.5">
                                                    {s.name}
                                                    {isNew && (
                                                        <span className="text-[9px] font-bold bg-blue-500/15 text-blue-500 px-1.5 py-0.5 rounded-full shrink-0">
                                                            Updated
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Progress bar */}
                                                {prep.total > 0 && (
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full dash-progress-bar",
                                                                    prep.percent === 100 ? "bg-green-500" : "bg-violet-500"
                                                                )}
                                                                style={{ width: `${prep.percent}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground font-medium w-8 text-right">
                                                            {prep.viewed}/{prep.total}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Expand toggle */}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setExpanded(isExp ? null : s.id!) }}
                                                className="p-1 rounded-lg hover:bg-accent text-muted-foreground/50 shrink-0"
                                            >
                                                <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isExp && "rotate-90")} />
                                            </button>
                                        </button>

                                        {/* Expanded track list */}
                                        {isExp && (
                                            <ExpandedTrackList setlist={s} viewedFileIds={item.viewedFileIds} />
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}


/**
 * Expanded track list inside a timeline card.
 */
function ExpandedTrackList({ setlist, viewedFileIds }: { setlist: Setlist; viewedFileIds: Set<string> }) {
    const tracks = (setlist.tracks || []).filter(t => t.type !== 'header')

    return (
        <div className="border-t border-border px-3 py-2 space-y-0.5 bg-muted/20">
            {tracks.map((track, i) => {
                const viewed = track.fileId ? viewedFileIds.has(track.fileId) : false
                return (
                    <div key={`${track.fileId}-${i}`} className="flex items-center gap-2 py-1 text-xs">
                        {track.fileId ? (
                            viewed ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                            ) : (
                                <Circle className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                            )
                        ) : (
                            <span className="w-3 h-3 shrink-0" />
                        )}
                        <span className={cn("truncate", viewed ? "text-muted-foreground" : "text-foreground")}>
                            {track.title}
                        </span>
                        {track.key && (
                            <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto shrink-0">
                                {track.key}
                            </span>
                        )}
                    </div>
                )
            })}
        </div>
    )
}


/**
 * Compact setlist row for non-prep-tracked lists.
 */
function CompactSetlistRow({ setlist, onClick }: { setlist: Setlist; onClick: () => void }) {
    const eventDate = toDate(setlist.eventDate)
    const dateStr = eventDate
        ? eventDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        : ''

    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 bg-card hover:bg-accent rounded-xl px-3 py-2.5 transition-colors text-left group border border-border"
        >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Music2 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">{setlist.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {dateStr && <span>{dateStr}</span>}
                    <span>{setlist.tracks?.length || 0} songs</span>
                </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
        </button>
    )
}
