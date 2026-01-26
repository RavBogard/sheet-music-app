"use client"

import dynamic from "next/dynamic"
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

import { useDrag } from '@use-gesture/react'
import { useMusicStore } from '@/lib/store'

// ... existing dynamic imports

export function PerformerView({ fileType, fileUrl, onHome, onSetlist }: PerformerViewProps) {
    const { nextSong, prevSong } = useMusicStore()

    const bind = useDrag(({ swipe: [swipeX] }) => {
        if (swipeX === -1) {
            nextSong()
        } else if (swipeX === 1) {
            prevSong()
        }
    }, {
        axis: 'x',
        filterTaps: true,
        swipe: {
            duration: 2000,
            distance: 50,
            velocity: 0.5
        }
    })

    return (
        <div {...bind()} className="h-screen flex flex-col bg-black text-white relative touch-none">

            {/* Main Content Area (with bottom padding for toolbar) */}
            <div className="flex-1 w-full h-full bg-black overflow-hidden relative pb-16">
                {/* Render Viewer (Edge to Edge) */}
                {fileType === 'musicxml' && fileUrl && <SmartScoreViewer url={fileUrl} />}
                {fileType === 'pdf' && fileUrl && <PDFViewer url={fileUrl} />}
                {!fileUrl && (
                    <div className="flex w-full h-full items-center justify-center text-zinc-500">
                        No Song Selected
                    </div>
                )}
            </div>

            {/* Unified Performance Toolbar */}
            <PerformanceToolbar
                onHome={onHome}
                onSetlist={onSetlist}
            />
        </div>
    )
}
