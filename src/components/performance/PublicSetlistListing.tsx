"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Calendar } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { useAuth } from "@/lib/auth-context"
import { useWakeLock } from "@/hooks/use-wake-lock"
import { Button } from "@/components/ui/button"
import { QRSignIn } from "@/components/auth/QRSignIn"
import { PublicSetlistSkeleton } from "./PublicSetlistSkeleton"
import { KeepAwakeToggle } from "./KeepAwakeToggle"
import { splitPublicSetlists } from "./public-setlist-order"

/** Cap the public landing to at most this many service rows (upcoming first). */
const MAX_PUBLIC_SERVICES = 5

/**
 * Public setlist listing -- renders public setlists for visitors landing on
 * /perform. Logged-out visitors get a Sign-In card (QR + Google) pinned to the
 * top so the congregation/band has an obvious path to sign in; authed users see
 * just the listing. The list is capped at MAX_PUBLIC_SERVICES rows total,
 * upcoming-prioritized. Auth is resolved CLIENT-side (the /perform page stays a
 * static edge-cached server component that never reads cookies/headers).
 * Used by /perform page as the landing page for community members.
 */
export function PublicSetlistListing() {
    const [setlists, setSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(true)
    // Auth surfaced CLIENT-side only (matches DashboardClient's hook usage).
    // `loading` is aliased to authLoading to disambiguate from the setlist
    // subscription `loading` above. The card renders only once auth resolves
    // (`!authLoading`) so we never flash it then yank it (CLS guard).
    const { user, loading: authLoading, signIn } = useAuth()
    // ipad-wake-lock-fix: belt+braces — Daniel sometimes leaves the picker
    // visible during a service for quick song-pick. Same gesture-gated
    // wake-lock affordance as the setlist detail page header.
    const {
        isSupported: isWakeLockSupported,
        isLocked: isWakeLockActive,
        requestWakeLock,
        releaseWakeLock,
    } = useWakeLock()

    useEffect(() => {
        const service = createSetlistService(null, null)
        const unsub = service.subscribeToAllSetlists((data) => {
            setSetlists(data)
            setLoading(false)
        })
        return () => unsub()
    }, [])

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
                    <h1 className="text-xl font-bold">CRC Music</h1>
                    <p className="text-sm text-muted-foreground">Public setlists</p>
                </div>
                <KeepAwakeToggle
                    isActive={isWakeLockActive}
                    isSupported={isWakeLockSupported}
                    onRequest={requestWakeLock}
                    onRelease={releaseWakeLock}
                />
            </div>

            {/* Logged-out sign-in: QR (scan-with-phone) + Google. Pinned to the
                top so a congregation member sees "scan to sign in" immediately.
                Markup mirrors DashboardClient's Guest Sign-In card so the two
                surfaces stay visually identical. Gated on `!authLoading` to
                avoid flashing then yanking the card (CLS). Authed users see no
                card — the listing is unchanged for them. */}
            {!user && !authLoading && (
                <section
                    aria-label="Sign in to CRC Music"
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
            )}

            {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No public setlists available</p>
                </div>
            ) : (
                <>
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
                                Past services
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
