"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { getContextualGreeting, Greeting } from "@/lib/greeting"
import { toDate } from "@/lib/firestore-helpers"
import { PendingAccountIllustration } from "@/components/ui/illustrations"
import { NudgeAdminButton } from "@/components/people/NudgeAdminButton"
import { Button } from "@/components/ui/button"
import { Music2 } from "lucide-react"
import { useCongregation } from "@/lib/congregation-store"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { NextServiceCard } from "@/components/home/NextServiceCard"
import { CompactSetlistRow } from "@/components/dashboard"
import { cn } from "@/lib/utils"

// Dashboard complexity components -- commented out per Phase 3 Plan 03 redesign.
// Retained for potential use in Phase 4 (template management) or Phase 6 (notifications).
// import { useChatStore } from "@/lib/chat-store"
// import { useMusicStore } from "@/lib/store"
// import { buildPerformQueue } from "@/lib/queue-utils"
// import { useUpcomingPrep } from "@/hooks/use-upcoming-prep"
// import { HeroCard, CommandRow, UpcomingTimeline, WhatsChangedBanner, TaskCards, PrepRecommendations } from "@/components/dashboard"

export interface DashboardServerProps {
    /** Pre-computed greeting from the server (avoids blank flash before JS boots) */
    serverGreeting: Greeting | null
    /** Congregation short name from server (avoids waiting for Firestore) */
    serverShortName: string | null
}

export default function DashboardClient({ serverGreeting, serverShortName }: DashboardServerProps) {
    const router = useRouter()
    const { user, profile, cachedUser, signIn, isMember, loading: authLoading } = useAuth()
    const congregation = useCongregation()

    const [upcomingSetlists, setUpcomingSetlists] = useState<Setlist[]>([])
    const [allSetlists, setAllSetlists] = useState<Setlist[]>([])
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

    // Safety timeout: 2s. Prevents hanging on slow networks.
    useEffect(() => {
        if (personalLoaded && publicLoaded) return
        const timer = setTimeout(() => {
            setPersonalLoaded(true)
            setPublicLoaded(true)
        }, 2000)
        return () => clearTimeout(timer)
    }, [personalLoaded, publicLoaded])

    // Greeting — use server-rendered value initially, recompute client-side for real-time updates.
    const initialGreeting = serverGreeting || getContextualGreeting(null, undefined, serverShortName || DEFAULT_SHORT_NAME)
    const [greeting, setGreeting] = useState<Greeting>(initialGreeting)

    useEffect(() => {
        const displayName = profile?.displayName || user?.displayName || cachedUser?.displayName
        const firstName = displayName?.split(' ')[0] || null
        const shortName = congregation.shortName || serverShortName || DEFAULT_SHORT_NAME
        setGreeting(getContextualGreeting(firstName, undefined, shortName))
    }, [profile?.displayName, user?.displayName, cachedUser?.displayName, congregation.shortName, serverShortName])

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

    // ── PUBLIC setlists: start IMMEDIATELY -- no auth gate ──
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

            if (!user?.uid) {
                setUpcomingSetlists(upcoming.slice(0, 5))
                setAllSetlists(setlists)
            }
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
            setAllSetlists(setlists)
            setPersonalLoaded(true)
        })

        return () => unsub()
    }, [setlistService, user?.uid, authLoading, filterUpcoming])


    // Content is ready once public setlists have loaded.
    const setlistsReady = publicLoaded
    const tonightSetlist = upcomingSetlists[0]

    // Empty state: find the most recent past setlist for practice reference
    const mostRecentPastSetlist = useMemo(() => {
        if (tonightSetlist) return null // Have upcoming, no need for past
        const now = new Date()
        now.setHours(0, 0, 0, 0)
        const pastSetlists = allSetlists
            .filter(s => {
                if (!s.eventDate) return false
                const d = toDate(s.eventDate)
                if (!d) return false
                d.setHours(0, 0, 0, 0)
                return d < now
            })
            .sort((a, b) => {
                const da = toDate(a.eventDate)
                const db = toDate(b.eventDate)
                return (db?.getTime() || 0) - (da?.getTime() || 0)
            })
        return pastSetlists[0] || null
    }, [tonightSetlist, allSetlists])

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

    return (
        <div className={cn("flex flex-col w-full pb-28", !shouldAnimate && "dash-no-animate")}>

            {/* ══════════════════════════════════════════
                ATMOSPHERIC HERO ZONE -- renders immediately,
                no data dependency. Greeting is computed client-side.
               ══════════════════════════════════════════ */}
            <div className={`bg-gradient-to-b ${atmosphereClasses} px-4 md:px-6 pt-4 pb-6`}>
                <div className="max-w-2xl mx-auto w-full">

                    {/* Branding */}
                    <div className="flex items-center gap-2.5 mb-5">
                        <img
                            src="/logo.jpg"
                            alt={congregation.shortName}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full border border-border/50"
                        />
                        <span className="text-xs font-semibold text-muted-foreground/70 tracking-wider uppercase">
                            {congregation.shortName}
                        </span>
                    </div>

                    {/* Greeting */}
                    <div className="mb-5">
                        <h1 className={cn(
                            "text-[26px] font-bold tracking-tight leading-tight font-display",
                            greeting.isSpecial
                                ? "bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text"
                                : "text-foreground"
                        )}>
                            {greeting.text}
                            {greeting.isSpecial && (
                                <span className="inline-block ml-2 text-lg align-middle opacity-80">
                                    {greeting.atmosphere === 'shabbat' ? '\u2728' : '\uD83C\uDF89'}
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground/80 mt-1 font-medium tracking-wide">
                            {greeting.hebrewDate.split(' ').map((part, i, arr) => (
                                <span key={i}>
                                    {part}
                                    {i < arr.length - 1 && (i === arr.length - 2
                                        ? <span className="mx-1.5 text-muted-foreground/40">{'\u00B7'}</span>
                                        : ' '
                                    )}
                                </span>
                            ))}
                        </p>
                    </div>

                    {/* ══════════════════════════════════════════
                        MEMBER VIEW: Single focused card -- one card, one action.
                        Replaces HeroCard + CommandRow + UpcomingTimeline + etc.
                       ══════════════════════════════════════════ */}
                    {user && isMember && (
                        <div className="flex flex-col gap-4">
                            {!setlistsReady ? (
                                /* Skeleton card while loading */
                                <div className="rounded-2xl border border-border/50 bg-card/50 p-5 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-muted-foreground/15 animate-pulse" />
                                        <div className="h-3 w-20 bg-muted-foreground/10 rounded animate-pulse" />
                                    </div>
                                    <div className="h-5 w-52 bg-muted-foreground/15 rounded animate-pulse" />
                                    <div className="h-3 w-32 bg-muted-foreground/10 rounded animate-pulse" />
                                    <div className="h-9 w-full bg-muted-foreground/10 rounded-xl animate-pulse mt-2" />
                                </div>
                            ) : tonightSetlist ? (
                                <NextServiceCard
                                    setlist={tonightSetlist}
                                    onPerform={() => router.push(`/perform/setlist/${tonightSetlist.id}`)}
                                />
                            ) : mostRecentPastSetlist ? (
                                <NextServiceCard
                                    setlist={mostRecentPastSetlist}
                                    onPerform={() => router.push(`/perform/setlist/${mostRecentPastSetlist.id}`)}
                                    isPastSetlist={true}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No services scheduled yet
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════════════════════════════
                BELOW HERO -- content area
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
                        <div className="flex flex-col gap-2">
                            <Button asChild variant="outline" className="w-full gap-2">
                                <Link href="/settings">
                                    <Music2 className="w-4 h-4" />
                                    Set Up My Instrument
                                </Link>
                            </Button>
                            <NudgeAdminButton />
                        </div>
                    </div>
                )}

                {/* ── Onboarding: First-time approved ── */}
                {user && isMember && profile && !profile.musicianProfile?.instrument && !profile.viewedWelcomeModal && (
                    <div className={cn("bg-card border-2 border-violet-500/30 rounded-2xl p-6 space-y-4", stagger(2))}>
                        <div className="text-center">
                            <span className="text-2xl">{'\uD83C\uDF89'}</span>
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
                                        const { markWelcomeModalViewed } = await import("@/lib/users-firebase")
                                        await markWelcomeModalViewed(user.uid)
                                    }
                                }}
                            >
                                Skip
                            </Button>
                        </div>
                    </div>
                )}

                {/* ── Recent Public Setlists (non-member / no upcoming) ── */}
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
