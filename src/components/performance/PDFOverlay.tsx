"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { SetlistTrack } from "@/types/models"
import { PerformanceToolbar } from "./PerformanceToolbar"
import { TempoFlash } from "./TempoFlash"
import { useMusicStore, QueueItem } from "@/lib/store"

// Dynamically import PDFViewer to avoid SSR worker issues (per RESEARCH.md Pitfall 1)
const PDFViewer = dynamic(
    () => import("@/components/music/PDFViewer").then((mod) => mod.PDFViewer),
    { ssr: false }
)

export interface PDFOverlayProps {
    track: SetlistTrack
    tracks: SetlistTrack[]
    currentIndex: number
    onClose: () => void
    onNavigate: (index: number) => void
    isPublicView: boolean
}

/**
 * Full-screen PDF takeover overlay for the performance view.
 *
 * Uses the full PerformanceToolbar (transpose, annotate, zoom, metronome,
 * monitor) — same experience as opening a chart from the library.
 *
 * Layout adapts by viewport:
 * - Mobile (< 1024px): PDF stacked above bottom toolbar
 * - Tablet landscape (≥ 1024px): PDF left + toolbar sidebar right
 *
 * The setlist DOM stays mounted underneath (fixed positioning) so scroll
 * position is preserved when the overlay closes (per RESEARCH.md Pitfall 3).
 */
export function PDFOverlay({
    track,
    tracks,
    currentIndex,
    onClose,
    onNavigate,
    isPublicView,
}: PDFOverlayProps) {
    const setQueue = useMusicStore(s => s.setQueue)
    const queueIndex = useMusicStore(s => s.queueIndex)
    const prevQueueIndexRef = useRef(queueIndex)
    const [showTempoFlash, setShowTempoFlash] = useState(false)

    // Show tempo flash on initial mount and when queueIndex changes
    useEffect(() => {
        const currentTrack = useMusicStore.getState().playbackQueue[queueIndex]
        if (currentTrack?.bpm && currentTrack.bpm > 0) {
            setShowTempoFlash(true)
        } else {
            setShowTempoFlash(false)
        }
    }, [queueIndex])

    // Build playback queue from setlist tracks (only songs with fileIds)
    // Map track indices so we can translate between queue and setlist positions
    const trackIds = tracks.map(t => t.fileId || t.title).join(',')
    useEffect(() => {
        const songTracks = tracks
            .map((t, i) => ({ track: t, setlistIndex: i }))
            .filter(({ track: t }) => t.fileId && (!t.type || t.type === "song"))

        const queueItems: QueueItem[] = songTracks.map(({ track: t }) => ({
            name: t.title || "Untitled",
            fileId: t.fileId!,
            type: "pdf" as const,
            key: t.key || undefined,
            transposition: 0,
        }))

        // Find queue position matching current setlist index
        const queueStart = songTracks.findIndex(({ setlistIndex }) => setlistIndex === currentIndex)

        setQueue(queueItems, Math.max(0, queueStart), undefined, undefined)
    // Re-init queue when tracks change (identity-based, not just length)
    }, [trackIds])

    // Sync currentIndex → queueIndex when parent navigates (e.g., from setlist view)
    useEffect(() => {
        const songTracks = tracks
            .map((t, i) => ({ track: t, setlistIndex: i }))
            .filter(({ track: t }) => t.fileId && (!t.type || t.type === "song"))
        const queuePos = songTracks.findIndex(({ setlistIndex }) => setlistIndex === currentIndex)
        if (queuePos >= 0 && queuePos !== queueIndex) {
            useMusicStore.getState().setQueue(
                useMusicStore.getState().playbackQueue,
                queuePos,
                undefined,
                undefined
            )
        }
    }, [currentIndex])

    // When toolbar navigates (queueIndex changes), translate back to setlist index
    useEffect(() => {
        if (queueIndex === prevQueueIndexRef.current) return
        prevQueueIndexRef.current = queueIndex

        const songTracks = tracks
            .map((t, i) => ({ track: t, setlistIndex: i }))
            .filter(({ track: t }) => t.fileId && (!t.type || t.type === "song"))

        if (queueIndex >= 0 && queueIndex < songTracks.length) {
            const setlistIndex = songTracks[queueIndex].setlistIndex
            if (setlistIndex !== currentIndex) {
                onNavigate(setlistIndex)
            }
        }
    }, [queueIndex, tracks, currentIndex, onNavigate])

    // Lock body scroll while overlay is open (per RESEARCH.md Pitfall 3)
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => {
            document.body.style.overflow = prev
        }
    }, [])

    // Build the PDF URL from the track's fileId
    const pdfUrl = track.fileId ? `/api/drive/file/${track.fileId}` : ""

    // Track menu open state to keep toolbar visible
    const [, setMenuOpen] = useState(false)

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col lg:flex-row">
            {/* PDF content area */}
            <div className="flex-1 overflow-auto pb-28 lg:pb-0 relative">
                {pdfUrl && (
                    <PDFViewer url={pdfUrl} trackName={track.title} />
                )}
                {showTempoFlash && track.bpm && track.bpm > 0 && (
                    <TempoFlash bpm={track.bpm} onDismiss={() => setShowTempoFlash(false)} />
                )}
            </div>

            {/* Mobile/Desktop: bottom toolbar */}
            <div className="lg:hidden">
                <PerformanceToolbar
                    onHome={onClose}
                    onMenuOpenChange={setMenuOpen}
                    layout="bottom"
                />
            </div>

            {/* Tablet landscape (≥ 1024px): sidebar toolbar */}
            <div className="hidden lg:flex">
                <PerformanceToolbar
                    onHome={onClose}
                    onMenuOpenChange={setMenuOpen}
                    layout="sidebar"
                />
            </div>
        </div>
    )
}
