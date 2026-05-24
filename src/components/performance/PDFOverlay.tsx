"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { SetlistTrack } from "@/types/models"
import { PerformanceToolbar } from "./PerformanceToolbar"
import { TempoFlash } from "./TempoFlash"
import { useMusicStore, QueueItem } from "@/lib/store"
import { useLibraryStore } from "@/lib/library-store"
import { toQueueItem } from "@/lib/queue-utils"
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary"
import { LiveDirectorGesture } from "./LiveDirectorGesture"
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

// v70-01: image-chart support (PNG/JPEG/HEIC).
// Disabled SSR matches the other viewer dynamic imports.
const ImageScoreViewer = dynamic(
    () => import("@/components/music/ImageScoreViewer").then((mod) => mod.ImageScoreViewer),
    { ssr: false }
)

// audio-viewer-f7 (2026-05-24): audio-bond first-class viewer. Closes the
// "track.type:'song' + .mp3 fileId → 404 via PDFViewer" silent failure
// — see AudioViewer.tsx header for the full story.
const AudioViewer = dynamic(
    () => import("@/components/music/AudioViewer").then((mod) => mod.AudioViewer),
    { ssr: false }
)

export interface PDFOverlayProps {
    track: SetlistTrack
    tracks: SetlistTrack[]
    currentIndex: number
    onClose: () => void
    onNavigate: (index: number) => void
    isPublicView: boolean
    /**
     * Whether the live-director long-press gesture is active on this chart
     * surface. Mirrors `useSetlistPerformance().isLeader` (= isAdmin ||
     * isBandLeader). When `true` AND `setlistId` is known, a ~500ms hold on
     * the chart area opens the live-director action sheet
     * (change-key / swap-chart / insert-song).
     */
    isLeader?: boolean
    /** Parent setlist id — required for `isLeader` gesture to mount (insert
     *  writes need it). */
    setlistId?: string
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
    isLeader = false,
    setlistId: setlistIdProp,
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
    // v70-01-01 Task 4 backstop, extended (fix-scraped-text-render): a legacy or
    // bulk-bonded track may carry type='pdf' (the toQueueItem default) because
    // its SetlistTrack predates mimeType persistence — or was bonded via a path
    // that doesn't stamp it. useLibraryStore.allFiles holds the authoritative
    // mimeType from library_index — read it here to upgrade viewer routing on
    // the fly without a rebind or data migration. Covers image (v70-01-01),
    // text/plain (scraped charts), and MusicXML. [[project_track_mimetype_gotcha]]
    const libMimeType = useLibraryStore(s =>
        currentItem?.fileId ? s.allFiles.find(f => f.id === currentItem.fileId)?.mimeType : undefined,
    )
    const isMusicXml = currentItem?.type === 'musicxml'
        || (libMimeType?.includes('xml') ?? false)
    const isText = currentItem?.type === 'text'
        || (libMimeType?.startsWith('text/') ?? false)
    const isImage = currentItem?.type === 'image'
        || (libMimeType?.startsWith('image/') ?? false)
    // audio-viewer-f7: audio-bond detection. toQueueItem's FileType union
    // doesn't include 'audio' (out-of-scope per dispatch — track-type
    // detection belongs to a separate lane), so this branch fires purely
    // off the library mimeType backstop + fileName/fileId extension
    // fallback — same pattern as isImage uses for HEIC legacy. The
    // extension test is the only thing that catches a legacy bind where
    // library_index never got a mimeType stamped.
    const audioRe = /\.(mp3|wav|m4a|ogg)$/i
    const isAudio = (libMimeType?.startsWith('audio/') ?? false)
        || audioRe.test(track.fileName ?? '')
        || audioRe.test(track.fileId ?? '')

    // Network URL for the chart bytes. PDFViewer is handed THIS directly (see the
    // render branch below) — its loader is IDB-first: it extracts the fileId from
    // the `/api/drive/file/<id>` shape and resolves the cached bytes straight into a
    // Uint8Array, only hitting the network on a cache miss. So the PDF path needs
    // NO blob: object URL.
    //
    // ⚠️ webkit-pdf-reload-fix (R1 Finding B, 2026-05-22): the PDF path used to be
    // routed through `fileUrl` (a `blob:` object URL created from the IDB blob).
    // PDFViewer then `fetch()`ed that blob: URL — and iPad/iOS WebKit intermittently
    // fails a fetch of a freshly-created object URL with "Load failed" on the first
    // tap, surfacing as "Failed to load PDF" (no /api/drive/file request; self-heals
    // on Retry). Handing PDFViewer the network URL and letting its IDB-first loader
    // resolve the cached bytes removes the blob: round-trip and the race entirely.
    const networkUrl = track.fileId ? `/api/drive/file/${track.fileId}` : ""

    // `fileUrl` (a cached-blob object URL, or the network URL on miss) is ONLY for
    // the non-PDF viewers (SmartScore/Text/Image): they `fetch(url)` / `<img src>`
    // the URL directly with NO IDB fallback, so the blob: URL is their offline path.
    // Start EMPTY (not networkUrl): if we seeded with networkUrl, an offline open
    // would fire a doomed network fetch BEFORE the cached blob resolves. The viewers
    // guard on `fileUrl && <Viewer/>`, so "" renders nothing for the one tick until
    // resolve() picks the blob (offline-safe) or the network URL (online, uncached).
    const [fileUrl, setFileUrl] = useState<string>("")
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
    const setlistIdFromPath = params.includes('setlist') ? params[params.indexOf('setlist') + 1] : undefined
    const setlistId = setlistIdProp ?? setlistIdFromPath

    // Live-director long-press only mounts when the viewer is a band_leader/
    // admin AND we know which setlist this chart belongs to (insert writes
    // need it). Off otherwise — keeps the native iOS callout / context menu
    // behavior intact for musicians.
    const gestureEligible = isLeader && !!setlistId && !!track.id

    const chartSurface = (
        <SectionErrorBoundary key={track.fileId} label="Chart">
            {isMusicXml ? (
                fileUrl && <SmartScoreViewer url={fileUrl} trackId={track.id} trackKey={track.key} />
            ) : isText ? (
                fileUrl && <TextScoreViewer url={fileUrl} />
            ) : isImage ? (
                fileUrl && <ImageScoreViewer url={fileUrl} alt={track.title} />
            ) : isAudio ? (
                // audio-viewer-f7: AudioViewer self-resolves the source
                // via offline-idb (mirrors PDFViewer's IDB-first pattern),
                // so it doesn't depend on PDFOverlay's `fileUrl` blob
                // lifecycle. fileId is the stable handle.
                track.fileId && <AudioViewer fileId={track.fileId} title={track.title} />
            ) : (
                // PDF: hand PDFViewer the network URL, NOT a blob: object
                // URL. PDFViewer's loader is IDB-first, so cached charts
                // render straight from bytes (no network) and the WebKit
                // blob:-fetch race (R1 Finding B) can't occur on first tap.
                networkUrl && <PDFViewer url={networkUrl} trackName={track.title} />
            )}
        </SectionErrorBoundary>
    )

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* Content area -- branches on file type */}
            {gestureEligible ? (
                <LiveDirectorGesture
                    enabled
                    track={track}
                    trackIndex={currentIndex}
                    setlistTracks={tracks}
                    setlistId={setlistId!}
                >
                    {({ handlers }) => (
                        <div
                            className="flex-1 overflow-auto pb-0 relative"
                            data-live-director-surface="pdf-overlay"
                            onPointerDown={handlers.onPointerDown}
                            onPointerUp={handlers.onPointerUp}
                            onPointerMove={handlers.onPointerMove}
                            onPointerCancel={handlers.onPointerCancel}
                            onContextMenu={handlers.onContextMenu}
                            onClick={handlers.onClick}
                            style={handlers.style}
                        >
                            {chartSurface}
                            {showTempoFlash && track.bpm && track.bpm > 0 && (
                                <TempoFlash bpm={track.bpm} onDismiss={() => setShowTempoFlash(false)} />
                            )}
                        </div>
                    )}
                </LiveDirectorGesture>
            ) : (
                <div className="flex-1 overflow-auto pb-0 relative">
                    {chartSurface}
                    {showTempoFlash && track.bpm && track.bpm > 0 && (
                        <TempoFlash bpm={track.bpm} onDismiss={() => setShowTempoFlash(false)} />
                    )}
                </div>
            )}

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
