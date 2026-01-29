"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
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
    const [toolbarVisible, setToolbarVisible] = useState(true)

    useEffect(() => {
        const handleToggle = () => setToolbarVisible(prev => !prev)
        window.addEventListener('toggle-toolbar', handleToggle)
        return () => window.removeEventListener('toggle-toolbar', handleToggle)
    }, [])

    const router = useRouter()

    const bind = useDrag(({ swipe: [swipeX], tap, down, movement: [mx, my], event }) => {
        // Handle Tap (Reliable)
        if (tap) {
            const e = event as any
            const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
            const width = window.innerWidth

            // Check if click was on toolbar
            const target = e.target as HTMLElement
            if (target.closest('.performance-toolbar')) return

            const container = document.querySelector('.react-pdf__Document')?.parentElement
            if (!container) return

            if (x < width * 0.25) {
                container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
            } else if (x > width * 0.75) {
                container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
            } else {
                setToolbarVisible(v => !v)
            }
            return
        }

        // Handle Swipe
        if (swipeX === -1) {
            const next = nextSong()
            if (next) router.push(`/perform/${next.fileId}`)
        } else if (swipeX === 1) {
            const prev = prevSong()
            if (prev) router.push(`/perform/${prev.fileId}`)
        }
    }, {
        axis: 'x',
        filterTaps: true,
        swipe: {
            duration: 800,
            distance: 50,
            velocity: 0.2
        }
    })

    return (
        <div
            {...bind()}
            className="h-[100dvh] flex flex-col bg-black text-white relative"
        >

            {/* Main Content Area */}
            <div className={`flex-1 w-full h-full bg-black overflow-hidden relative transition-all duration-300 ${toolbarVisible ? 'pb-16' : 'pb-0'}`}>
                {/* Render Viewer (Edge to Edge) */}
                {(fileType === 'musicxml' || aiXmlContent) && <SmartScoreViewer key={aiXmlContent ? 'ai-content' : fileUrl} url={fileUrl || ''} />}
                {fileType === 'pdf' && !aiXmlContent && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} />}

                {!fileUrl && (
                    <div className="flex w-full h-full items-center justify-center text-zinc-500">
                        No Song Selected
                    </div>
                )}
            </div>

            {/* Unified Performance Toolbar */}
            <div className={`performance-toolbar fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${toolbarVisible ? 'translate-y-0' : 'translate-y-full'}`}>
                <PerformanceToolbar
                    onHome={onHome}
                    onSetlist={onSetlist}
                />
            </div>
        </div>
    )
}
