"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, ArrowDown, Hand } from "lucide-react"

const STORAGE_KEY = "cr-perform-intro-seen"

export function PerformanceIntro({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={onDismiss}
        >
            <div className="max-w-xs space-y-6 text-center" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white">Performance Mode</h2>

                <div className="space-y-4">
                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                            <ArrowLeft className="w-5 h-5" />
                        </div>
                        <div className="text-left text-sm">
                            <span className="font-medium text-white">Swipe left</span> for next song
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                            <ArrowRight className="w-5 h-5" />
                        </div>
                        <div className="text-left text-sm">
                            <span className="font-medium text-white">Swipe right</span> for previous song
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                            <Hand className="w-5 h-5" />
                        </div>
                        <div className="text-left text-sm">
                            <span className="font-medium text-white">Tap center</span> to show/hide toolbar
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-zinc-300">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                            <ArrowDown className="w-5 h-5" />
                        </div>
                        <div className="text-left text-sm">
                            <span className="font-medium text-white">Pull down</span> to exit
                        </div>
                    </div>
                </div>

                <button
                    onClick={onDismiss}
                    className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                >
                    Got it
                </button>
            </div>
        </div>
    )
}

/**
 * Hook to manage one-time intro display.
 * Returns [showIntro, dismissIntro].
 */
export function usePerformanceIntro(): [boolean, () => void] {
    const [show, setShow] = useState(false)

    useEffect(() => {
        try {
            if (!localStorage.getItem(STORAGE_KEY)) {
                setShow(true)
            }
        } catch { /* SSR or no localStorage */ }
    }, [])

    const dismiss = () => {
        setShow(false)
        try { localStorage.setItem(STORAGE_KEY, "1") } catch { /* noop */ }
    }

    return [show, dismiss]
}
