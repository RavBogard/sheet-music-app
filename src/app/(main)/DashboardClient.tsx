"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
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
import { isNonTestSetlist } from "@/components/performance/public-setlist-order"
import { PageContainer, PageHeader, GROUP_HEADING_CLASS, LIST_GROUP_CLASS } from "@/components/layout/Page"
import { cn } from "@/lib/utils"
import { formatError } from "@/lib/format-error"
import { useI18n } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"

// Dashboard complexity components -- commented out per Phase 3 Plan 03 redesign.
// Retained for potential use in Phase 4 (template management) or Phase 6 (notifications).
// import { useMusicStore } from "@/lib/store"
// import { buildPerformQueue } from "@/lib/queue-utils"

export interface DashboardServerProps {
    /** Pre-computed greeting from the server (avoids blank flash before JS boots) */
    serverGreeting: Greeting | null
    /** Congregation short name from server (avoids waiting for Firestore) */
    serverShortName: string | null
    /** v11.2-05-01 (BUG-6): host-resolved org logo (getOrgBranding.logoUrl).
     *  "" → render the brand monogram (broslaz); "/logo.jpg" → CRC img. */
    serverLogoUrl?: string | null
    serverIsMember?: boolean
    serverIsBandLeader?: boolean
    serverIsAdmin?: boolean
    serverUid?: string | null
}

export default function DashboardClient({ serverGreeting, serverShortName, serverIsMember = false, serverIsBandLeader = false, serverIsAdmin = false, serverUid = null }: DashboardServerProps) {
    const router = useRouter()
    const { t, lang } = useI18n()
    const fmt = useFormat()
    const { user: authUser, profile, role, cachedUser, signIn, isMember: authIsMember, isBandLeader, loading: authLoading } = useAuth()
    const congregation = useCongregation()

    // v11.2-05-01 (BUG-6): host-resolved hero brand. Server value wins (flash-free,
    // host-correct on broslaz); congregation store is the live-update fallback.
    const heroShortName = serverShortName || congregation.shortName || DEFAULT_SHORT_NAME

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
    const initialGreeting = serverGreeting || getContextualGreeting(null, undefined, serverShortName || DEFAULT_SHORT_NAME, { t, lang })
    const [greeting, setGreeting] = useState<Greeting>(initialGreeting)

    useEffect(() => {
        const displayName = profile?.displayName || user?.displayName || cachedUser?.displayName
        const firstName = displayName?.split(' ')[0] || null
        const shortName = congregation.shortName || serverShortName || DEFAULT_SHORT_NAME
        setGreeting(getContextualGreeting(firstName, undefined, shortName, { t, lang }))
    }, [profile?.displayName, user?.displayName, cachedUser?.displayName, congregation.shortName, serverShortName, t, lang])

    const setlistService = useMemo(() => {
        return createSetlistService(user?.uid || null, user?.displayName || null)
    }, [user?.uid, user?.displayName])

    // v11-04-03: scope the live dashboard subscription to the host's tenant so a
    // signed-in BL user never sees CRC setlists (mirrors PublicSetlistListing).
    const org = useOrg()

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

    // v60-13-05 (2026-05-13) outbox diagnostic — Daniel reports queue still not
    // draining despite v60-13-03's pending-row forceLww. Need to see exactly
    // what error class each row is failing with. Logs once on mount; dev-only
    // visibility (console). Safe to remove once root cause identified.
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const { getDb } = await import('@/lib/local/schema')
                const db = getDb()
                const all = await db.outbox.toArray()
                if (cancelled) return
                const byStatus = all.reduce<Record<string, number>>((acc, r) => {
                    acc[r.status] = (acc[r.status] ?? 0) + 1
                    return acc
                }, {})

                console.info(`[Outbox] ${all.length} total — by status:`, byStatus)
                const samples = all.slice(0, 10).map(r => ({
                    id: r.localId,
                    status: r.status,
                    op: r.op,
                    collection: r.collection,
                    docId: r.docId?.slice(0, 12),
                    attempts: r.attempts,
                    forceLww: r.forceLwwOnConflict,
                    lastError: r.lastError?.slice(0, 120),
                }))

                console.info('[Outbox] first 10 rows:', samples)
                const errorClasses = all
                    .map(r => r.lastError)
                    .filter(Boolean)
                    .reduce<Record<string, number>>((acc, msg) => {
                        const key = (msg as string).split(':')[0].slice(0, 40)
                        acc[key] = (acc[key] ?? 0) + 1
                        return acc
                    }, {})

                console.info('[Outbox] lastError class breakdown:', errorClasses)
            } catch (e) {

                console.error('[Outbox] diagnostic failed:', e)
            }
        })()
        return () => { cancelled = true }
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

        console.info(`[Dashboard] subscribing — authUid=${authUser?.uid ?? 'null'} serverUid=${serverUid ?? 'null'} effectiveUid=${effectiveUid ?? 'null'}`)
        const unsub = setlistService.subscribeToAllSetlists(
            (setlists, fromCache) => {
                // v11.2-04-02 (BUG-5): drop isTest fixtures at the data boundary
                // so they never reach Upcoming/recent/past — mirrors the
                // /perform filter (isNonTestSetlist) for surface parity. The
                // diag count below stays on the RAW fetch (subscription health).
                const visible = setlists.filter(isNonTestSetlist)
                const upcoming = filterUpcoming(visible)
                setUpcomingSetlistsState(upcoming.slice(0, 5))
                const recent = visible
                    .filter(s => s.eventDate)
                    .sort((a, b) => (toDate(b.eventDate)?.getTime() || 0) - (toDate(a.eventDate)?.getTime() || 0))
                    .slice(0, 5)
                setRecentSetlists(recent)
                setAllSetlists(visible)
                setSetlistsLoaded(true)
                setSubscriptionError(null)
                setDiagInfo({ count: setlists.length, fromCache, firedAt: fmt.time(new Date()) })

                console.info(`[Dashboard] subscription fired: ${setlists.length} setlists, fromCache=${fromCache}`)
            },
            (err) => {
                const msg = err instanceof Error ? `${err.name}: ${err.message}` : formatError(err)

                console.error('[Dashboard] subscription error:', msg, err)
                setSubscriptionError(msg)
                setSetlistsLoaded(true)
            },
            org,
        )

        return () => unsub()
    }, [
        setlistService,
        filterUpcoming,
        org,
        authUser?.uid,
        serverUid,
        effectiveUid,
        fmt,
    ])

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

    const stagger = (n: number) =>
        shouldAnimate ? `dash-stagger dash-stagger-${n}` : ''

    return (
        <PageContainer className={cn("flex flex-col gap-3", !shouldAnimate && "dash-no-animate")}>
            {/* Consistency pass: one page container and head row. The brand
                lives in the shell's top bar only (no second in-page logo); the
                greeting is the title, the Hebrew date its subtitle. */}
            <PageHeader
                title={greeting.text}
                subtitle={greeting.hebrewDate.split(' ').map((part, i, arr) => (
                    <span key={i}>
                        {part}
                        {i < arr.length - 1 && (i === arr.length - 2
                            ? <span aria-hidden="true" className="mx-1.5 text-muted-foreground">{'·'}</span>
                            : ' '
                        )}
                    </span>
                ))}
            />

                    {/* ══════════════════════════════════════════
                        HERO CARD: Single focused card -- one card, one action.
                        Visible to all users (Guests, Pending, Members).
                       ══════════════════════════════════════════ */}
                    <div className="flex flex-col gap-3">
                        {!setlistsReady ? (
                            /* Skeleton in the compact card's shape (Option B) */
                            <div className="flex items-center gap-3 rounded-lg border border-rule bg-card px-3 sm:px-4 py-2">
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div className="h-4 w-56 max-w-full bg-muted rounded animate-pulse" />
                                    <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                                </div>
                                <div className="h-8 w-24 shrink-0 bg-muted rounded-md animate-pulse" />
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
                            <div className="rounded-lg border border-destructive/30 bg-card p-4 space-y-2">
                                <p className="text-sm font-semibold text-destructive">{t("dashboard.loadErrorTitle")}</p>
                                <p className="text-xs text-muted-foreground break-words">{subscriptionError}</p>
                                <p className="text-xs text-muted-foreground">{t("dashboard.loadErrorHint")}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-muted-foreground text-center py-4">
                                    {t("dashboard.noServicesYet")}
                                </p>
                                {/* v60-13-02b diagnostic strip — visible only when no
                                    setlist + no error; tells us whether the subscription
                                    truly returned 0 docs or never fired at all. */}
                                {diagInfo && (
                                    <p className="text-xs text-muted-foreground text-center font-mono">
                                        {t("dashboard.diagSubscriptionReturned", {
                                            count: diagInfo.count,
                                            fromCache: String(diagInfo.fromCache),
                                            firedAt: diagInfo.firedAt,
                                            authUid: authUser?.uid?.slice(0, 8) ?? 'null',
                                            serverUid: serverUid?.slice(0, 8) ?? 'null',
                                        })}
                                    </p>
                                )}
                                {!diagInfo && (
                                    <p className="text-xs text-muted-foreground text-center font-mono">
                                        {t("dashboard.diagSubscriptionPending")}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                {/* ── Onboarding (pending or approved — mutually exclusive) ── */}
                {user && (
                    <OnboardingCard
                        role={role ?? 'pending'}
                        isMember={isMember}
                        profile={profile}
                        congregationShortName={heroShortName}
                        userId={user.uid}
                        staggerClass={stagger(2)}
                    />
                )}

                {/* ── Recent Public Setlists (non-member / no upcoming) ── */}
                {setlistsReady && !tonightSetlist && recentSetlists.length > 0 && (
                    <div className={cn("flex flex-col gap-2", stagger(3))}>
                        <h2 className={GROUP_HEADING_CLASS}>
                            {t("dashboard.recentSetlists")}
                        </h2>
                        <div className={LIST_GROUP_CLASS}>
                            {recentSetlists.slice(0, 4).map(s => (
                                <CompactSetlistRow
                                    key={s.id}
                                    setlist={s}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Guest Sign-In ── */}
                {!user && !authLoading && (
                    <div className={cn("bg-card rounded-lg p-5 text-center space-y-4 border border-rule", stagger(4))}>
                        <QRSignIn />
                        <div className="flex items-center gap-3">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("dashboard.signInOr")}</span>
                            <div className="h-px flex-1 bg-border" />
                        </div>
                        <Button
                            onClick={signIn}
                            className="w-full h-12 rounded-md text-[15px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {t("dashboard.signInWithGoogle")}
                        </Button>
                    </div>
                )}
        </PageContainer>
    )
}
