"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Calendar, UserCircle, PlayCircle } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { getOrgBranding } from "@/lib/org/branding"
import { label } from "@/lib/org/vocab"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { PublicSetlistSkeleton } from "./PublicSetlistSkeleton"
import { KeepAwakeControl } from "./KeepAwakeControl"
import { MAX_PUBLIC_SERVICES, splitPublicSetlists } from "./public-setlist-order"

interface PublicSetlistListingProps {
    /**
     * C11 F-M2-006 — server-side prefetched setlist slice. Seeded by
     * `/perform/page.tsx` so fresh tablets get real cards on first
     * paint instead of the skeleton-then-cards swap. The client
     * Firestore subscription takes over on mount for live updates.
     * Same shape as `subscribeToAllSetlists` emits (filtering happens
     * downstream in `splitPublicSetlists`, NOT here — see file header).
     */
    initialSetlists?: Setlist[]
}

/**
 * Public setlist listing -- renders public setlists for visitors landing on
 * /perform. Logged-out visitors get a Sign-In card (QR + Google) pinned to the
 * top so the congregation/band has an obvious path to sign in; authed users see
 * a small avatar pill upper-right (links to settings) so the auth-state
 * context-shift between landing and per-setlist authed nav isn't invisible.
 * The list is capped at MAX_PUBLIC_SERVICES rows total, upcoming-prioritized.
 * Auth is resolved CLIENT-side (the /perform page stays an ISR-cached server
 * component that never reads cookies/headers — `revalidate=60`).
 *
 * C11 amend: filtering MUST mirror `splitPublicSetlists` exactly (isTest:false
 * + test-uid + eventDate window). Per Daniel directive 2026-05-28 (kill
 * `publishedAt` as a gating concept) + "err public, not gated" invariant, this
 * surface intentionally has NO publishedAt filter. A musician seeing an
 * irrelevant setlist is mild confusion; a musician missing the one they're
 * meant to play is service-block. Always pick mild-confusion.
 */
export function PublicSetlistListing({ initialSetlists }: PublicSetlistListingProps = {}) {
    // SSR seed: when `initialSetlists` arrives we render cards immediately
    // (no `loading:true` flash). The client subscription still wires up on
    // mount and replaces this slice with the live Firestore feed.
    const [setlists, setSetlists] = useState<Setlist[]>(initialSetlists ?? [])
    const [loading, setLoading] = useState(initialSetlists === undefined)
    // Auth surfaced CLIENT-side only (matches DashboardClient's hook usage).
    // `loading` is aliased to authLoading to disambiguate from the setlist
    // subscription `loading` above. The card renders only once auth resolves
    // (`!authLoading`) so we never flash it then yank it (CLS guard).
    const { user, loading: authLoading, signIn, cachedUser } = useAuth()
    // v11-04-01: scope the live subscription to the current tenant so
    // brotherslazaroff.live never shows CRC setlists after hydration. `useOrg`
    // reads the org the Edge proxy resolved from the host (<html data-org>),
    // defaulting to crc outside a provider.
    const org = useOrg()
    // v11-04-02: the wordmark + sign-in aria-label read the tenant's shortName
    // ("Brothers Lazaroff" on BL, "CRC Music" on CRC) so the public landing no
    // longer hardcodes "CRC Music". Same org seam the subscription scope uses.
    const orgName = getOrgBranding(org).shortName

    useEffect(() => {
        const service = createSetlistService(null, null)
        const unsub = service.subscribeToAllSetlists((data) => {
            setSetlists(data)
            setLoading(false)
        }, undefined, org)
        return () => unsub()
    }, [org])

    // Split into UPCOMING (eventDate >= today@00:00, soonest first) and PAST
    // (most-recent first; undated trailing), mirroring the authed /setlists
    // dashboard so tonight's service sits above tomorrow's instead of a plain
    // descending-date sort burying it. The helper also drops `isTest:true` rows
    // AND test-uid-owned rows (Cycle-2 SEC-004 + Cycle-7 belt-and-braces), so
    // probe surfaces never leak onto the public listing.
    // Cap the COMBINED listing at MAX_PUBLIC_SERVICES rows, upcoming first: all
    // upcoming (capped if there's a flood), then most-recent past filling the
    // remainder. Cap at the call site only — `splitPublicSetlists` keeps its
    // shared sort + isTest/test-uid filtering intact.
    const { upcoming, past } = useMemo(() => {
        const split = splitPublicSetlists(setlists)
        const cappedUpcoming = split.upcoming.slice(0, MAX_PUBLIC_SERVICES)
        const remaining = Math.max(0, MAX_PUBLIC_SERVICES - cappedUpcoming.length)
        return { upcoming: cappedUpcoming, past: split.past.slice(0, remaining) }
    }, [setlists])
    const isEmpty = upcoming.length === 0 && past.length === 0

    if (loading) {
        // Cycle-3.5 P2-005: mirror the SSR skeleton from PerformPage so the
        // pre-subscription client state stays byte-equivalent with the
        // SSR'd skeleton. Eliminates the spinner-flash → cards swap on
        // first paint AND any CLS between SSR and hydration.
        return <PublicSetlistSkeleton />
    }

    const renderCard = (setlist: Setlist) => {
        const eventDate = toDate(setlist.eventDate)
        const songCount = setlist.songCount ?? 0

        return (
            <Link
                key={setlist.id}
                href={`/perform/setlist/${setlist.id}`}
                className="block rounded-2xl border border-border/50 bg-card/50 p-4 hover:bg-muted/50 transition-colors"
            >
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base truncate">
                            {setlist.name}
                        </h3>
                        {eventDate && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {eventDate.toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </p>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mt-1">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                    </span>
                </div>
            </Link>
        )
    }

    return (
        <div className="flex flex-col gap-4 px-4 pt-6 pb-20 max-w-2xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <Music className="h-6 w-6 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-bold">{orgName}</h1>
                    <p className="text-sm text-muted-foreground">Public setlists</p>
                </div>
                {/* FU-c12-3 — the wake-lock toggle (and its `useWakeLock` hook)
                    only mount for SIGNED-IN viewers via <KeepAwakeControl/>.
                    The affordance exists for the band-leader who leaves the
                    picker open during a service for quick song-pick; anonymous
                    visitors + crawlers have no use for it and previously got an
                    idle `visibilitychange` listener + a purposeless "Keep
                    screen on" button. Gating to authed viewers keeps the leader
                    workflow while making "the anon landing never touches the
                    WakeLock API" structural. (Request was already gesture-gated,
                    so this is hygiene, not an auto-request bugfix.) */}
                {user && !authLoading && <KeepAwakeControl />}
                {/* C11 M3-012 — auth-state indicator. Signed-in viewers get an
                    avatar pill linking to settings so the context-shift to the
                    authed app (visible the moment they tap into a setlist) isn't
                    invisible on the landing. Logged-out viewers get the QR/Google
                    Sign-In card below — adding a pill here too would duplicate
                    that affordance (AC3 "Sign-in pill OR existing QR card, not
                    both"). Gated on `!authLoading` to avoid flash-then-yank CLS,
                    matching the QR card's guard. */}
                {user && !authLoading && (
                    <Link
                        href="/settings"
                        aria-label={`Signed in as ${user.displayName || user.email || "musician"} — open settings`}
                        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                        <Avatar className="h-9 w-9 border border-border">
                            <AvatarImage src={user.photoURL ?? undefined} alt="" />
                            <AvatarFallback>
                                <UserCircle className="w-5 h-5" />
                            </AvatarFallback>
                        </Avatar>
                    </Link>
                )}
            </div>

            {/* Logged-out sign-in: QR (scan-with-phone) + Google. Pinned to the
                top so a congregation member sees "scan to sign in" immediately.
                Markup mirrors DashboardClient's Guest Sign-In card so the two
                surfaces stay visually identical. Authed users see no card — the
                listing is unchanged for them.

                v11.3-04-02 (BUG-2 CLS): the card used to mount only on
                `!user && !authLoading`, i.e. AFTER client auth resolved — which
                on the public landing (overwhelmingly anonymous) inserted ~380px
                ABOVE the lists post-paint, shifting Upcoming/Past down (field
                p75 CLS 0.20 / synthetic 0.187 @ iPad). Fix: reserve the card's
                slot DURING authLoading whenever we expect an anon visitor
                (`!cachedUser` — no prior signed-in user persisted in
                localStorage), so the lists render at their final position
                immediately and the real card swaps into the reserved space with
                ZERO shift. Authed returners (`cachedUser` present) skip the
                reservation → their no-card layout is byte-identical to before
                (no new collapse-shift). Covers the web-vitals `/perform` CLS
                cell. The reserved skeleton mirrors the card's exact footprint
                (QR 160px + divider + h-11 button) so heights match by
                construction, not a magic pixel value. */}
            {!user && !authLoading ? (
                <section
                    aria-label={`Sign in to ${orgName}`}
                    className="bg-card rounded-2xl p-5 text-center space-y-4 border border-border"
                >
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
                </section>
            ) : authLoading && !cachedUser ? (
                <div
                    aria-hidden="true"
                    data-testid="signin-reserve"
                    className="bg-card rounded-2xl p-5 text-center space-y-4 border border-border"
                >
                    {/* QR skeleton — matches QRSignIn's active footprint */}
                    <div className="flex flex-col items-center gap-4">
                        <div className="bg-white p-3 rounded-xl shadow-sm">
                            <div className="h-40 w-40 rounded bg-muted animate-pulse" />
                        </div>
                        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">or</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="h-11 w-full rounded-xl bg-muted animate-pulse" />
                </div>
            ) : null}

            {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No public setlists available</p>
                </div>
            ) : (
                <>
                    {/* F1 (v11.5-02-01): one-tap "next service" entry. The soonest
                        upcoming setlist (upcoming[0] — equals firstUpcomingSetlist on
                        the same org-scoped data) gets a prominent primary-action card
                        ABOVE the lists so the band taps straight into the service
                        they're about to play instead of scanning the list. Renders in
                        the SSR first paint (initialSetlists seeds `setlists` → this is
                        in the post-`loading` markup), so it adds no post-hydration
                        shift. The same set still appears in the Upcoming list below
                        (matches the authed dashboard hero+list pattern). */}
                    {upcoming.length > 0 && (() => {
                        const next = upcoming[0]
                        const nextDate = toDate(next.eventDate)
                        return (
                            <Link
                                href={`/perform/setlist/${next.id}`}
                                aria-label={`Go to next service: ${next.name}`}
                                className="group block rounded-2xl bg-primary text-primary-foreground p-5 cursor-pointer transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
                                        <PlayCircle className="h-6 w-6" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-foreground/80">
                                            Next service
                                        </p>
                                        <h2 className="truncate text-lg font-bold leading-tight">{next.name}</h2>
                                        {nextDate && (
                                            <p className="mt-0.5 flex items-center gap-1 text-xs text-primary-foreground/80">
                                                <Calendar className="h-3 w-3" />
                                                {nextDate.toLocaleDateString(undefined, {
                                                    weekday: "long",
                                                    month: "short",
                                                    day: "numeric",
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold opacity-90 group-hover:opacity-100">
                                        Perform
                                    </span>
                                </div>
                            </Link>
                        )
                    })()}
                    {upcoming.length > 0 && (
                        <section className="flex flex-col gap-3">
                            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
                                Upcoming
                            </h2>
                            <div className="flex flex-col gap-3">
                                {upcoming.map(renderCard)}
                            </div>
                        </section>
                    )}
                    {past.length > 0 && (
                        <section className="flex flex-col gap-3 mt-5">
                            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground px-1">
                                {label(org, 'pastSection')}
                            </h2>
                            <div className="flex flex-col gap-3">
                                {past.map(renderCard)}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    )
}
