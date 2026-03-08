"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Music, Calendar, Loader2 } from "lucide-react"
import { createSetlistService, Setlist } from "@/lib/setlist-firebase"
import { toDate } from "@/lib/firestore-helpers"

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
        const unsub = service.subscribeToPublicSetlists((data) => {
            setSetlists(data)
            setLoading(false)
        })
        return () => unsub()
    }, [])

    // Sort by event date descending (most recent first)
    const sortedSetlists = useMemo(() => {
        return [...setlists].sort((a, b) => {
            const da = toDate(a.eventDate)
            const db = toDate(b.eventDate)
            return (db?.getTime() || 0) - (da?.getTime() || 0)
        })
    }, [setlists])

    if (loading) {
        return (
            <div className="flex flex-col gap-4 px-4 pt-8 max-w-2xl mx-auto w-full">
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
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
                        const songCount = (setlist.tracks || []).filter(
                            (t) => !t.type || t.type === "song"
                        ).length

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
