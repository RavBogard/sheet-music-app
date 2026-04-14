"use client"

/**
 * Setlist Performance View (v2)
 *
 * Dense, scannable setlist -- the core performance experience.
 * Shows the full service flow at a glance: song titles in their transposed
 * key, tempo, lead, and liturgical items. Wake lock keeps the screen on.
 *
 * Architecture: useSetlistPerformance hook + SetlistView component
 * PDFOverlay renders on top when a song is tapped -- setlist stays mounted.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft, Music, Users, Pencil, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSetlistPerformance } from "@/hooks/use-setlist-performance"
import { useAuth } from "@/lib/auth-context"
import { SetlistView } from "@/components/performance/SetlistView"
import { PDFOverlay } from "@/components/performance/PDFOverlay"
import { SwapPicker } from "@/components/performance/SwapPicker"
import { SwapChangeToast } from "@/components/performance/SwapChangeToast"
import { PerformanceOfflineIndicator } from "@/components/performance/PerformanceOfflineIndicator"
import { createSetlistService } from "@/lib/setlist-firebase"
import { useLibrary } from "@/hooks/use-library"
import type { SetlistTrack, DriveFile } from "@/types/models"
const PrintModal = dynamic(() => import("@/components/setlist/PrintModal").then(m => m.PrintModal), { ssr: false })

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
        setlistId: resolvedSetlistId,
        rabbi,
    } = useSetlistPerformance(setlistId)

    const [activeSongIndex, setActiveSongIndex] = useState<number | null>(null)
    const [showPrintModal, setShowPrintModal] = useState(false)
    const [swapTarget, setSwapTarget] = useState<{ index: number; track: SetlistTrack } | null>(null)
    const lastOwnSwapRef = useRef<number | null>(null)
    const { user, isMusician, isBandLeader, isAdmin } = useAuth()
    const canPrint = isMusician || isBandLeader || isAdmin

    // Ensure library data is loaded for SwapPicker search
    useLibrary()

    const setlistService = useMemo(
        () => createSetlistService(user?.uid || null, user?.displayName || null),
        [user]
    )

    const handleSwapSelect = useCallback(async (file: DriveFile) => {
        if (!swapTarget || !setlistService) return
        lastOwnSwapRef.current = swapTarget.index
        await setlistService.swapTrack(resolvedSetlistId, swapTarget.index, {
            fileId: file.id,
            title: file.name.replace(/\.[^.]+$/, ''),
            key: file.metadata?.key,
        })
        setSwapTarget(null)
    }, [swapTarget, setlistService, resolvedSetlistId])

    // Song fileIds for the offline indicator's IDB ground-truth count.
    const songFileIds = useMemo(
        () => tracks
            .filter(t => (!t.type || t.type === "song") && t.fileId)
            .map(t => t.fileId as string),
        [tracks]
    )

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

            {/* Offline indicator — IDB ground truth for N/M charts ready */}
            <PerformanceOfflineIndicator setlistFileIds={songFileIds} />


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
                onSwapTap={isLeader ? (index) => setSwapTarget({ index, track: tracks[index] }) : undefined}
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

            {showPrintModal && (
                <PrintModal
                    setlistName={name}
                    tracks={tracks}
                    setlistId={setlistId}
                    assignedMusicians={musicians}
                    rabbi={rabbi}
                    onClose={() => setShowPrintModal(false)}
                />
            )}

            <SwapChangeToast tracks={tracks} lastOwnSwapRef={lastOwnSwapRef} />

            {swapTarget && (
                <SwapPicker
                    open={!!swapTarget}
                    onClose={() => setSwapTarget(null)}
                    currentTrack={swapTarget.track}
                    onSelectReplacement={handleSwapSelect}
                />
            )}
        </div>
    )
}
