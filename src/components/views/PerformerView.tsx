"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2 } from 'lucide-react'
import { useMusicStore } from '@/lib/store'
import { useAnnotationStore } from '@/lib/annotation-store'
import { PerformanceToolbar } from "@/components/performance/PerformanceToolbar"
import { PerformanceStatusStrip } from "@/components/performance/PerformanceStatusStrip"
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
    const isAnnotating = useAnnotationStore(s => s.isAnnotating)
    const [barsVisible, setBarsVisible] = useState(true)
    const router = useRouter()
    const viewRef = useRef<HTMLDivElement>(null)
    const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)

    // ── Single source of truth for toolbar visibility ──
    const _showBars = useCallback(() => {
        setBarsVisible(true)
        // Reset auto-hide timer
        if (autoHideRef.current) clearTimeout(autoHideRef.current)
        autoHideRef.current = setTimeout(() => {
            if (!menuOpen) setBarsVisible(false)
        }, 8000)
    }, [menuOpen])

    const toggleBars = useCallback(() => {
        setBarsVisible(prev => {
            const next = !prev
            if (autoHideRef.current) clearTimeout(autoHideRef.current)
            if (next && !menuOpen) {
                autoHideRef.current = setTimeout(() => setBarsVisible(false), 8000)
            }
            return next
        })
    }, [menuOpen])

    // Keep bars visible while a menu/popover is open
    useEffect(() => {
        if (menuOpen) {
            setBarsVisible(true)
            if (autoHideRef.current) clearTimeout(autoHideRef.current)
        }
    }, [menuOpen])

    // Initial auto-hide
    useEffect(() => {
        autoHideRef.current = setTimeout(() => {
            if (!menuOpen) setBarsVisible(false)
        }, 8000)
        return () => { if (autoHideRef.current) clearTimeout(autoHideRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount auto-hide only
    }, [])

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return

            switch (e.key) {
                case 'ArrowRight':
                case 'PageDown': {
                    e.preventDefault()
                    const el = viewRef.current
                    if (el) {
                        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
                        if (atBottom && playbackQueue.length > 1) {
                            const next = nextSong()
                            if (next) router.push(`/perform/${next.fileId}`)
                        } else {
                            // Snap to next page boundary for instant, readable page turns
                            const pages = el.querySelectorAll('.pdf-page, [data-page-number]')
                            if (pages.length > 0) {
                                let snapped = false
                                for (const page of pages) {
                                    const pageTop = (page as HTMLElement).offsetTop - el.offsetTop
                                    if (pageTop > el.scrollTop + 10) {
                                        el.scrollTo({ top: pageTop, behavior: 'instant' })
                                        snapped = true
                                        break
                                    }
                                }
                                // Fallback: if no page boundary found, scroll by viewport
                                if (!snapped) {
                                    el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'instant' })
                                }
                            } else {
                                el.scrollBy({ top: el.clientHeight * 0.85, behavior: 'instant' })
                            }
                        }
                    }
                    break
                }
                case 'ArrowLeft':
                case 'PageUp': {
                    e.preventDefault()
                    const el = viewRef.current
                    if (el) {
                        const atTop = el.scrollTop <= 20
                        if (atTop && playbackQueue.length > 1) {
                            const prev = prevSong()
                            if (prev) router.push(`/perform/${prev.fileId}`)
                        } else {
                            // Snap to previous page boundary
                            const pages = el.querySelectorAll('.pdf-page, [data-page-number]')
                            if (pages.length > 0) {
                                let snapped = false
                                const pagesArr = Array.from(pages).reverse()
                                for (const page of pagesArr) {
                                    const pageTop = (page as HTMLElement).offsetTop - el.offsetTop
                                    if (pageTop < el.scrollTop - 10) {
                                        el.scrollTo({ top: pageTop, behavior: 'instant' })
                                        snapped = true
                                        break
                                    }
                                }
                                if (!snapped) {
                                    el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'instant' })
                                }
                            } else {
                                el.scrollBy({ top: -el.clientHeight * 0.85, behavior: 'instant' })
                            }
                        }
                    }
                    break
                }
                case 'Escape':
                    onHome()
                    break
                case ' ':
                    e.preventDefault()
                    toggleBars()
                    break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [playbackQueue, nextSong, prevSong, router, onHome, toggleBars])

    // ── Swipe navigation — anywhere on the page ──
    const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
    const didSwipeRef = useRef(false)

    const handleSwipeStart = useCallback((e: React.TouchEvent) => {
        if (isAnnotating) return // Let annotation layer handle touches
        const touch = e.touches[0]
        swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
        didSwipeRef.current = false
    }, [isAnnotating])

    const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
        if (isAnnotating) return
        if (!swipeStartRef.current) return
        const touch = e.changedTouches[0]

        const dx = touch.clientX - swipeStartRef.current.x
        const dy = touch.clientY - swipeStartRef.current.y
        const dt = Date.now() - swipeStartRef.current.time
        swipeStartRef.current = null

        // Must be horizontal, fast enough, and far enough
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2 || dt > 800) return

        // Don't navigate if zoomed in
        if (zoom > 1.1) return

        // Mark that this touch was a swipe (so tap handler ignores it)
        didSwipeRef.current = true

        if (dx < 0) {
            // Swiped left → next song
            const next = nextSong()
            if (next) {
                if (viewRef.current) {
                    viewRef.current.style.transform = 'translateX(-100%)'
                    viewRef.current.style.transition = 'transform 0.25s ease-out'
                }
                setTimeout(() => router.push(`/perform/${next.fileId}`), 200)
            }
        } else {
            // Swiped right → prev song
            const prev = prevSong()
            if (prev) {
                if (viewRef.current) {
                    viewRef.current.style.transform = 'translateX(100%)'
                    viewRef.current.style.transition = 'transform 0.25s ease-out'
                }
                setTimeout(() => router.push(`/perform/${prev.fileId}`), 200)
            }
        }
    }, [isAnnotating, zoom, nextSong, prevSong, router])

    // ── Tap anywhere to toggle bars ──
    // Distinguished from swipes by checking didSwipeRef
    const handleContentTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (isAnnotating) return // Let annotation layer handle taps
        const target = e.target as HTMLElement
        // Ignore taps on interactive elements
        if (target.closest('button') || target.closest('.performance-toolbar') || target.closest('[role="dialog"]')) return

        // If this was a swipe, don't toggle
        if (didSwipeRef.current) {
            didSwipeRef.current = false
            return
        }

        toggleBars()
    }, [isAnnotating, toggleBars])

    return (
        <div className="h-[100dvh] flex flex-col bg-black text-white relative">

            {/* Always-visible song position — persists even when toolbar is hidden */}
            <PerformanceStatusStrip />

            {/* Main Content Area — swipe anywhere + tap anywhere */}
            <div
                ref={viewRef}
                className="flex-1 w-full h-full bg-zinc-900 overflow-hidden relative"
                onClick={handleContentTap}
                onTouchStart={handleSwipeStart}
                onTouchEnd={handleSwipeEnd}
            >
                {(fileType === 'musicxml' || aiXmlContent) && fileUrl && <SmartScoreViewer key={aiXmlContent ? 'ai-content' : fileUrl} url={fileUrl || ''} />}
                {fileType === 'pdf' && !aiXmlContent && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} />}

                {!fileUrl && (
                    <div className="flex flex-col w-full h-full items-center justify-center text-zinc-500 gap-4">
                        {playbackQueue.length > 0 && queueIndex >= 0 ? (
                            <>
                                <div className="animate-pulse flex flex-col items-center gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-zinc-600" />
                                    <p className="text-lg font-medium text-zinc-400">Loading</p>
                                    <p className="text-sm text-zinc-500 italic">{playbackQueue[queueIndex]?.name || ""}</p>
                                </div>
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

            {/* Performance Toolbar — single visibility source */}
            <div className={`performance-toolbar fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ${barsVisible ? 'translate-y-0' : 'translate-y-full'}`}>
                <PerformanceToolbar
                    onHome={onHome}
                    onSetlist={onSetlist}
                    onMenuOpenChange={setMenuOpen}
                />
            </div>
        </div>
    )
}
