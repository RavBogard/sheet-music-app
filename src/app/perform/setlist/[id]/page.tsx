"use client"

/**
 * Setlist Performance View (v2)
 *
 * Dense, scannable setlist -- the core performance experience.
 * Shows the full service flow at a glance: song titles in their transposed
 * key, tempo, lead, and liturgical items. Leader-driven position highlighting
 * and wake lock keep the musician oriented during live services.
 *
 * Architecture: useSetlistPerformance hook + SetlistView component
 * Future: PDFOverlay (Plan 02) renders on top when a song is tapped.
 */

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetlistPerformance } from "@/hooks/use-setlist-performance"
import { SetlistView } from "@/components/performance/SetlistView"

export default function SetlistPerformPage() {
    const params = useParams()
    const setlistId = params?.id as string

    const {
        tracks,
        name,
        serviceNotes,
        loading,
        error,
        currentTrackIndex,
        defaultTransposition,
        isLeader,
        isPublicView,
        setCurrentPosition,
    } = useSetlistPerformance(setlistId)

    // Hook point for Plan 02's PDF overlay
    const [activeSongIndex, setActiveSongIndex] = useState<number | null>(null)

    // Song count for header
    const songCount = tracks.filter((t) => !t.type || t.type === "song").length
    const totalCount = tracks.filter((t) => t.type !== "header").length

    // Back link: authenticated users go to /setlists, public users go to /perform (public listing)
    const backHref = isPublicView ? "/perform" : "/setlists"

    // Error messages based on error type
    const errorMessage = (() => {
        if (!error) return null
        const code = (error as { code?: string })?.code
        if (code === "permission-denied") {
            return "This setlist hasn't been published yet, or you don't have access."
        }
        if (code === "not-found") {
            return "Setlist not found -- it may have been deleted."
        }
        return "Couldn't load setlist -- check your connection and try again."
    })()

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] md:pt-20">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">Loading setlist...</p>
                </div>
            </div>
        )
    }

    if (errorMessage) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] md:pt-20 gap-4">
                <p className="text-muted-foreground">{errorMessage}</p>
                <Button asChild variant="outline">
                    <Link href={backHref}>Back to {isPublicView ? "Home" : "Setlists"}</Link>
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-[calc(100dvh-5rem)] md:pt-20 bg-background text-foreground overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 glass border-b-0 z-20 relative">
                <Link
                    href={backHref}
                    className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold truncate">{name}</h1>
                    <p className="text-xs text-muted-foreground">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                        {totalCount > songCount ? ` \u00B7 ${totalCount} items` : ""}
                    </p>
                </div>
            </div>

            {/* Setlist content */}
            <SetlistView
                tracks={tracks}
                currentTrackIndex={currentTrackIndex}
                defaultTransposition={defaultTransposition}
                isPublicView={isPublicView}
                isLeader={isLeader}
                onSongTap={(index) => setActiveSongIndex(index)}
                onLeaderSetPosition={setCurrentPosition}
                serviceNotes={serviceNotes}
            />

            {/* Plan 02 will render PDFOverlay here when activeSongIndex is set */}
            {/* {activeSongIndex !== null && <PDFOverlay ... />} */}

            {/* Empty state */}
            {tracks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Music className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-lg font-medium">No tracks yet</p>
                    {!isPublicView && (
                        <Button asChild variant="outline" className="mt-4">
                            <Link href={`/setlists/${setlistId}`}>Add tracks</Link>
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
