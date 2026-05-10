"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { SetlistTrack } from "@/types/models"
import { PerformanceToolbar } from "./PerformanceToolbar"
import { TempoFlash } from "./TempoFlash"
import { useMusicStore, QueueItem } from "@/lib/store"
import { toQueueItem } from "@/lib/queue-utils"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
const PrintModal = dynamic(() => import("@/components/setlist/PrintModal").then(m => m.PrintModal), { ssr: false })

// Dynamically import PDFViewer to avoid SSR worker issues (per RESEARCH.md Pitfall 1)
const PDFViewer = dynamic(
    () => import("@/components/music/PDFViewer").then((mod) => mod.PDFViewer),
    { ssr: false }
)

// Dynamically import SmartScoreViewer for MusicXML rendering (matching PDFViewer pattern)
const SmartScoreViewer = dynamic(
    () => import("@/components/music/SmartScoreViewer").then((mod) => mod.SmartScoreViewer),
    { ssr: false }
)

const TextScoreViewer = dynamic(
    () => import("@/components/music/TextScoreViewer").then((mod) => mod.TextScoreViewer),
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
 * Layout: PDF stacked above bottom toolbar on all viewports.
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

        const queueItems: QueueItem[] = songTracks.map(({ track: t, setlistIndex: i }) =>
            toQueueItem(t, i)
        )

        // Find queue position matching current setlist index
        const queueStart = songTracks.findIndex(({ setlistIndex }) => setlistIndex === currentIndex)

        setQueue(queueItems, Math.max(0, queueStart), undefined, undefined)
    // Re-init queue when tracks change (identity-based, not just length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Determine file type from current queue item
    const currentItem = useMusicStore(s => s.playbackQueue[s.queueIndex])
    const isMusicXml = currentItem?.type === 'musicxml'
    const isText = currentItem?.type === 'text'

    // Build the file URL from the track's fileId (used for both PDF and MusicXML).
    // Prefer the IDB blob when we have one so offline-preloaded charts render
    // without a network fetch.
    const networkUrl = track.fileId ? `/api/drive/file/${track.fileId}` : ""
    const [fileUrl, setFileUrl] = useState<string>(networkUrl)
    useEffect(() => {
        let cancelled = false
        let objectUrl: string | null = null
        async function resolve() {
            if (!track.fileId) { setFileUrl(""); return }
            const { getFile } = await import("@/lib/offline-idb")
            const blob = await getFile(track.fileId)
            if (cancelled) return
            if (blob) {
                objectUrl = URL.createObjectURL(blob)
                setFileUrl(objectUrl)
            } else {
                setFileUrl(networkUrl)
            }
        }
        resolve()
        return () => {
            cancelled = true
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [track.fileId, networkUrl])
    const pdfUrl = fileUrl

    // Prefetch the next 2 PDFs in the background
    const prefetchedRef = useRef(new Set<string>())
    useEffect(() => {
        const queue = useMusicStore.getState().playbackQueue
        if (!queue || queue.length === 0) return

        // Get the next 2 files
        const nextFiles = [
            queue[queueIndex + 1]?.fileId,
            queue[queueIndex + 2]?.fileId
        ].filter(Boolean) as string[]

        if (nextFiles.length === 0) return

        // Delay prefetching slightly so we don't steal bandwidth from the current PDF
        const controller = new AbortController()
        const prefetchTimer = setTimeout(() => {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(() => doPrefetch(nextFiles))
            } else {
                doPrefetch(nextFiles)
            }
        }, 1000)

        const doPrefetch = async (fileIds: string[]) => {
            if (controller.signal.aborted) return
            const { hasFile, putFile } = await import("@/lib/offline-idb")
            for (const id of fileIds) {
                if (controller.signal.aborted) return
                if (prefetchedRef.current.has(id)) continue
                prefetchedRef.current.add(id)
                try {
                    if (await hasFile(id)) continue
                    const res = await fetch(`/api/drive/file/${id}`, { signal: controller.signal })
                    if (!res.ok) { prefetchedRef.current.delete(id); continue }
                    const blob = await res.blob()
                    if (controller.signal.aborted) return
                    if (blob && blob.size > 0) await putFile(id, blob)
                } catch (e) {
                    if ((e as Error).name === 'AbortError') return
                    prefetchedRef.current.delete(id)
                }
            }
        }

        return () => {
            clearTimeout(prefetchTimer)
            controller.abort()
        }
    }, [queueIndex])

    // Track menu open state to keep toolbar visible
    const [, setMenuOpen] = useState(false)
    const [showPrintModal, setShowPrintModal] = useState(false)

    // Escape closes the open child modal first, then the overlay itself.
    // A ref carries the latest onClose so a parent prop-swap isn't lost to a
    // stale closure, without re-registering the listener on every render.
    const onCloseRef = useRef(onClose)
    useEffect(() => { onCloseRef.current = onClose }, [onClose])
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return
            if (showPrintModal) {
                setShowPrintModal(false)
            } else {
                onCloseRef.current()
            }
            e.stopPropagation()
        }
        document.addEventListener("keydown", handler)
        return () => document.removeEventListener("keydown", handler)
    }, [showPrintModal])

    // Find setlist metadata if available (from parent hook or store)
    // The performance view is mounted under /perform/setlist/[id], so we can extract ID
    const params = typeof window !== 'undefined' ? window.location.pathname.split('/') : []
    const setlistId = params.includes('setlist') ? params[params.indexOf('setlist') + 1] : undefined

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Content area -- branches on file type */}
            <div className="flex-1 overflow-auto pb-0 relative">
                <SectionErrorBoundary key={track.fileId} label="Chart">
                    {isMusicXml ? (
                        fileUrl && <SmartScoreViewer url={fileUrl} />
                    ) : isText ? (
                        fileUrl && <TextScoreViewer url={fileUrl} />
                    ) : (
                        pdfUrl && <PDFViewer url={pdfUrl} trackName={track.title} />
                    )}
                </SectionErrorBoundary>
                {showTempoFlash && track.bpm && track.bpm > 0 && (
                    <TempoFlash bpm={track.bpm} onDismiss={() => setShowTempoFlash(false)} />
                )}
            </div>

            {/* Bottom toolbar — all viewports */}
            <PerformanceToolbar
                onHome={onClose}
                onMenuOpenChange={setMenuOpen}
                onPrint={() => setShowPrintModal(true)}
            />

            {showPrintModal && (
                <div className="absolute inset-0 z-[60]">
                    <PrintModal
                        setlistName="Live Setlist" // Will pull default or use empty if not loaded
                        tracks={tracks}
                        setlistId={setlistId}
                        onClose={() => setShowPrintModal(false)}
                    />
                </div>
            )}
        </div>
    )
}
