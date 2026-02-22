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
import { ChartSuggestions } from "@/components/music/ChartSuggestions"
import { useAuth } from "@/lib/auth-context"

const PDFViewer = dynamic(() => import("@/components/music/PDFViewer").then(mod => mod.PDFViewer), { ssr: false })
const SmartScoreViewer = dynamic(() => import("@/components/music/SmartScoreViewer").then(mod => mod.SmartScoreViewer), { ssr: false })

interface PerformerViewProps {
    fileType: FileType | null
    fileUrl: string | null
    onHome: () => void
}

export function PerformerView({ fileType, fileUrl, onHome }: PerformerViewProps) {
    const { nextSong, prevSong, aiXmlContent, zoom, playbackQueue, queueIndex } = useMusicStore()
    const { isAdmin, isBandLeader } = useAuth()
    const isAnnotating = useAnnotationStore(s => s.isAnnotating)
    const [barsVisible, setBarsVisible] = useState(true)
    const router = useRouter()
    const viewRef = useRef<HTMLDivElement>(null)
    const autoHideRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)

    // ── CSS transition state for page changes ──
    const [animState, setAnimState] = useState<'enter' | 'visible'>('visible')
    const prevFileUrl = useRef(fileUrl)

    useEffect(() => {
        if (fileUrl !== prevFileUrl.current) {
            setAnimState('enter')
            prevFileUrl.current = fileUrl
            // Trigger reflow then animate in
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setAnimState('visible'))
            })
        }
    }, [fileUrl])

    // ── Single source of truth for toolbar visibility ──
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

    // ── Tap anywhere to toggle bars ──
    const handleContentTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (isAnnotating) return
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('.performance-toolbar') || target.closest('[role="dialog"]')) return

        toggleBars()
    }, [isAnnotating, toggleBars])

    // ── Touch-based swipe detection (replaces framer-motion drag) ──
    const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (isAnnotating || zoom > 1.1) return
        const touch = e.touches[0]
        touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() }
    }, [isAnnotating, zoom])

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (!touchStartRef.current || isAnnotating || zoom > 1.1) return
        const touch = e.changedTouches[0]
        const dx = touch.clientX - touchStartRef.current.x
        const dy = touch.clientY - touchStartRef.current.y
        const dt = Date.now() - touchStartRef.current.t
        touchStartRef.current = null

        // Only trigger if horizontal swipe is dominant and fast enough
        if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7 || dt > 500) return

        if (dx < -50) {
            const next = nextSong()
            if (next) router.push(`/perform/${next.fileId}`)
        } else if (dx > 50) {
            const prev = prevSong()
            if (prev) router.push(`/perform/${prev.fileId}`)
        }
    }, [isAnnotating, zoom, nextSong, prevSong, router])

    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground relative">

            {/* Always-visible song position — persists even when toolbar is hidden */}
            <PerformanceStatusStrip />

            {/* Main Content Area — CSS transition + touch swipe */}
            <div
                key={fileUrl || 'empty'}
                ref={viewRef}
                className="flex-1 w-full h-full bg-background overflow-hidden relative"
                style={{
                    opacity: animState === 'enter' ? 0 : 1,
                    transform: animState === 'enter' ? 'translateX(30px)' : 'translateX(0)',
                    transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
                }}
                onClick={handleContentTap}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {(fileType === 'musicxml' || aiXmlContent) && fileUrl && <SmartScoreViewer key={aiXmlContent ? 'ai-content' : fileUrl} url={fileUrl || ''} />}
                {fileType === 'pdf' && !aiXmlContent && fileUrl && <PDFViewer key={fileUrl} url={fileUrl} trackName={playbackQueue[queueIndex]?.name} />}

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
                                <p className="text-xl font-semibold">There's no chart set for this song.</p>
                                <p className="text-sm">You can still use the Next/Prev arrows to continue the service.</p>
                                <div className="flex gap-4 mt-6">
                                    {(isAdmin || isBandLeader) && (
                                        <button
                                            onClick={() => router.push('/library')}
                                            className="px-6 py-2 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20"
                                        >
                                            Assign a chart
                                        </button>
                                    )}
                                    <button
                                        onClick={onHome}
                                        className="px-6 py-2 bg-zinc-800 text-white rounded-full font-medium hover:bg-zinc-700 transition-colors border border-zinc-700"
                                    >
                                        Go Back
                                    </button>
                                </div>
                                <ChartSuggestions trackName={playbackQueue[queueIndex]?.name} />
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Performance Toolbar — single visibility source */}
            <div
                className={`performance-toolbar pb-safe fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ${barsVisible ? 'translate-y-0' : 'translate-y-[120%]'}`}
                style={{ transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                <PerformanceToolbar
                    onHome={onHome}
                    onMenuOpenChange={setMenuOpen}
                />
            </div>
        </div>
    )
}
