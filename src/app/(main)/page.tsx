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
import { Music2 } from "lucide-react"
import { useChatStore } from "@/lib/chat-store"
import { useMusicStore } from "@/lib/store"
import { buildPerformQueue } from "@/lib/queue-utils"
import { useCongregation } from "@/lib/congregation-context"
import { useUpcomingPrep } from "@/hooks/use-upcoming-prep"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { HeroCard, CommandRow, UpcomingTimeline, CompactSetlistRow } from "@/components/dashboard"
import { cn } from "@/lib/utils"

export default function DashboardPage() {
    const router = useRouter()
    const { user, profile, signIn, isMember, isLeader } = useAuth()
    const { loadLibrary } = useLibraryStore()
    const congregation = useCongregation()
    const { open: openChat } = useChatStore()
    const { setQueue } = useMusicStore()

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
    }, [user?.uid, user?.displayName])

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

        if (user?.uid) {
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

            if (!user?.uid) setUpcomingSetlists(upcoming.slice(0, 5))
        })

        return () => { unsubPersonal?.(); unsubPublic?.() }
    }, [setlistService, user?.uid])

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
                                    onPerform={() => {
                                        const result = buildPerformQueue(tonightSetlist.tracks || [])
                                        if (result) {
                                            setQueue(result.queue, result.startIndex, `/setlists/${tonightSetlist.id}`, tonightSetlist.id!)
                                            router.push(`/perform/${result.firstFileId}`)
                                        } else {
                                            // Fallback: no playable tracks, just open the setlist
                                            router.push(`/setlists/${tonightSetlist.id}`)
                                        }
                                    }}
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
                    <div className={cn("bg-card rounded-2xl p-5 text-center space-y-4 border border-border", stagger(4))}>
                        <QRSignIn />
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">or</span>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <Button
                            onClick={signIn}
                            className="w-full h-11 rounded-xl font-semibold bg-primary text-primary-foreground hover:opacity-90"
                        >
                            Sign In with Google
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
