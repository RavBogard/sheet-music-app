"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import type { LiveState } from "@/lib/setlist-live"

export interface SwapToastProps {
    liveState: LiveState | undefined
}

/**
 * Shows a toast notification when a live swap occurs.
 * Only shown to users who did NOT initiate the swap.
 * Auto-dismisses after 4 seconds.
 * Deduplicates via swapId to prevent re-showing on re-renders.
 */
export function SwapToast({ liveState }: SwapToastProps) {
    const { user } = useAuth()
    const [visible, setVisible] = useState(false)
    const [message, setMessage] = useState("")
    const lastSwapId = useRef<string | null>(null)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const swap = liveState?.lastSwap
        if (!swap || !user) return

        // Skip if we initiated this swap
        if (swap.swappedBy === user.uid) return

        // Skip if we already showed this swap
        if (swap.swapId === lastSwapId.current) return

        lastSwapId.current = swap.swapId
        setMessage(`\u201C${swap.previousTitle}\u201D swapped to \u201C${swap.newTitle}\u201D`)
        setVisible(true)

        // Auto-dismiss after 4s
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setVisible(false), 4000)

        return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    }, [liveState?.lastSwap, user])

    if (!visible) return null

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm animate-in fade-in slide-in-from-top duration-300"
        >
            <div className="bg-amber-500/90 text-black px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-center">
                {message}
            </div>
        </div>
    )
}
