"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { getContextualGreeting, Greeting } from "@/lib/greeting"
import { toDate } from "@/lib/firestore-helpers"
import { Button } from "@/components/ui/button"
import { useCongregation } from "@/lib/congregation-store"
import { DEFAULT_SHORT_NAME } from "@/lib/constants"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { NextServiceCard } from "@/components/home/NextServiceCard"
import { CompactSetlistRow } from "@/components/dashboard"
import { OnboardingCard } from "@/components/dashboard/OnboardingCard"
import { cn } from "@/lib/utils"

// Dashboard complexity components -- commented out per Phase 3 Plan 03 redesign.
// Retained for potential use in Phase 4 (template management) or Phase 6 (notifications).
// import { useMusicStore } from "@/lib/store"
// import { buildPerformQueue } from "@/lib/queue-utils"
// import { useUpcomingPrep } from "@/hooks/use-upcoming-prep"
// import { HeroCard, CommandRow, UpcomingTimeline, WhatsChangedBanner, TaskCards, PrepRecommendations } from "@/components/dashboard"

export interface DashboardServerProps {
    /** Pre-computed greeting from the server (avoids blank flash before JS boots) */
    serverGreeting: Greeting | null
    /** Congregation short name from server (avoids waiting for Firestore) */
    serverShortName: string | null
    serverIsMember?: boolean
    serverIsBandLeader?: boolean
    serverIsAdmin?: boolean
    serverUid?: string | null
}

export default function DashboardClient({ serverGreeting, serverShortName, serverIsMember = false, serverIsBandLeader = false, serverIsAdmin = false, serverUid = null }: DashboardServerProps) {
    const router = useRouter()
    const { user: authUser, profile, cachedUser, signIn, isMember: authIsMember, isBandLeader, loading: authLoading } = useAuth()
    const congregation = useCongregation()
    
    const isMember = authIsMember || serverIsMember
    const effectiveUid = authUser?.uid || serverUid
    const user = authUser || (serverUid ? { uid: serverUid, displayName: null } as any : null)

    const [upcomingSetlists, setUpcomingSetlistsState] = useState<Setlist[]>([])
    const [allSetlists, setAllSetlists] = useState<Setlist[]>([])
    const [recentSetlists, setRecentSetlists] = useState<Setlist[]>([])
    const [setlistsLoaded, setSetlistsLoaded] = useState(false)
    // v60-13-02 (2026-05-13): surface subscription failures visibly to the user
    // (and the console). DashboardClient previously swallowed errors from
    // subscribeToAllSetlists, leaving incognito + cold-load failures
    // indistinguishable from "no setlists exist". This diagnostic surface
    // tells us WHY the subscription fails so we can route the next fix.
    const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
    // v60-13-02b: also track count + fromCache so the empty-state can show
    // whether the subscription actually fired with no docs vs whether it
    // never fired at all. Differentiates "Firestore returned []" from
    // "subscription stuck in pending".
    const [diagInfo, setDiagInfo] = useState<{ count: number; fromCache: boolean; firedAt: string } | null>(null)

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
        if (setlistsLoaded) return
        const timer = setTimeout(() => {
            setSetlistsLoaded(true)
        }, 2000)
        return () => clearTimeout(timer)
    }, [setlistsLoaded])

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

    // ── ALL setlists: single subscription (v4.0: no private/public split) ──
    useEffect(() => {
        if (!setlistService) return
        setSetlistsLoaded(false)
        setSubscriptionError(null)

        // v60-13-02: pass an onError callback. Firestore subscription failures
        // (permission denied, missing index, network gone) were previously only
        // logged to console; the UI just stayed in skeleton → empty state.
        // This surfaces the actual error so we can diagnose incognito blanks
        // and other cold-load failures.
        // v60-13-02b: log auth state alongside subscription so we can correlate
        // "incognito blanks" with the actual auth posture seen by Firestore.
        // eslint-disable-next-line no-console
        console.info(`[Dashboard] subscribing — authUid=${authUser?.uid ?? 'null'} serverUid=${serverUid ?? 'null'} effectiveUid=${effectiveUid ?? 'null'}`)
        const unsub = setlistService.subscribeToAllSetlists(
            (setlists, fromCache) => {
                const upcoming = filterUpcoming(setlists)
                setUpcomingSetlistsState(upcoming.slice(0, 5))
                const recent = setlists
                    .filter(s => s.eventDate)
                    .sort((a, b) => (toDate(b.eventDate)?.getTime() || 0) - (toDate(a.eventDate)?.getTime() || 0))
                    .slice(0, 5)
                setRecentSetlists(recent)
                setAllSetlists(setlists)
                setSetlistsLoaded(true)
                setSubscriptionError(null)
                setDiagInfo({ count: setlists.length, fromCache, firedAt: new Date().toLocaleTimeString() })
                // eslint-disable-next-line no-console
                console.info(`[Dashboard] subscription fired: ${setlists.length} setlists, fromCache=${fromCache}`)
            },
            (err) => {
                const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
                // eslint-disable-next-line no-console
                console.error('[Dashboard] subscription error:', msg, err)
                setSubscriptionError(msg)
                setSetlistsLoaded(true)
            },
        )

        return () => unsub()
    }, [setlistService, filterUpcoming])

    // Content is ready once setlists have loaded.
    const setlistsReady = setlistsLoaded
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
                return 'from-amber-500/10 via-brand/5 to-transparent'
            case 'holiday':
                return 'from-yellow-500/10 via-brand/5 to-transparent'
            case 'morning':
                return 'from-brand/8 via-indigo-500/5 to-transparent'
            case 'evening':
                return 'from-brand/10 via-violet-900/8 to-transparent'
            default:
                return 'from-brand/5 to-transparent'
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
                            className="w-8 h-8 rounded-full border border-brand/20"
                        />
                        <span className="text-xs font-semibold text-brand/70 tracking-wider uppercase">
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
                        HERO CARD: Single focused card -- one card, one action.
                        Visible to all users (Guests, Pending, Members).
                       ══════════════════════════════════════════ */}
                    <div className="flex flex-col gap-4">
                        {!setlistsReady ? (
                            /* Skeleton card while loading — brand-tinted */
                            <div className="rounded-2xl border border-brand/10 bg-card/50 p-5 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-brand/15 animate-pulse" />
                                    <div className="h-3 w-20 bg-brand/10 rounded animate-pulse" />
                                </div>
                                <div className="h-5 w-52 bg-brand/15 rounded animate-pulse" />
                                <div className="h-3 w-32 bg-brand/10 rounded animate-pulse" />
                                <div className="h-9 w-full bg-brand/10 rounded-xl animate-pulse mt-2" />
                            </div>
                        ) : tonightSetlist ? (
                            <NextServiceCard
                                setlist={tonightSetlist}
                                onPerform={() => router.push(`/perform/setlist/${tonightSetlist.id}`)}
                                onEdit={() => router.push(`/setlists/${tonightSetlist.id}`)}
                                isBandLeader={isBandLeader}
                            />
                        ) : mostRecentPastSetlist ? (
                            <NextServiceCard
                                setlist={mostRecentPastSetlist}
                                onPerform={() => router.push(`/perform/setlist/${mostRecentPastSetlist.id}`)}
                                onEdit={() => router.push(`/setlists/${mostRecentPastSetlist.id}`)}
                                isPastSetlist={true}
                                isBandLeader={isBandLeader}
                            />
                        ) : subscriptionError ? (
                            // v60-13-02 diagnostic surface — show the real reason
                            // setlists couldn't load instead of "No services scheduled yet"
                            // (which is misleading when a subscription error is the cause).
                            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                                <p className="text-sm font-semibold text-destructive">Couldn’t load setlists</p>
                                <p className="text-xs text-muted-foreground break-words">{subscriptionError}</p>
                                <p className="text-[10px] text-muted-foreground">If this keeps happening, share this message with support.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    No services scheduled yet
                                </p>
                                {/* v60-13-02b diagnostic strip — visible only when no
                                    setlist + no error; tells us whether the subscription
                                    truly returned 0 docs or never fired at all. */}
                                {diagInfo && (
                                    <p className="text-[10px] text-muted-foreground text-center font-mono">
                                        diag: subscription returned {diagInfo.count} setlists, fromCache={String(diagInfo.fromCache)}, fired @ {diagInfo.firedAt}, authUid={authUser?.uid?.slice(0, 8) ?? 'null'}, serverUid={serverUid?.slice(0, 8) ?? 'null'}
                                    </p>
                                )}
                                {!diagInfo && (
                                    <p className="text-[10px] text-muted-foreground text-center font-mono">
                                        diag: subscription has not fired yet (still subscribing or auth-blocked)
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════
                BELOW HERO -- content area
               ══════════════════════════════════════════ */}
            <div className="flex flex-col gap-6 px-4 md:px-6 pt-6 max-w-2xl mx-auto w-full">

                {/* ── Onboarding (pending or approved — mutually exclusive) ── */}
                {user && (
                    <OnboardingCard
                        role={profile?.role}
                        isMember={isMember}
                        profile={profile}
                        congregationShortName={congregation.shortName}
                        userId={user.uid}
                        staggerClass={stagger(2)}
                    />
                )}

                {/* ── Recent Public Setlists (non-member / no upcoming) ── */}
                {setlistsReady && !tonightSetlist && recentSetlists.length > 0 && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Recent Setlists
                        </h2>
                        {recentSetlists.slice(0, 4).map(s => (
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
