"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Loader2, Volume2, VolumeX } from "lucide-react"

interface VerticalFaderStripProps {
    label: string
    value: number        // 0.0 - 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onMuteToggle: () => void
}

/**
 * Vertical fader strip for the live monitor popup.
 * Traditional mixer-style vertical layout: label at top, fader in middle, mute at bottom.
 * Uses clientY-based pointer interaction (top=1.0, bottom=0.0).
 */
export function VerticalFaderStrip({ label, value, on, isMaster, onChange, onMuteToggle }: VerticalFaderStripProps) {
    const isDraggingRef = useRef(false)
    const [isDragging, setIsDragging] = useState(false)
    const sliderRef = useRef<HTMLDivElement>(null)
    const lastWriteTime = useRef<number>(0)
    const pendingValue = useRef<number | null>(null)
    const rafRef = useRef<number | null>(null)
    const lastTapTime = useRef<number>(0)

    // UI state for optimistic updates and latency feedback
    const [displayValue, setDisplayValue] = useState(value)
    const [isPending, setIsPending] = useState(false)

    // Sync display value with actual value when not dragging and no pending writes
    useEffect(() => {
        if (!isDraggingRef.current && !isPending) {
            setDisplayValue(value)
        }
    }, [value, isPending])

    // Clear pending state if the value catches up
    useEffect(() => {
        if (isPending && pendingValue.current !== null && Math.abs(value - pendingValue.current) < 0.01) {
            setIsPending(false)
            pendingValue.current = null
        }
    }, [value, isPending])

    // Safety timeout to clear pending state
    useEffect(() => {
        if (isPending) {
            const timer = setTimeout(() => {
                setIsPending(false)
                setDisplayValue(value)
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [isPending, value])

    // Throttle writes to parent (max 10 updates/sec)
    const throttledOnChange = useCallback((val: number) => {
        const now = Date.now()
        if (now - lastWriteTime.current > 100) {
            lastWriteTime.current = now
            pendingValue.current = val
            setIsPending(true)
            onChange(val)
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                lastWriteTime.current = Date.now()
                pendingValue.current = val
                setIsPending(true)
                onChange(val)
            })
        }
    }, [onChange])

    // clientY-based vertical interaction: top=1.0, bottom=0.0
    const updateFromPointer = useCallback((clientY: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))

        setDisplayValue(ratio)
        throttledOnChange(ratio)
    }, [throttledOnChange])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const now = Date.now()
        // Double tap detection (within 300ms)
        if (now - lastTapTime.current < 300) {
            const resetVal = displayValue > 0.1 ? 0.0 : 0.75
            setDisplayValue(resetVal)
            throttledOnChange(resetVal)
            isDraggingRef.current = false
            setIsDragging(false)
            return
        }
        lastTapTime.current = now

        isDraggingRef.current = true
        setIsDragging(true)
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientY)
    }, [updateFromPointer, displayValue, throttledOnChange])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return
        updateFromPointer(e.clientY)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        isDraggingRef.current = false
        setIsDragging(false)
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        throttledOnChange(displayValue)
    }, [displayValue, throttledOnChange])

    const percentage = Math.round(displayValue * 100)
    const fillHeight = `${percentage}%`
    const barOpacity = isDragging ? "opacity-100" : (isPending ? "opacity-70" : "opacity-100")

    return (
        <div
            className={`flex flex-col items-center w-14 min-w-[48px] transition-opacity ${!on ? "opacity-50" : ""}`}
        >
            {/* Channel name */}
            <div
                className={`text-[10px] font-medium truncate w-full text-center mb-1 ${isMaster ? "text-brand" : "text-zinc-400"}`}
                title={label}
            >
                {label}
            </div>

            {/* Vertical fader track */}
            <div
                ref={sliderRef}
                className="relative w-8 h-[200px] rounded-lg bg-zinc-900/80 border border-brand/10 overflow-hidden cursor-pointer touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Fill bar from bottom up */}
                <div
                    className={`absolute bottom-0 left-0 right-0 transition-all duration-75 ${barOpacity} ${
                        isMaster ? "bg-brand/60" : "bg-brand/50"
                    }`}
                    style={{ height: fillHeight }}
                />

                {/* Pending indicator */}
                {isPending && !isDragging && (
                    <div className="absolute top-1 left-1/2 -translate-x-1/2">
                        <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                    </div>
                )}
            </div>

            {/* Percentage value */}
            <div className="text-[10px] font-mono font-bold text-zinc-500 mt-1">
                {percentage}%
            </div>

            {/* Mute button */}
            <button
                data-testid="mute-toggle"
                onClick={onMuteToggle}
                className={`mt-1 w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    on
                        ? "bg-green-900/40 text-green-400 hover:bg-green-800/60"
                        : "bg-red-900/40 text-red-400 hover:bg-red-800/60"
                }`}
                title={on ? "Mute" : "Unmute"}
            >
                {on ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
        </div>
    )
}
