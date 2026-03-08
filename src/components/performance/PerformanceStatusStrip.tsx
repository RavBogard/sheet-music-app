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
    const { playbackQueue, queueIndex, transposition, capoFret } = useMusicStore()
    const current = playbackQueue[queueIndex]

    // Only show when there's a queue with multiple songs
    if (!current || playbackQueue.length <= 1) return null

    return (
        <div
            className="fixed top-3 right-3 z-40 pointer-events-none
                material-thin !bg-background/40 rounded-full px-3 py-1.5
                flex items-center gap-2 text-foreground/80 text-xs font-medium
                select-none shadow-lg border-border/10"
            aria-label={`Song ${queueIndex + 1} of ${playbackQueue.length}: ${current.name}`}
            role="status"
            aria-live="polite"
        >
            <span className="tabular-nums opacity-60">{queueIndex + 1}/{playbackQueue.length}</span>
            <span className="truncate max-w-[150px] sm:max-w-[200px] text-foreground/90">{current.name}</span>

            {(current.key || transposition !== 0 || (capoFret && capoFret > 0)) && (
                <div className="flex items-center gap-1.5 ml-1 relative">
                    {current.key && (
                        <span className={transposition !== 0 || capoFret ? "text-foreground/40 line-through" : "text-brand font-semibold"}>
                            {current.key}
                        </span>
                    )}

                    {transposition !== 0 && (
                        <span className="bg-brand/40 text-foreground border border-brand/50 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex items-center leading-none">
                            {transposition > 0 ? '+' : ''}{transposition}
                        </span>
                    )}

                    {capoFret !== null && capoFret > 0 && (
                        <span className="bg-amber-500/30 text-amber-200 border border-amber-500/50 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex items-center leading-none">
                            Capo {capoFret}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
