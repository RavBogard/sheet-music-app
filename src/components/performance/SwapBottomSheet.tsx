"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import type { SetlistTrack } from "@/types/models"
import type { SongGroupEntry } from "@/types/song-groups"

export interface SwapBottomSheetProps {
    open: boolean
    onClose: () => void
    currentTrack: SetlistTrack
    alternatives: SongGroupEntry[]
    onConfirmSwap: (alternative: SongGroupEntry) => Promise<void>
}

/**
 * Bottom sheet showing alternative songs for a liturgical slot.
 * 3-tap flow: tap swap icon → sheet opens → tap alternative to swap.
 *
 * Designed for tablets on music stands:
 * - 56px minimum touch targets
 * - Dark mode optimized for stage lighting
 * - touch-manipulation for fast response
 */
export function SwapBottomSheet({
    open,
    onClose,
    currentTrack,
    alternatives,
    onConfirmSwap,
}: SwapBottomSheetProps) {
    const [swapping, setSwapping] = useState(false)

    if (!open) return null

    const handleSwap = async (alt: SongGroupEntry) => {
        setSwapping(true)
        try {
            await onConfirmSwap(alt)
            onClose()
        } catch (e) {
            logger.error("[SwapBottomSheet] Swap failed:", e)
            toast.error("Swap failed — try again")
        } finally {
            setSwapping(false)
        }
    }

    const slotLabel = currentTrack.liturgicalSlot || currentTrack.title

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Sheet */}
            <div
                role="dialog"
                aria-label={`Swap ${slotLabel}`}
                className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] flex flex-col bg-card border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200"
            >
                {/* Header */}
                <div className="px-4 py-3 border-b border-border">
                    <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-2" />
                    <h3 className="text-lg font-semibold text-foreground">
                        Swap: {slotLabel}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Currently:{" "}
                        <span className="text-foreground">{currentTrack.title}</span>
                        {currentTrack.key && (
                            <span className="ml-1 font-mono text-brand">
                                ({currentTrack.key})
                            </span>
                        )}
                    </p>
                </div>

                {/* Alternatives list */}
                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {alternatives.map((alt) => (
                        <button
                            key={alt.fileId}
                            onClick={() => handleSwap(alt)}
                            disabled={swapping}
                            className={cn(
                                "w-full flex items-center justify-between px-4 py-3 rounded-xl mb-1",
                                "hover:bg-brand/10 active:bg-brand/20 transition-colors duration-200",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "touch-manipulation cursor-pointer",
                                "focus:outline-none focus:ring-2 focus:ring-brand/50"
                            )}
                            style={{ minHeight: 56 }}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="text-base font-medium text-foreground truncate">
                                    {alt.title}
                                </span>
                                {alt.key && (
                                    <span className="font-mono text-sm font-bold px-2 py-0.5 bg-brand/15 text-brand rounded-lg shrink-0">
                                        {alt.key}
                                    </span>
                                )}
                            </div>
                            <span className="text-sm font-semibold text-amber-400 shrink-0 ml-3">
                                Swap Now
                            </span>
                        </button>
                    ))}

                    {alternatives.length === 0 && (
                        <p className="text-center text-muted-foreground py-8">
                            No alternatives available for this slot.
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-border">
                    <button
                        onClick={onClose}
                        className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-muted-foreground/50 rounded-lg"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </>
    )
}
