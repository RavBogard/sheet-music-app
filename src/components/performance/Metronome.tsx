"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface MetronomeProps {
    bpm: number
    className?: string
}

export function Metronome({ bpm, className }: MetronomeProps) {
    const [isActive, setIsActive] = useState(false)
    const [isBeat, setIsBeat] = useState(false) // Triggered on every beat
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const stopTimerRef = useRef<NodeJS.Timeout | null>(null)

    const intervalMs = 60000 / Math.max(bpm, 1) // Prevent division by zero

    const stop = () => {
        setIsActive(false)
        setIsBeat(false)
        if (timerRef.current) clearInterval(timerRef.current)
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
    }

    const start = () => {
        if (isActive) {
            stop()
            return // Toggle behavior
        }

        setIsActive(true)

        // First beat immediately
        setIsBeat(true)
        setTimeout(() => setIsBeat(false), 100)

        // Loop beats
        timerRef.current = setInterval(() => {
            setIsBeat(true)
            setTimeout(() => setIsBeat(false), 100) // Flash duration
        }, intervalMs)

        // Stop after 10 seconds
        stopTimerRef.current = setTimeout(() => {
            stop()
        }, 10000)
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current)
        }
    }, [])

    return (
        <button
            onClick={(e) => {
                e.stopPropagation()
                start()
            }}
            className={cn(
                "relative overflow-hidden px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors select-none",
                isActive ? "bg-white/10 text-white/90 ring-1 ring-white/20" : "bg-muted/50 text-muted-foreground hover:bg-muted/80",
                className
            )}
            title={`Flash tempo (${bpm} BPM)`}
            type="button"
        >
            {/* The visible pulsing element */}
            <div
                className={cn(
                    "absolute inset-0 bg-white transition-opacity duration-75",
                    isBeat ? "opacity-30" : "opacity-0"
                )}
            />
            {/* Label inside */}
            <span className="relative z-10 flex items-center gap-1">
                <span className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    isActive ? "bg-green-400 shadow-[0_0_4px_#4ade80cc]" : "bg-muted-foreground/30"
                )} />
                {bpm} BPM
            </span>
        </button>
    )
}
