"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Calendar } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"
import { isTestUid } from "@/lib/test-isolation"
import { PublicSetlistSkeleton } from "./PublicSetlistSkeleton"

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

    // Sort by event date descending (most recent first). Cycle-2 SEC-004:
    // drop setlists marked `isTest:true` — stress-test runs and the
    // create_test_account-owned probes shouldn't appear on the public
    // /perform landing surface.
    //
    // Cycle-7 Lane 1 (Convergence A / Instance-5 headline): the flag alone
    // is structurally insufficient — `create_test_account`-owned setlists
    // sometimes ship with `isTest:undefined` (legacy backfill gap; orphan
    // rows surviving a partial cleanup). Belt-and-braces: ALSO drop any
    // setlist whose `ownerId` matches the test-uid shape via
    // `isTestUid(...)`, so cowork-probe surfaces (`test-…`, `c<N>i<N>-…`,
    // `cf<N>-…`) can never leak onto the public listing regardless of
    // flag state.
    const sortedSetlists = useMemo(() => {
        return setlists
            .filter((s) => s.isTest !== true && !isTestUid(s.ownerId))
            .sort((a, b) => {
                const da = toDate(a.eventDate)
                const db = toDate(b.eventDate)
                return (db?.getTime() || 0) - (da?.getTime() || 0)
            })
    }, [setlists])

    if (loading) {
        // Cycle-3.5 P2-005: mirror the SSR skeleton from PerformPage so the
        // pre-subscription client state stays byte-equivalent with the
        // SSR'd skeleton. Eliminates the spinner-flash → cards swap on
        // first paint AND any CLS between SSR and hydration.
        return <PublicSetlistSkeleton />
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

            {/* Setlist cards */}
            {sortedSetlists.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No public setlists available</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {sortedSetlists.map((setlist) => {
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
                                        <h2 className="font-semibold text-base truncate">
                                            {setlist.name}
                                        </h2>
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
                    })}
                </div>
            )}
        </div>
    )
}
