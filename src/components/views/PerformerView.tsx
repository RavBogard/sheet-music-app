"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
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
    const { nextSong, prevSong, aiXmlContent } = useMusicStore()

    // ... (rest of code) ...

    return (
        <div
            {...bind()}
            onClick={handleTap}
            // Allow native touch actions for vertical scroll, but capture horizontal via useDrag
            style={{ touchAction: 'pan-y' }}
            className="h-screen flex flex-col bg-black text-white relative"
        >

            {/* Main Content Area (with bottom padding for toolbar) */}
            <div className="flex-1 w-full h-full bg-black overflow-hidden relative pb-16">
                {/* Render Viewer (Edge to Edge) */}
                {/* IF MusicXML OR AI Content is present, use SmartScoreViewer */}
                {(fileType === 'musicxml' || aiXmlContent) && <SmartScoreViewer key={aiXmlContent ? 'ai-content' : fileUrl} url={fileUrl || ''} />}

                {/* ELSE IF PDF and NO AI Content, use PDFViewer */}
                {fileType === 'pdf' && !aiXmlContent && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} />}

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
