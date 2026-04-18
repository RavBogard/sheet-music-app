"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface TempoFlashProps {
    bpm: number
    onDismiss: () => void
}

/**
 * Visual tempo flash overlay that appears for ~10 seconds when entering a new track.
 * Shows a large BPM number with a pulsing beat indicator so musicians can
 * internalize the tempo before playing. Tap anywhere to dismiss early.
 */
export function TempoFlash({ bpm, onDismiss }: TempoFlashProps) {
    const [isBeat, setIsBeat] = useState(false)
    const [fading, setFading] = useState(false)
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const beatOffTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Check for reduced motion preference
    const [reducedMotion, setReducedMotion] = useState(false)
    useEffect(() => {
        setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    }, [])

    // Beat pulse interval
    useEffect(() => {
        if (reducedMotion) return

        const intervalMs = 60000 / bpm
        intervalRef.current = setInterval(() => {
            setIsBeat(true)
            if (beatOffTimeoutRef.current) clearTimeout(beatOffTimeoutRef.current)
            beatOffTimeoutRef.current = setTimeout(() => setIsBeat(false), 100)
        }, intervalMs)

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current)
            if (beatOffTimeoutRef.current) clearTimeout(beatOffTimeoutRef.current)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bpm])

    // Auto-dismiss after ~10 seconds (fade at 9.7s, remove at 10s).
    // A ref keeps the LATEST onDismiss callback so a parent prop-swap
    // mid-flight still invokes the new handler — and crucially the effect
    // does not re-register (which would reset the 10-s countdown).
    const onDismissRef = useRef(onDismiss)
    useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])

    useEffect(() => {
        fadeTimeoutRef.current = setTimeout(() => setFading(true), 9700)
        timeoutRef.current = setTimeout(() => onDismissRef.current(), 10000)

        return () => {
            if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current)
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
        }
    }, [])

    return (
        <div
            className={cn(
                "absolute inset-0 z-40 flex items-center justify-center transition-opacity duration-300",
                fading ? "opacity-0" : "opacity-100"
            )}
            onClick={onDismiss}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
                    onDismiss()
                }
            }}
            aria-label={`Tempo: ${bpm} BPM. Tap to dismiss.`}
        >
            <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-8 flex flex-col items-center gap-4">
                <span className="text-6xl lg:text-7xl font-bold text-foreground tabular-nums">
                    {bpm}
                </span>
                <span className="text-lg text-muted-foreground font-semibold uppercase tracking-widest">
                    BPM
                </span>
                <div
                    className={cn(
                        "rounded-full transition-all duration-75 shrink-0",
                        reducedMotion
                            ? "h-5 w-5 bg-brand"
                            : isBeat
                                ? "h-6 w-6 bg-brand shadow-[0_0_20px_var(--brand)] scale-110"
                                : "h-4 w-4 bg-brand/40"
                    )}
                />
            </div>
        </div>
    )
}
