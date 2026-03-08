"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import * as Dialog from "@radix-ui/react-dialog"
import { SetlistTrack } from "@/types/models"
import { PerformanceBottomBar } from "./PerformanceBottomBar"
import { SetlistDrawer } from "./SetlistDrawer"
import { QuickMonitorPanel } from "@/components/monitor/QuickMonitorPanel"

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
 * Renders the selected song's PDF using the existing PDFViewer component,
 * with a persistent PerformanceBottomBar providing setlist drawer, monitor
 * access, song name, prev/next navigation, and close button.
 *
 * The setlist DOM stays mounted underneath (fixed positioning) so scroll
 * position is preserved when the overlay closes (per RESEARCH.md Pitfall 3).
 *
 * When switching songs (via drawer or prev/next), the `url` prop is updated
 * rather than unmounting/remounting PDFViewer to avoid "Worker was destroyed"
 * errors (per RESEARCH.md Pitfall 1).
 */
export function PDFOverlay({
    track,
    tracks,
    currentIndex,
    onClose,
    onNavigate,
    isPublicView,
}: PDFOverlayProps) {
    const [showDrawer, setShowDrawer] = useState(false)
    const [showMonitor, setShowMonitor] = useState(false)

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

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
            {/* PDF content area with bottom padding for the bar (per RESEARCH.md Pitfall 6) */}
            <div className="flex-1 overflow-auto pb-16">
                {pdfUrl && (
                    <PDFViewer url={pdfUrl} trackName={track.title} />
                )}
            </div>

            {/* Persistent bottom bar */}
            <PerformanceBottomBar
                track={track}
                tracks={tracks}
                currentIndex={currentIndex}
                isPublicView={isPublicView}
                onDrawerToggle={() => setShowDrawer((v) => !v)}
                onMonitorToggle={() => setShowMonitor(true)}
                onNavigate={(index) => {
                    onNavigate(index)
                }}
                onClose={onClose}
            />

            {/* Setlist drawer overlay */}
            <SetlistDrawer
                open={showDrawer}
                tracks={tracks}
                currentIndex={currentIndex}
                onSelect={(index) => {
                    onNavigate(index)
                    setShowDrawer(false)
                }}
                onClose={() => setShowDrawer(false)}
            />

            {/* Monitor panel overlay (Radix Dialog with glass morphism) */}
            {!isPublicView && (
                <Dialog.Root open={showMonitor} onOpenChange={(v) => !v && setShowMonitor(false)}>
                    <Dialog.Portal>
                        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[70] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
                        <Dialog.Content
                            className="fixed bottom-14 left-0 right-0 z-[80] max-h-[50vh] bg-zinc-900/95 backdrop-blur-xl rounded-t-2xl border-t border-white/10 overflow-y-auto data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
                            aria-describedby={undefined}
                        >
                            <Dialog.Title className="sr-only">Monitor Mixer</Dialog.Title>
                            <QuickMonitorPanel />
                        </Dialog.Content>
                    </Dialog.Portal>
                </Dialog.Root>
            )}
        </div>
    )
}
