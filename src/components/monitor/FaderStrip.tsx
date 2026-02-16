"use client"

import { useCallback, useRef } from "react"
import { Volume2, VolumeX } from "lucide-react"

interface FaderStripProps {
    label: string
    value: number       // 0.0 – 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onToggle?: (on: boolean) => void
}

/** Convert 0.0-1.0 float to dB display (-∞ to +10) */
function floatToDb(value: number): string {
    if (value <= 0.0001) return "-∞"
    // X32 fader law is roughly logarithmic
    // 0.75 ≈ 0dB, 1.0 ≈ +10dB
    const db = 40 * Math.log10(value) - 10 * Math.log10(0.75)
    if (db < -60) return "-∞"
    return `${db > 0 ? "+" : ""}${db.toFixed(0)}`
}

export function FaderStrip({ label, value, on, isMaster, onChange, onToggle }: FaderStripProps) {
    const isDragging = useRef(false)
    const sliderRef = useRef<HTMLDivElement>(null)

    const updateFromPointer = useCallback((clientX: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        onChange(ratio)
    }, [onChange])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        isDragging.current = true
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
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
    const dbDisplay = floatToDb(value)

    return (
        <div className={`flex items-center gap-3 py-2 px-1 rounded-lg transition-opacity ${
            !on ? "opacity-40" : ""
        }`}>
            {/* Mute toggle */}
            {onToggle && (
                <button
                    onClick={() => onToggle(!on)}
                    className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                        on
                            ? "text-foreground hover:bg-muted"
                            : "text-red-500 bg-red-500/10"
                    }`}
                >
                    {on ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
            )}

            {/* Label */}
            <div className={`shrink-0 text-sm truncate ${
                isMaster ? "font-bold w-20" : "w-28 text-muted-foreground"
            }`}>
                {label}
            </div>

            {/* Slider track */}
            <div
                ref={sliderRef}
                className="flex-1 relative h-10 cursor-pointer touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                {/* Background */}
                <div className="absolute inset-y-2 inset-x-0 rounded-full bg-muted" />

                {/* Fill */}
                <div
                    className={`absolute inset-y-2 left-0 rounded-full transition-[width] duration-75 ${
                        isMaster
                            ? "bg-violet-500"
                            : "bg-blue-500"
                    }`}
                    style={{ width: `${percentage}%` }}
                />

                {/* Thumb */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 shadow-md transition-[left] duration-75 ${
                        isMaster
                            ? "bg-violet-600 border-violet-300"
                            : "bg-blue-600 border-blue-300"
                    }`}
                    style={{ left: `calc(${percentage}% - 10px)` }}
                />
            </div>

            {/* dB display */}
            <div className="shrink-0 w-12 text-right text-xs font-mono text-muted-foreground">
                {dbDisplay}
            </div>
        </div>
    )
}
