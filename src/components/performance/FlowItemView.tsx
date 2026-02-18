"use client"

import { useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useMusicStore } from "@/lib/store"
import { ServiceFlowCard } from "@/components/performance/ServiceFlowCard"
import { PerformanceStatusStrip } from "@/components/performance/PerformanceStatusStrip"
import { PerformanceToolbar } from "@/components/performance/PerformanceToolbar"

/**
 * Full-screen wrapper for non-song items (readings, prayers, headers, etc.)
 * that provides the same navigation as PerformerView: keyboard (foot pedal),
 * swipe, and toolbar controls.
 */
export function FlowItemView({
    onHome,
    onSetlist,
}: {
    onHome: () => void
    onSetlist: () => void
}) {
    const router = useRouter()
    const { playbackQueue, queueIndex, nextSong, prevSong } = useMusicStore()
    const currentTrack = playbackQueue[queueIndex]

    // Swipe state
    const swipeRef = useRef<{ x: number; y: number; time: number } | null>(null)

    const navigateNext = useCallback(() => {
        const next = nextSong()
        if (next) router.push(`/perform/${next.fileId}`)
    }, [nextSong, router])

    const navigatePrev = useCallback(() => {
        const prev = prevSong()
        if (prev) router.push(`/perform/${prev.fileId}`)
    }, [prevSong, router])

    // Keyboard / foot pedal navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            switch (e.key) {
                case 'ArrowRight':
                case 'PageDown':
                case ' ':
                    e.preventDefault()
                    navigateNext()
                    break
                case 'ArrowLeft':
                case 'PageUp':
                    e.preventDefault()
                    navigatePrev()
                    break
                case 'Escape':
                    onHome()
                    break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigateNext, navigatePrev, onHome])

    // Touch swipe navigation
    const handleTouchStart = (e: React.TouchEvent) => {
        swipeRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY,
            time: Date.now(),
        }
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!swipeRef.current) return
        const dx = swipeRef.current.x - e.changedTouches[0].clientX
        const dy = Math.abs(swipeRef.current.y - e.changedTouches[0].clientY)

        // Horizontal swipe with minimal vertical drift
        if (Math.abs(dx) > 60 && dy < Math.abs(dx) * 0.7) {
            if (dx > 0) navigateNext()
            else navigatePrev()
        }
        swipeRef.current = null
    }

    if (!currentTrack) return null

    return (
        <div
            className="h-[100dvh] flex flex-col bg-black text-white relative"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <PerformanceStatusStrip />

            <div className="flex-1 flex items-center justify-center">
                <ServiceFlowCard
                    item={currentTrack}
                    index={queueIndex}
                    total={playbackQueue.length}
                />
            </div>

            <PerformanceToolbar
                onHome={onHome}
                onSetlist={onSetlist}
            />
        </div>
    )
}
