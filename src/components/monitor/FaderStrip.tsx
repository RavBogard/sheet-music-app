"use client"

import { useCallback, useRef } from "react"

interface FaderStripProps {
    label: string
    value: number       // 0.0 – 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onUnmuteCheck?: () => void // Optional callback to ensure the channel is unmuted when dragged
}

export function FaderStrip({ label, value, on, isMaster, onChange, onUnmuteCheck }: FaderStripProps) {
    const isDragging = useRef(false)
    const sliderRef = useRef<HTMLDivElement>(null)

    const updateFromPointer = useCallback((clientX: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        onChange(ratio)
        if (onUnmuteCheck && !on) {
            onUnmuteCheck() // Auto-unmute if fader is grabbed but channel is muted
        }
    }, [onChange, onUnmuteCheck, on])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        isDragging.current = true
            ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientX)
    }, [updateFromPointer])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current) return
        updateFromPointer(e.clientX)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        isDragging.current = false
    }, [])

    const percentage = Math.round(value * 100)

    return (
        <div className={`w-full py-1.5 transition-opacity ${!on ? "opacity-50 grayscale" : ""}`}>
            <div
                ref={sliderRef}
                className="relative h-12 w-full rounded-xl bg-zinc-900/80 border border-white/5 overflow-hidden cursor-pointer touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Fill bar */}
                <div
                    className={`absolute inset-y-0 left-0 transition-[width] duration-75 ${isMaster
                            ? "bg-violet-600/60"
                            : "bg-blue-600/50"
                        }`}
                    style={{ width: `${percentage}%` }}
                />

                {/* Content Overlay */}
                <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
                    <span className={`text-sm font-semibold truncate pr-4 ${isMaster ? "text-violet-100" : "text-zinc-200"}`}>
                        {label}
                    </span>
                    <span className="text-xs font-mono font-bold text-zinc-400 shrink-0">
                        {percentage}%
                    </span>
                </div>
            </div>
        </div>
    )
}
