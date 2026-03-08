"use client"

import { useCallback, useRef, useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

interface FaderStripProps {
    label: string
    value: number       // 0.0 – 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onUnmuteCheck?: () => void // Optional callback to ensure the channel is unmuted when dragged
}

export function FaderStrip({ label, value, on, isMaster, onChange, onUnmuteCheck }: FaderStripProps) {
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

    // Clear pending state if the value catches up to what we expect
    useEffect(() => {
        if (isPending && pendingValue.current !== null && Math.abs(value - pendingValue.current) < 0.01) {
            setIsPending(false)
            pendingValue.current = null
        }
    }, [value, isPending])

    // Safety timeout to clear pending state if Firestore takes too long (or drops it)
    useEffect(() => {
        if (isPending) {
            const timer = setTimeout(() => {
                setIsPending(false)
                setDisplayValue(value) // snap back
            }, 2000)
            return () => clearTimeout(timer)
        }
    }, [isPending, value])

    // Throttle writes to parent (and therefore to Firestore)
    const throttledOnChange = useCallback((val: number) => {
        const now = Date.now()
        // Rate limit to max 10 updates per second (100ms)
        if (now - lastWriteTime.current > 100) {
            lastWriteTime.current = now
            pendingValue.current = val
            setIsPending(true)
            onChange(val)
        } else {
            // Schedule the final value if they stop dragging between ticks
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                lastWriteTime.current = Date.now()
                pendingValue.current = val
                setIsPending(true)
                onChange(val)
            })
        }
    }, [onChange])

    const updateFromPointer = useCallback((clientX: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))

        setDisplayValue(ratio) // Instant optimistic UI update
        throttledOnChange(ratio)

        if (onUnmuteCheck && !on) {
            onUnmuteCheck() // Auto-unmute if fader is grabbed but channel is muted
        }
    }, [throttledOnChange, onUnmuteCheck, on])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const now = Date.now()
        // Double tap detection (within 300ms)
        if (now - lastTapTime.current < 300) {
            // Reset to 0dB (Unity is typically ~0.75 in Behringer float terms, letting 0.75 represent 0dB)
            // Or we can reset to 0% if it's currently > 0, and unity if it's 0.
            // A common "reset" for monitors is muting, but "unity" is also useful.
            // Let's implement reset to 0 as a quick kill, or if already 0, reset to 0.75 (unity)
            const resetVal = displayValue > 0.1 ? 0.0 : 0.75
            updateFromPointer(sliderRef.current ? sliderRef.current.getBoundingClientRect().left + (sliderRef.current.getBoundingClientRect().width * resetVal) : e.clientX)
            isDraggingRef.current = false
            setIsDragging(false)
            return;
        }
        lastTapTime.current = now

        isDraggingRef.current = true
        setIsDragging(true)
            ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientX)
    }, [updateFromPointer, displayValue])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return
        updateFromPointer(e.clientX)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        isDraggingRef.current = false
        setIsDragging(false)
        // Trigger one final write to ensure the exact drop position is recorded
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        throttledOnChange(displayValue)
    }, [displayValue, throttledOnChange])

    const percentage = Math.round(displayValue * 100)
    // If pending, slightly dim the bar to indicate latency taking effect
    const barOpacity = isDragging ? "opacity-100" : (isPending ? "opacity-70" : "opacity-100")

    return (
        <div className={`w-full py-1.5 transition-opacity ${!on ? "opacity-50 grayscale" : ""}`}>
            <div
                ref={sliderRef}
                className="relative h-14 w-full rounded-xl bg-zinc-900/80 border border-brand/10 overflow-hidden cursor-pointer touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Fill bar */}
                <div
                    className={`absolute inset-y-0 left-0 transition-all duration-75 ${barOpacity} ${isMaster
                        ? "bg-brand/60"
                        : "bg-brand/50"
                        }`}
                    style={{ width: `${percentage}%` }}
                />

                {/* Content Overlay */}
                <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
                    <span className={`text-sm font-semibold truncate pr-4 ${isMaster ? "text-white" : "text-zinc-200"}`}>
                        {label}
                    </span>
                    <div className="flex items-center gap-2">
                        {isPending && !isDragging && (
                            <Loader2 className="w-3 h-3 text-zinc-400 animate-spin" />
                        )}
                        <span className="text-xs font-mono font-bold text-zinc-400 shrink-0">
                            {percentage}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

