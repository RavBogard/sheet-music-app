"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Play, ChevronRight } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { useAuth } from "@/lib/auth-context"
import { useOrg } from "@/lib/org/org-context"
import { getOrgBranding } from "@/lib/org/branding"
import { label } from "@/lib/org/vocab"
import { useT } from "@/i18n/client"
import { useFormat } from "@/i18n/format-client"
import { Button } from "@/components/ui/button"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { PublicSetlistSkeleton } from "./PublicSetlistSkeleton"
import { KeepAwakeControl } from "./KeepAwakeControl"
import { MAX_PUBLIC_SERVICES, splitPublicSetlists } from "./public-setlist-order"
import { RowDate } from "@/components/setlist/RowDate"
import { DirectionalIcon } from "@/components/i18n/DirectionalIcon"
import { PageContainer, PageHeader } from "@/components/layout/Page"
import { VariantGroupList } from "@/components/setlist/VariantGroupList"
import { foldSetlistVariants } from "@/lib/setlist-variant-fold"

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
/** Same calendar day on this device (the day boundary splitPublicSetlists uses). */
function isSameLocalDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

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
    const t = useT()
    const fmt = useFormat()
    // The device's "now", read after mount: /perform is ISR-rendered on a
    // server in another time zone, so "Today" on the next-service card is
    // decided on the device, never in the cached HTML (no hydration mismatch).
    const [clientNow, setClientNow] = useState<Date | null>(null)
    useEffect(() => { setClientNow(new Date()) }, [])

    // R-0919-audit-2: the live subscription is a Firestore `list` over the
    // whole `setlists` collection, and collection-wide `list` now requires
    // sign-in. Signed out, we keep the server-rendered slice the ISR page
    // already handed us (`initialSetlists`) — the page revalidates every 60
    // seconds, so it is never more than a minute stale, which is well inside
    // what a band member needs when they open a link on the way in.
    //
    // This is the whole reason the SSR seed exists; before this change it was
    // a first-paint optimisation over a subscription that would then take
    // over. Now it is the signed-out path.
    //
    // Erring public, as the file header says: if auth is still resolving we do
    // NOT clear the list. A musician missing the setlist they are meant to
    // play is a service-block; showing a slightly stale one is not.
    useEffect(() => {
        if (authLoading) return
        if (!user) {
            setLoading(false)
            return
        }
        const service = createSetlistService(null, null)
        const unsub = service.subscribeToAllSetlists((data) => {
            setSetlists(data)
            setLoading(false)
        }, undefined, org)
        return () => unsub()
    }, [org, user, authLoading])

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
    // Consistency pass: the past list folds instrument copies (" · Bb",
    // "(Copy)") under their parent service exactly as /setlists does, with
    // the same shared fold. The cap counts folded groups, so a parent and its
    // copies take one slot and every copy stays one tap away.
    const { upcoming, pastGroups } = useMemo(() => {
        const split = splitPublicSetlists(setlists)
        const cappedUpcoming = split.upcoming.slice(0, MAX_PUBLIC_SERVICES)
        const remaining = Math.max(0, MAX_PUBLIC_SERVICES - cappedUpcoming.length)
        const groups = foldSetlistVariants(split.past, (x) => {
            const d = toDate(x.eventDate)
            return d ? d.toISOString().slice(0, 10) : null
        })
        return { upcoming: cappedUpcoming, pastGroups: groups.slice(0, remaining) }
    }, [setlists])
    const past = pastGroups
    const isEmpty = upcoming.length === 0 && past.length === 0

    if (loading) {
        // Cycle-3.5 P2-005: mirror the SSR skeleton from PerformPage so the
        // pre-subscription client state stays byte-equivalent with the
        // SSR'd skeleton. Eliminates the spinner-flash → cards swap on
        // first paint AND any CLS between SSR and hydration.
        return <PublicSetlistSkeleton />
    }

    // Web refresh (blend E): one clean list on the hairline grid, the same
    // rows as /setlists: a date column, the name large, then date and songs.
    // Every row is a full-width link, at least 72px tall, for a musician
    // tapping an iPad on a stand.
    const renderCard = (setlist: Setlist, muted = false) => {
        const eventDate = toDate(setlist.eventDate)
        const songCount = setlist.songCount ?? 0

        return (
            <Link
                key={setlist.id}
                href={`/perform/setlist/${setlist.id}`}
                className="group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 min-h-[72px] bg-card hover:bg-accent/60 active:bg-accent transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
                <RowDate date={eventDate} muted={muted} />
                <div className="min-w-0 flex-1">
                    <h3 className={muted ? "text-base font-semibold leading-snug line-clamp-2" : "text-[17px] font-bold leading-snug line-clamp-2"}>
                        {setlist.name}
                    </h3>
                    <p className="tnum mt-0.5 text-sm font-medium text-muted-foreground">
                        {eventDate && (
                            <>
                                <span>
                                    {fmt.date(eventDate, {
                                        weekday: "short",
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </span>
                                <span aria-hidden="true"> · </span>
                            </>
                        )}
                        <span data-testid="perform-card-song-count">{t("performSetlist.songCount", { count: songCount })}</span>
                    </p>
                </div>
                <DirectionalIcon icon={ChevronRight} aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" />
            </Link>
        )
    }

    return (
        <PageContainer className="flex flex-col gap-4">
            {/* Head row (consistency pass): the brand lives in the shell's top
                bar now, so the page head is the title that matches the tab,
                the public-listing subtitle, and the viewer's controls on the
                right. */}
            <PageHeader
                className="mb-2"
                title={t("nav.setlists")}
                subtitle={label(org, 'publicListingSubtitle')}
                actions={user && !authLoading ? (
                    <>
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
                        {/* The signed-in avatar lives in the shell's top bar now, so
                            the page head no longer repeats it. */}
                    </>
                ) : undefined}
            />

            {/* Polish 1 (job 1, "open tonight's setlist fast"): the next-service
                card sits ABOVE the sign-in card, so a signed-out iPad or phone
                opens on the service, not on a QR code. It renders in the SSR
                first paint, so moving it adds no shift, and the sign-in
                reservation below still holds the lists in place. */}
            {/* F1 (v11.5-02-01): one-tap "next service" entry. The soonest
                upcoming setlist (upcoming[0] — equals firstUpcomingSetlist on
                the same org-scoped data) gets a prominent primary-action card
                ABOVE the lists so the band taps straight into the service
                they're about to play instead of scanning the list. Renders in
                the SSR first paint (initialSetlists seeds `setlists` → this is
                in the post-`loading` markup), so it adds no post-hydration
                shift. The same set still appears in the Upcoming list below
                (matches the authed dashboard hero+list pattern). */}
            {!isEmpty && upcoming.length > 0 && (() => {
                const next = upcoming[0]
                const nextDate = toDate(next.eventDate)
                return (
                    <Link
                        href={`/perform/setlist/${next.id}`}
                        aria-label={t("performSetlist.goToNextService", { setlistName: next.name })}
                        className="group flex items-center gap-3 sm:gap-4 rounded-lg border border-rule bg-card px-3 sm:px-4 py-4 min-h-[88px] cursor-pointer transition-colors hover:bg-accent/60 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                        <RowDate date={nextDate} />
                        <div className="min-w-0 flex-1">
                            <h2 className="line-clamp-2 text-[1.35rem] font-extrabold leading-tight tracking-[-0.015em]">{next.name}</h2>
                            <p className="tnum mt-0.5 text-sm font-medium text-muted-foreground">
                                <span className="font-bold text-brand">{nextDate && clientNow && isSameLocalDay(nextDate, clientNow) ? t("performSetlist.today") : t("performSetlist.nextService")}</span>
                                {nextDate && (
                                    <>
                                        <span aria-hidden="true"> · </span>
                                        <span>
                                            {fmt.date(nextDate, {
                                                weekday: "long",
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-2 h-11 rounded-md bg-primary px-4 sm:px-5 text-[15px] font-bold text-primary-foreground group-hover:bg-primary/90 transition-colors">
                            <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                            <span className="hidden sm:inline">{t("performSetlist.perform")}</span>
                        </span>
                    </Link>
                )
            })()}
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
                    aria-label={t("performSetlist.signInTo", { orgName })}
                    className="bg-card rounded-lg p-5 text-center space-y-4 border border-rule"
                >
                    <QRSignIn />
                    <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("performSetlist.or")}</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button
                        onClick={signIn}
                        className="w-full h-12 rounded-md text-[15px] font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                        {t("performSetlist.signInWithGoogle")}
                    </Button>
                </section>
            ) : authLoading && !cachedUser ? (
                <div
                    aria-hidden="true"
                    data-testid="signin-reserve"
                    className="bg-card rounded-lg p-5 text-center space-y-4 border border-rule"
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
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{t("performSetlist.or")}</span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="h-12 w-full rounded-md bg-muted animate-pulse" />
                </div>
            ) : null}

            {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground bg-card border border-rule rounded-lg">
                    <Music className="h-10 w-10 mb-3 text-muted-foreground/60" aria-hidden="true" />
                    <p className="text-lg font-semibold">{t("performSetlist.noPublicSetlists")}</p>
                </div>
            ) : (
                <>
                    {upcoming.length > 0 && (
                        <section
                            className="flex flex-col gap-2 mt-2"
                            /* Test landmark only — no behaviour. The hero above
                               renders `upcoming[0]` a SECOND time, so the
                               soonest service is legitimately in the DOM twice
                               and an unscoped getByText/getAllByText over a
                               service title is ambiguous. Six tests scope to
                               this landmark instead of widening their
                               matchers; the past section's heading is
                               org-dependent (`label(org, 'pastSection')`), so
                               a heading-based lookup would not be stable. */
                            data-testid="upcoming-list"
                        >
                            <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground px-1">
                                {t("performSetlist.upcoming")}
                            </h2>
                            <div className="flex flex-col divide-y divide-rule border border-rule rounded-lg overflow-hidden bg-card">
                                {upcoming.map((s) => renderCard(s))}
                            </div>
                        </section>
                    )}
                    {past.length > 0 && (
                        <section
                            className="flex flex-col gap-2 mt-4"
                            data-testid="past-list"
                        >
                            <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground px-1">
                                {label(org, 'pastSection')}
                            </h2>
                            <VariantGroupList
                                groups={pastGroups}
                                renderRow={(s) => renderCard(s, true)}
                            />
                        </section>
                    )}
                </>
            )}
        </PageContainer>
    )
}
