"use client"

import dynamic from "next/dynamic"
import { useDrag } from '@use-gesture/react'
import { useMusicStore } from '@/lib/store'
import { PerformanceToolbar } from "@/components/performance/PerformanceToolbar"
import { FileType } from "@/lib/store"

const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

interface PerformerViewProps {
    fileType: FileType | null
    fileUrl: string | null
    onHome: () => void
    onSetlist: () => void
}

export function PerformerView({ fileType, fileUrl, onHome, onSetlist }: PerformerViewProps) {
    const { nextSong, prevSong } = useMusicStore()

    const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
        // Only trigger on main content, not toolbar
        const target = e.target as HTMLElement
        if (target.closest('.performance-toolbar')) return

        const x = 'touches' in e ? e.touches[0].clientX : e.clientX
        const width = window.innerWidth

        // Find the PDF container to scroll
        const container = document.querySelector('.react-pdf__Document')?.parentElement
        if (!container) return

        if (x < width * 0.25) {
            // Tap Left: Scroll Up (Previous Page)
            container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
        } else if (x > width * 0.75) {
            // Tap Right: Scroll Down (Next Page)
            container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
        }
    }

    const bind = useDrag(({ swipe: [swipeX] }) => {
        if (swipeX === -1) {
            const next = nextSong()
            if (next) window.history.pushState(null, '', `/perform/${next.fileId}`)
        } else if (swipeX === 1) {
            const prev = prevSong()
            if (prev) window.history.pushState(null, '', `/perform/${prev.fileId}`)
        }
    }, {
        axis: 'x',
        filterTaps: true,
        swipe: {
            duration: 500,
            distance: 30,
            velocity: 0.1
        }
    })

    return (
        <div
            {...bind()}
            onClick={handleTap}
            className="h-screen flex flex-col bg-black text-white relative touch-none select-none"
        >

            {/* Main Content Area (with bottom padding for toolbar) */}
            <div className="flex-1 w-full h-full bg-black overflow-hidden relative pb-16">
                {/* Render Viewer (Edge to Edge) */}
                {fileType === 'musicxml' && fileUrl && <SmartScoreViewer key={fileUrl} url={fileUrl} />}
                {fileType === 'pdf' && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} />}
                {!fileUrl && (
                    <div className="flex w-full h-full items-center justify-center text-zinc-500">
                        No Song Selected
                    </div>
                )}
            </div>

            {/* Unified Performance Toolbar */}
            <div className="performance-toolbar">
                <PerformanceToolbar
                    onHome={onHome}
                    onSetlist={onSetlist}
                />
            </div>
        </div>
    )
}
