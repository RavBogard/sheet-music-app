"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Calendar } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { PublicSetlistSkeleton } from "./PublicSetlistSkeleton"
import { splitPublicSetlists } from "./public-setlist-order"

/**
 * Public setlist listing -- renders all public setlists for unauthenticated visitors.
 * No sign-in prompt, no auth-gated UI. Clean, minimal design.
 * Used by /perform page as the landing page for community members.
 */
export function PublicSetlistListing() {
    const [setlists, setSetlists] = useState<Setlist[]>([])
    const [loading, setLoading] = useState(true)

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
    const { upcoming, past } = useMemo(() => splitPublicSetlists(setlists), [setlists])
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
                <div>
                    <h1 className="text-xl font-bold">CRC Music</h1>
                    <p className="text-sm text-muted-foreground">Public setlists</p>
                </div>
            </div>

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
