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
 * PDFOverlay renders on top when a song is tapped -- setlist stays mounted.
 */

import { useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft, Music, Users, Pencil, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetlistPerformance } from "@/hooks/use-setlist-performance"
import { useAuth } from "@/lib/auth-context"
import { useLiveSwapAccess } from "@/hooks/use-live-swap-access"
import { useSongGroups } from "@/hooks/use-song-groups"
import { swapLiveTrack } from "@/lib/setlist-live"
import { SetlistView } from "@/components/performance/SetlistView"
import { PDFOverlay } from "@/components/performance/PDFOverlay"
import { SwapBottomSheet } from "@/components/performance/SwapBottomSheet"
import { SwapToast } from "@/components/performance/SwapToast"
import { PrintModal } from "@/components/setlist/PrintModal"
import type { SetlistTrack } from "@/types/models"
import type { SongGroupEntry } from "@/types/song-groups"

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
        musicians,
        liveState,
        setlistId: resolvedSetlistId,
    } = useSetlistPerformance(setlistId)

    const [activeSongIndex, setActiveSongIndex] = useState<number | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const { isMusician, isBandLeader, isAdmin } = useAuth()
    const { user } = useAuth()
    const canPrint = isMusician || isBandLeader || isAdmin

    // Live swap
    const { canSwap } = useLiveSwapAccess()
    const { getAlternatives, getAlternativesByFileId, hasAlternatives } = useSongGroups()
    const isLiveMode = !!liveState?.enabled
    const [swapTarget, setSwapTarget] = useState<{ index: number; track: SetlistTrack } | null>(null)

    const swapAlternatives = swapTarget
        ? (swapTarget.track.liturgicalSlot
            ? getAlternatives(swapTarget.track.liturgicalSlot, swapTarget.track.fileId)
            : getAlternativesByFileId(swapTarget.track.fileId || ""))
        : []

    const handleHasAlternatives = useCallback((track: SetlistTrack): boolean => {
        if (track.liturgicalSlot) return hasAlternatives(track.liturgicalSlot, track.fileId)
        return getAlternativesByFileId(track.fileId || "").length > 0
    }, [hasAlternatives, getAlternativesByFileId])

    const handleConfirmSwap = useCallback(async (alt: SongGroupEntry) => {
        if (!swapTarget || !user) return
        await swapLiveTrack({
            setlistId: resolvedSetlistId,
            trackIndex: swapTarget.index,
            currentTracks: tracks,
            newTrack: {
                id: `track-${Date.now()}-${alt.fileId}`,
                title: alt.title,
                fileId: alt.fileId,
                key: alt.key,
                liturgicalSlot: swapTarget.track.liturgicalSlot,
            },
            previousTrack: swapTarget.track,
            uid: user.uid,
            displayName: user.displayName || "Director",
        })
    }, [swapTarget, user, resolvedSetlistId, tracks])

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
            {/* Header — compact for maximum setlist visibility */}
            <div className="flex items-center gap-2 px-4 py-2 glass border-b-0 z-20 relative">
                <Link
                    href={backHref}
                    className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-muted transition-colors shrink-0"
                >
                    <ArrowLeft className="h-4.5 w-4.5 text-muted-foreground" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h1 className="text-base font-bold truncate">{name}</h1>
                    <p className="text-[11px] text-muted-foreground">
                        {songCount} song{songCount !== 1 ? "s" : ""}
                        {totalCount > songCount ? ` \u00B7 ${totalCount} items` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {canPrint && (
                        <Button onClick={() => setShowPrintModal(true)} size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground">
                            <Printer className="h-3.5 w-3.5" />
                            <span className="text-xs hidden sm:inline">Gig Packet</span>
                        </Button>
                    )}
                    {isLeader && (
                        <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground">
                            <Link href={`/setlists/${setlistId}`}>
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="text-xs hidden sm:inline">Edit</span>
                            </Link>
                        </Button>
                    )}
                </div>
            </div>

            {/* Swap toast — notifies musicians when a swap occurs */}
            <SwapToast liveState={liveState} />

            {/* Who's playing */}
            {musicians.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 overflow-x-auto scrollbar-hide">
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    {musicians.map((m, i) => (
                        <span
                            key={m.uid || i}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap shrink-0"
                        >
                            <span className="font-medium text-foreground">{(m.name || '').split(' ')[0] || 'Unknown'}</span>
                            {m.instrument && (
                                <span className="text-muted-foreground/70">{m.instrument}</span>
                            )}
                        </span>
                    ))}
                </div>
            )}

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
                canSwap={canSwap}
                isLiveMode={isLiveMode}
                hasAlternatives={handleHasAlternatives}
                onSwapTap={(index) => setSwapTarget({ index, track: tracks[index] })}
            />

            {/* PDF overlay: renders on top of setlist when a song is tapped */}
            {activeSongIndex !== null && tracks[activeSongIndex] && (
                <PDFOverlay
                    track={tracks[activeSongIndex]}
                    tracks={tracks}
                    currentIndex={activeSongIndex}
                    onClose={() => setActiveSongIndex(null)}
                    onNavigate={(index) => setActiveSongIndex(index)}
                    isPublicView={isPublicView}
                />
            )}

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

            {/* Swap bottom sheet */}
            {swapTarget && (
                <SwapBottomSheet
                    open={!!swapTarget}
                    onClose={() => setSwapTarget(null)}
                    currentTrack={swapTarget.track}
                    alternatives={swapAlternatives}
                    onConfirmSwap={handleConfirmSwap}
                />
            )}

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId}
                    assignedMusicians={musicians}
                    onClose={() => setShowPrintModal(false)}
                />
            )}
        </div>
    )
}
