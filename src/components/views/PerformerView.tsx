"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { useDrag } from '@use-gesture/react'
import { Loader2 } from 'lucide-react'
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
    const { nextSong, prevSong, aiXmlContent, zoom, playbackQueue, queueIndex } = useMusicStore()
    const [toolbarVisible, setToolbarVisible] = useState(true)
    const router = useRouter()

    // Ref for the content container to apply rubberbanding transform
    const viewRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleToggle = () => setToolbarVisible(prev => !prev)
        window.addEventListener('toggle-toolbar', handleToggle)
        // Prevent default touch actions (history nav, etc.)
        document.body.style.touchAction = 'pan-y'
        return () => {
            window.removeEventListener('toggle-toolbar', handleToggle)
            document.body.style.touchAction = 'auto'
        }
    }, [])

    const bind = useDrag(({ active, movement: [mx, my], velocity: [vx, vy], tap, cancel, event, last, initial: [, startY] }) => {
        // 1. Zoom Guard: If zoomed in significantly, disable swipe nav to allow panning
        // We use a small tolerance (1.1) to allow for "fit width" variations which might be slightly > 1
        if (zoom > 1.1) return

        // 2. Tap Handling (Toggle Toolbar)
        if (tap) {
            const e = event as unknown as React.PointerEvent & { changedTouches?: TouchList }
            const target = e.target as HTMLElement
            // Ignore taps on toolbar or interactive elements
            if (target.closest('.performance-toolbar') || target.closest('button')) return

            // Simple center tap toggle? Or keep the side-zones?
            // User feedback suggests simple toggle is often preferred, but let's keep the side-zones logic if they liked it.
            // Actually, "Inconsistent" suggests simple might be better. 
            // Let's stick to the previous side-zone logic but clean it up.

            const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
            const width = window.innerWidth

            if (x < width * 0.25) {
                // Scroll Up / Prev Page (internal PDF logic handles this mostly, but if we want manual scroll:)
                const container = document.querySelector('.react-pdf__Document')?.parentElement
                if (container) container.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
            } else if (x > width * 0.75) {
                // Scroll Down / Next Page
                const container = document.querySelector('.react-pdf__Document')?.parentElement
                if (container) container.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
            } else {
                setToolbarVisible(v => !v)
            }
            return
        }

        // 3. Swipe Down from Top to Exit Performance Mode
        const isVerticalDown = my > 0 && Math.abs(my) > Math.abs(mx) * 1.5
        const startedFromTop = startY < window.innerHeight * 0.2

        if (last && isVerticalDown && startedFromTop && my > 120 && vy > 0.3) {
            if (viewRef.current) {
                viewRef.current.style.transform = `translateY(100%)`
                viewRef.current.style.transition = 'transform 0.3s ease-out'
            }
            const { returnPath } = useMusicStore.getState()
            setTimeout(() => onHome(), 250)
            return
        }

        if (active && isVerticalDown && startedFromTop) {
            if (viewRef.current) {
                viewRef.current.style.transform = `translateY(${Math.max(0, my * 0.5)}px)`
                viewRef.current.style.transition = 'none'
                viewRef.current.style.opacity = `${Math.max(0.3, 1 - my / 400)}`
            }
            return
        }

        // 4. Swipe / Drag Logic (horizontal)
        if (active) {
            if (Math.abs(mx) > Math.abs(my)) {
                if (viewRef.current) {
                    viewRef.current.style.transform = `translateX(${mx}px)`
                    viewRef.current.style.transition = 'none'
                    viewRef.current.style.opacity = '1'
                }
            }
        } else if (last) {
            // Drag End - Determine Action
            const width = window.innerWidth
            const hDrag = Math.abs(mx) > Math.abs(my)
            const isFlick = vx > 0.5 && Math.abs(mx) > 50 // Fast flick
            const isBigDrag = Math.abs(mx) > width * 0.25 // Dragged > 25% of screen

            if (hDrag && (isFlick || isBigDrag)) {
                // Trigger Navigation
                if (mx < 0) {
                    // Swiped Left -> Next Song
                    const next = nextSong()
                    if (next) {
                        // Animate out completely? Or just router push? 
                        // Router push is safer, React will unmount.
                        if (viewRef.current) {
                            viewRef.current.style.transform = `translateX(-100%)`
                            viewRef.current.style.transition = 'transform 0.2s ease-out'
                        }
                        setTimeout(() => router.push(`/perform/${next.fileId}`), 200)
                    } else {
                        // End of list bounce
                        snapBack()
                    }
                } else {
                    // Swiped Right -> Prev Song
                    const prev = prevSong()
                    if (prev) {
                        if (viewRef.current) {
                            viewRef.current.style.transform = `translateX(100%)`
                            viewRef.current.style.transition = 'transform 0.2s ease-out'
                        }
                        setTimeout(() => router.push(`/perform/${prev.fileId}`), 200)
                    } else {
                        snapBack()
                    }
                }
            } else {
                // Cancel / Snap Back
                snapBack()
            }
        }
    }, {
        filterTaps: true,
        rubberband: true, // Use gesture's internal rubberband calc for bounds if needed, but we do manual
        axis: undefined, // IMPORTANT: Unlocked axis to allow diagonal thumb movement
    })

    const snapBack = () => {
        if (viewRef.current) {
            viewRef.current.style.transform = 'translateX(0px) translateY(0px) scale(1)'
            viewRef.current.style.opacity = '1'
            viewRef.current.style.transition = 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }
    }

    return (
        <div
            {...bind()}
            className="h-[100dvh] flex flex-col bg-black text-white relative touch-action-pan-y" // CSS Class for touch-action
            style={{ touchAction: 'pan-y' }} // Inline style to be absolutely sure
        >

            {/* Main Content Area - Ref for sliding */}
            <div
                ref={viewRef}
                className="flex-1 w-full h-full bg-zinc-900 overflow-hidden relative touch-pan-y"
            >
                {/* Render Viewer (Edge to Edge) */}
                {(fileType === 'musicxml' || aiXmlContent) && fileUrl && <SmartScoreViewer key={aiXmlContent ? 'ai-content' : fileUrl} url={fileUrl || ''} />}
                {fileType === 'pdf' && !aiXmlContent && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} />}

                {!fileUrl && (
                    <div className="flex flex-col w-full h-full items-center justify-center text-zinc-500 gap-4">
                        {/* Show loading state if we're expecting a file (queue exists), otherwise show No Chart */}
                        {playbackQueue.length > 0 && queueIndex >= 0 ? (
                            <>
                                <div className="animate-pulse flex flex-col items-center gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
                                    <p className="text-lg font-medium text-zinc-400">
                                        Loading
                                    </p>
                                    <p className="text-sm text-zinc-500 italic">
                                        {playbackQueue[queueIndex]?.name || ""}
                                    </p>
                                </div>
                                {/* Skeleton blocks */}
                                <div className="w-64 space-y-3 mt-4">
                                    <div className="h-3 bg-zinc-800 rounded-full w-full animate-pulse" />
                                    <div className="h-3 bg-zinc-800 rounded-full w-5/6 animate-pulse" />
                                    <div className="h-3 bg-zinc-800 rounded-full w-4/6 animate-pulse" />
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-xl font-semibold">No Chart Available</p>
                                <p className="text-sm">This track doesn&apos;t have a linked file.</p>
                                <button onClick={onHome} className="mt-4 px-6 py-2 bg-zinc-800 rounded-full text-white hover:bg-zinc-700">
                                    Go Home
                                </button>
                            </>
                        )}
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
