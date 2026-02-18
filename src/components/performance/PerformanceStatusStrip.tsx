"use client"

import { useMusicStore } from "@/lib/store"

/**
 * A minimal, non-interactive status pill that persists even when the
 * performance toolbar is hidden. Shows song position and transposed key
 * at a glance — like the song number penciled at the top of a paper chart.
 *
 * pointer-events-none ensures it never interferes with tap/swipe gestures.
 */
export function PerformanceStatusStrip() {
    const { playbackQueue, queueIndex, transposition } = useMusicStore()
    const current = playbackQueue[queueIndex]

    // Only show when there's a queue with multiple songs
    if (!current || playbackQueue.length <= 1) return null

    return (
        <div
            className="fixed top-3 right-3 z-40 pointer-events-none
                bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5
                flex items-center gap-2 text-white/70 text-xs font-medium
                select-none"
            aria-label={`Song ${queueIndex + 1} of ${playbackQueue.length}: ${current.name}`}
            role="status"
        >
            <span className="tabular-nums">{queueIndex + 1}/{playbackQueue.length}</span>
            <span className="truncate max-w-[200px]">{current.name}</span>
            {current.key && transposition !== 0 && (
                <span className="text-violet-300 font-semibold">in {current.key}</span>
            )}
        </div>
    )
}
