"use client"

import { useCallback, useRef, useReducer, useEffect } from "react"
import { Loader2, Volume2, VolumeX, Clock, Check, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    faderReducer,
    initFaderState,
    FADER_CONFIRM_TIMEOUT_MS,
    type FaderEvent,
    type FaderMachineState,
} from "@/lib/monitor/fader-confirmation"

interface VerticalFaderStripProps {
    label: string
    value: number        // 0.0 - 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onMuteToggle: () => void
    /** C-6: live state is stale/frozen — show a non-blocking cue (fader stays usable). */
    stale?: boolean
    /** Authoritative snapshot sequence (store `snapshotCount`) for the confirmation machine (C-2). */
    snapshotSeq?: number
}

const OUTCOME_CUE_MS = 800

/**
 * Vertical fader strip for the live monitor popup.
 * Traditional mixer-style vertical layout: label at top, fader in middle, mute at bottom.
 * Uses clientY-based pointer interaction (top=1.0, bottom=0.0).
 *
 * Carries the same C-2/C-3/C-12 confirmation machine + C-6 staleness cue as the
 * horizontal `FaderStrip`, so the perform-toolbar surface is just as honest.
 */
export function VerticalFaderStrip({ label, value, on, isMaster, onChange, onMuteToggle, stale = false, snapshotSeq = 0 }: VerticalFaderStripProps) {
    const isDraggingRef = useRef(false)
    const sliderRef = useRef<HTMLDivElement>(null)
    const lastWriteTime = useRef<number>(0)
    const rafRef = useRef<number | null>(null)
    const lastTapTime = useRef<number>(0)

    const [machine, dispatch] = useReducer(
        (s: FaderMachineState, e: FaderEvent) => faderReducer(s, e),
        undefined,
        () => initFaderState(value, snapshotSeq),
    )
    const { phase, displayValue, outcome } = machine

    // Reconcile against authoritative snapshots (ignores optimistic echo via seq).
    useEffect(() => {
        dispatch({ type: "external", value, seq: snapshotSeq, now: Date.now() })
    }, [value, snapshotSeq])

    // Pending timeout → ease back to authoritative (C-3).
    useEffect(() => {
        if (phase !== "pending" || machine.sentAt == null) return
        const remaining = machine.sentAt + FADER_CONFIRM_TIMEOUT_MS - Date.now()
        const timer = setTimeout(
            () => dispatch({ type: "tick", value, now: Date.now() }),
            Math.max(0, remaining),
        )
        return () => clearTimeout(timer)
    }, [phase, machine.sentAt, value])

    useEffect(() => {
        if (outcome == null) return
        const timer = setTimeout(() => dispatch({ type: "clear_outcome" }), OUTCOME_CUE_MS)
        return () => clearTimeout(timer)
    }, [outcome])

    // Throttle writes to parent (max 10 updates/sec)
    const throttledOnChange = useCallback((val: number) => {
        const now = Date.now()
        if (now - lastWriteTime.current > 100) {
            lastWriteTime.current = now
            onChange(val)
        } else {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = requestAnimationFrame(() => {
                lastWriteTime.current = Date.now()
                onChange(val)
            })
        }
    }, [onChange])

    // clientY-based vertical interaction: top=1.0, bottom=0.0
    const updateFromPointer = useCallback((clientY: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))

        dispatch({ type: "drag_move", value: ratio })
        throttledOnChange(ratio)
    }, [throttledOnChange])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const now = Date.now()
        // Double tap detection (within 300ms)
        if (now - lastTapTime.current < 300) {
            const resetVal = displayValue > 0.1 ? 0.0 : 0.75
            isDraggingRef.current = false
            dispatch({ type: "commit", value: resetVal, now })
            throttledOnChange(resetVal)
            return
        }
        lastTapTime.current = now

        isDraggingRef.current = true
        dispatch({ type: "drag_start" })
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientY)
    }, [updateFromPointer, displayValue, throttledOnChange])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return
        updateFromPointer(e.clientY)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        dispatch({ type: "commit", value: displayValue, now: Date.now() })
        throttledOnChange(displayValue)
    }, [displayValue, throttledOnChange])

    // Keyboard nudges are discrete sent values → commit (optimistic + pending).
    const nudge = useCallback((newVal: number) => {
        const clamped = Math.max(0, Math.min(1, newVal))
        dispatch({ type: "commit", value: clamped, now: Date.now() })
        throttledOnChange(clamped)
    }, [throttledOnChange])

    const percentage = Math.round(displayValue * 100)
    const fillHeight = `${percentage}%`
    const isDragging = phase === "dragging"
    const isPending = phase === "pending"
    const barOpacity = isDragging ? "opacity-100" : (isPending ? "opacity-70" : "opacity-100")
    const barMotion = isDragging
        ? "duration-75"
        : "duration-300 ease-out motion-reduce:transition-none"
    const showStale = stale && phase === "idle"
    const outcomeRing = outcome === "confirmed"
        ? "ring-2 ring-emerald-400/60"
        : outcome === "reverted"
            ? "ring-2 ring-amber-400/60"
            : "ring-0 ring-transparent"

    return (
        <div
            className={`flex flex-col items-center w-14 min-w-[48px] transition-opacity snap-start ${!on ? "opacity-50" : ""}`}
        >
            {/* Vertical fader track */}
            <div
                ref={sliderRef}
                className={`relative w-8 h-[200px] rounded-lg bg-muted/80 border border-brand/10 overflow-hidden cursor-pointer touch-none select-none ring-inset transition-[box-shadow] duration-300 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none ${outcomeRing}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                role="slider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage}
                aria-label={label}
                aria-orientation="vertical"
                tabIndex={0}
                onKeyDown={(e) => {
                    let newVal = displayValue
                    switch (e.key) {
                        case "ArrowUp":
                        case "ArrowRight":
                            newVal = displayValue + 0.05
                            break
                        case "ArrowDown":
                        case "ArrowLeft":
                            newVal = displayValue - 0.05
                            break
                        case "PageUp":
                            newVal = displayValue + 0.1
                            break
                        case "PageDown":
                            newVal = displayValue - 0.1
                            break
                        case "Home":
                            newVal = 0
                            break
                        case "End":
                            newVal = 1
                            break
                        default:
                            return
                    }
                    e.preventDefault()
                    nudge(newVal)
                }}
            >
                {/* Fill bar from bottom up */}
                <div
                    className={`absolute bottom-0 left-0 right-0 transition-[height,opacity] ${barMotion} ${barOpacity} ${
                        isMaster ? "bg-brand/60" : "bg-brand/50"
                    }`}
                    style={{ height: fillHeight }}
                />

                {/* Status cue (pending / confirmed / reverted / stale) — color-not-alone via glyph + aria-label */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2">
                    {isPending ? (
                        <Loader2
                            data-testid="vfader-pending-cue"
                            role="img"
                            aria-label="Sending to the mixer…"
                            className="w-3 h-3 text-muted-foreground animate-spin motion-reduce:animate-none"
                        />
                    ) : outcome === "confirmed" ? (
                        <Check
                            data-testid="vfader-confirmed-cue"
                            role="img"
                            aria-label="Level confirmed by the mixer"
                            className="w-3.5 h-3.5 text-emerald-400"
                        />
                    ) : outcome === "reverted" ? (
                        <Undo2
                            data-testid="vfader-reverted-cue"
                            role="img"
                            aria-label="No confirmation — reset to the mixer's level"
                            className="w-3.5 h-3.5 text-amber-400"
                        />
                    ) : showStale ? (
                        <Clock
                            data-testid="vfader-stale-cue"
                            role="img"
                            aria-label="Level may be out of date — showing last known value"
                            className="w-3 h-3 text-yellow-500"
                        />
                    ) : null}
                </div>
            </div>

            {/* Percentage value */}
            <div className={`text-[10px] font-mono font-bold mt-1 mb-0.5 ${showStale ? "text-yellow-500/90" : "text-muted-foreground/70"}`}>
                {percentage}%
            </div>

            {/* Mute button */}
            <Button
                data-testid="mute-toggle"
                variant="ghost"
                size="icon-sm"
                onClick={onMuteToggle}
                className={`mt-0.5 ${
                    on
                        ? "bg-green-900/40 text-green-400 hover:bg-green-800/60"
                        : "bg-red-900/40 text-red-400 hover:bg-red-800/60"
                }`}
                title={on ? "Mute" : "Unmute"}
                aria-label={on ? `Mute ${label}` : `Unmute ${label}`}
            >
                {on ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>

            {/* Channel name (Moved to bottom) */}
            <div
                className={`text-xs sm:text-sm font-bold truncate max-w-[56px] text-center mt-2 px-1.5 py-0.5 rounded ${isMaster ? "text-brand bg-brand/10" : "text-foreground bg-muted shadow-sm"}`}
                title={label}
            >
                {label}
            </div>
        </div>
    )
}
