"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { getContextualGreeting, Greeting } from "@/lib/greeting"
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

export interface DashboardServerProps {
    /** Pre-computed greeting from the server (avoids blank flash before JS boots) */
    serverGreeting: Greeting | null
    /** Congregation short name from server (avoids waiting for Firestore) */
    serverShortName: string | null
}

export default function DashboardClient({ serverGreeting: _serverGreeting, serverShortName }: DashboardServerProps) {
    const router = useRouter()
    const { user, profile, cachedUser, signIn, isMember, isBandLeader, loading: authLoading } = useAuth()
    const congregation = useCongregation()
    const { open: openChat } = useChatStore()
    const { setQueue } = useMusicStore()

    const [upcomingSetlists, setUpcomingSetlists] = useState<Setlist[]>([])
    const [recentPublicSetlists, setRecentPublicSetlists] = useState<Setlist[]>([])
    const [personalLoaded, setPersonalLoaded] = useState(false)
    const [publicLoaded, setPublicLoaded] = useState(false)

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

    // Safety timeout: 2s (was 4s). Prevents hanging on slow networks.
    useEffect(() => {
        if (personalLoaded && publicLoaded) return
        const timer = setTimeout(() => {
            setPersonalLoaded(true)
            setPublicLoaded(true)
        }, 2000)
        return () => clearTimeout(timer)
    }, [personalLoaded, publicLoaded])

    // Greeting — use server-rendered value initially, recompute client-side for real-time updates.
    // On the server, this is pre-computed with the user's name from the session cookie.
    // Client-side: recalculated whenever profile changes (e.g., after sign-in).
    const greeting = useMemo(() => {
        const displayName = profile?.displayName || user?.displayName || cachedUser?.displayName
        const firstName = displayName?.split(' ')[0] || null
        const shortName = congregation.shortName || serverShortName || 'CRC Music'
        return getContextualGreeting(firstName, undefined, shortName)
    }, [profile?.displayName, user?.displayName, cachedUser?.displayName, congregation.shortName, serverShortName])

    // Prep data for upcoming setlists (members only)
    const { items: upcomingWithPrep, hasData: hasWeekData } = useUpcomingPrep()

    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user?.uid, user?.displayName])

    const filterUpcoming = useMemo(() => {
        return (setlists: Setlist[]) => {
            const now = new Date()
            now.setHours(0, 0, 0, 0)
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
    }, [])

    // ── PUBLIC setlists: start IMMEDIATELY — no auth gate ──
    // Firestore rules allow anyone to read isPublic === true.
    // This breaks the waterfall: data loads in parallel with auth.
    useEffect(() => {
        if (!setlistService) return
        setPublicLoaded(false)

        const unsub = setlistService.subscribeToPublicSetlists((setlists) => {
            const upcoming = filterUpcoming(setlists)
            const recent = setlists
                .filter(s => s.eventDate)
                .sort((a, b) => (toDate(b.eventDate)?.getTime() || 0) - (toDate(a.eventDate)?.getTime() || 0))
                .slice(0, 5)
            setRecentPublicSetlists(recent)

            if (!user?.uid) setUpcomingSetlists(upcoming.slice(0, 5))
            // Accept data immediately — cache or network, first callback wins
            setPublicLoaded(true)
        })

        return () => unsub()
    }, [setlistService, user?.uid, filterUpcoming])

    // ── PERSONAL setlists: fire after auth resolves ──
    useEffect(() => {
        if (authLoading) return

        if (!user?.uid) {
            setPersonalLoaded(true)
            return
        }

        if (!setlistService) return
        setPersonalLoaded(false)

        const unsub = setlistService.subscribeToPersonalSetlists((setlists) => {
            setUpcomingSetlists(filterUpcoming(setlists).slice(0, 5))
            setPersonalLoaded(true)
        })

        return () => unsub()
    }, [setlistService, user?.uid, authLoading, filterUpcoming])


    // Content is ready once public setlists have loaded.
    // Personal setlists augment later — no need to wait.
    const setlistsReady = publicLoaded
    const tonightSetlist = upcomingSetlists[0]
    const additionalUpcoming = upcomingSetlists.slice(1)

    const tonightPrep = useMemo(() => {
        if (!tonightSetlist) return null
        return upcomingWithPrep.find(u => u.setlist.id === tonightSetlist.id) || null
    }, [tonightSetlist, upcomingWithPrep])

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
        router.push(`/perform/setlist/${s.id}`)
    }

    const timelineItems = useMemo(() => {
        if (!tonightSetlist) return upcomingWithPrep
        return upcomingWithPrep.filter(u => u.setlist.id !== tonightSetlist.id)
    }, [upcomingWithPrep, tonightSetlist])

    return (
        <div className={cn("flex flex-col w-full pb-28", !shouldAnimate && "dash-no-animate")}>

            {/* ══════════════════════════════════════════
                ATMOSPHERIC HERO ZONE — renders immediately,
                no data dependency. Greeting is computed client-side.
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

                            {/* Hero: skeleton → setlist card → empty state */}
                            {!setlistsReady ? (
                                /* Skeleton card while loading */
                                <div className="rounded-2xl border border-border/50 bg-card/50 p-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-muted-foreground/15 animate-pulse" />
                                        <div className="h-3 w-20 bg-muted-foreground/10 rounded animate-pulse" />
                                    </div>
                                    <div className="h-5 w-52 bg-muted-foreground/15 rounded animate-pulse" />
                                    <div className="h-3 w-32 bg-muted-foreground/10 rounded animate-pulse" />
                                    <div className="flex gap-2 pt-1">
                                        <div className="h-9 flex-1 bg-muted-foreground/10 rounded-lg animate-pulse" />
                                        <div className="h-9 w-24 bg-muted-foreground/8 rounded-lg animate-pulse" />
                                    </div>
                                </div>
                            ) : tonightSetlist ? (
                                <HeroCard
                                    setlist={tonightSetlist}
                                    prep={tonightPrep}
                                    onClick={() => navigateToSetlist(tonightSetlist)}
                                    onPerform={() => {
                                        const result = buildPerformQueue(tonightSetlist.tracks || [])
                                        if (result) {
                                            setQueue(result.queue, result.startIndex, `/perform/setlist/${tonightSetlist.id}`, tonightSetlist.id!)
                                            router.push(`/perform/${result.firstFileId}`)
                                        } else {
                                            router.push(`/perform/setlist/${tonightSetlist.id}`)
                                        }
                                    }}
                                />
                            ) : recentPublicSetlists.length > 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                    No upcoming services scheduled
                                </p>
                            ) : null}

                            {/* Command Row — always visible immediately */}
                            <CommandRow
                                isMember={isMember}
                                isBandLeader={isBandLeader}
                                isLoggedIn={!!user}
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
                        <Button asChild variant="outline" className="w-full gap-2">
                            <Link href="/settings">
                                <Music2 className="w-4 h-4" />
                                Set Up My Instrument
                            </Link>
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
                            <Button asChild className="flex-1 gap-2">
                                <Link href="/settings">
                                    <Music2 className="w-4 h-4" />
                                    Set Up Instrument
                                </Link>
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
                        />
                    </div>
                )}

                {/* ── Additional upcoming (non-prep-tracked) ── */}
                {additionalUpcoming.length > 0 && !hasWeekData && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Coming Up
                        </h2>
                        {additionalUpcoming.slice(0, 3).map(s => (
                            <CompactSetlistRow
                                key={s.id}
                                setlist={s}
                            />
                        ))}
                    </div>
                )}

                {/* ── Recent Public Setlists ── */}
                {setlistsReady && !tonightSetlist && recentPublicSetlists.length > 0 && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Recent Setlists
                        </h2>
                        {recentPublicSetlists.slice(0, 4).map(s => (
                            <CompactSetlistRow
                                key={s.id}
                                setlist={s}
                            />
                        ))}
                    </div>
                )}

                {/* ── Guest Sign-In ── */}
                {!user && !authLoading && (
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
