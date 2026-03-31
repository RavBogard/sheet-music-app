"use client"

import { ArrowLeftRight } from "lucide-react"
import type { SetlistTrack } from "@/types/models"

export interface SwapButtonProps {
    track: SetlistTrack
    hasAlternatives: boolean
    onSwapTap: () => void
}

/**
 * Small icon button shown on eligible SetlistRow items during live mode.
 * Only rendered when:
 *   1. User has canSwap permission
 *   2. Live mode is enabled
 *   3. Track has a liturgicalSlot with alternatives
 */
export function SwapButton({ track, hasAlternatives, onSwapTap }: SwapButtonProps) {
    if (!hasAlternatives) return null

    return (
        <button
            onClick={(e) => {
                e.stopPropagation()
                onSwapTap()
            }}
            className="ml-2 p-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 active:bg-amber-500/40 transition-colors duration-200 shrink-0 touch-manipulation cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label={`Swap ${track.title}`}
            title="Swap with alternative"
        >
            <ArrowLeftRight className="w-5 h-5" />
        </button>
    )
}
