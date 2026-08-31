"use client"

import { useCallback, useRef, useReducer, useEffect } from "react"
import { Loader2, Volume2, VolumeX, Clock, Check, Undo2, Ban, HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    faderReducer,
    humanizeRejection,
    initFaderState,
    FADER_CONFIRM_TIMEOUT_MS,
    type FaderEvent,
    type FaderMachineState,
} from "@/lib/monitor/fader-confirmation"
import { useFaderThrottle } from "@/lib/monitor/use-fader-throttle"

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
    /** R5: the bridge could not read this value — the number shown is fabricated (B11). */
    unconfirmed?: boolean
    /** R2: the bridge refused this fader's last command (`seq` monotonic so repeats re-fire). */
    rejection?: { reason: string; seq: number } | null
}

const OUTCOME_CUE_MS = 800

/** A rejection carries words to read, so it lingers longer than a check/undo glyph. */
const REJECTION_CUE_MS = 4000

/**
 * Vertical fader strip for the live monitor popup.
 * Traditional mixer-style vertical layout: label at top, fader in middle, mute at bottom.
 * Uses clientY-based pointer interaction (top=1.0, bottom=0.0).
 *
 * Carries the same C-2/C-3/C-12 confirmation machine + C-6 staleness cue as the
 * horizontal `FaderStrip`, so the perform-toolbar surface is just as honest.
 */
export function VerticalFaderStrip({ label, value, on, isMaster, onChange, onMuteToggle, stale = false, snapshotSeq = 0, unconfirmed = false, rejection = null }: VerticalFaderStripProps) {
    const isDraggingRef = useRef(false)
    const sliderRef = useRef<HTMLDivElement>(null)
    const lastTapTime = useRef<number>(0)
    const lastRejectionSeq = useRef<number>(rejection?.seq ?? 0)

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

    // R2: an ack said the desk refused this move — revert now, with a reason,
    // rather than spinning out the 2s timeout wordlessly.
    useEffect(() => {
        if (!rejection || rejection.seq === lastRejectionSeq.current) return
        lastRejectionSeq.current = rejection.seq
        dispatch({ type: "rejected", value, reason: rejection.reason })
    }, [rejection, value])

    useEffect(() => {
        if (outcome == null) return
        const timer = setTimeout(
            () => dispatch({ type: "clear_outcome" }),
            outcome === "rejected" ? REJECTION_CUE_MS : OUTCOME_CUE_MS,
        )
        return () => clearTimeout(timer)
    }, [outcome])

    // R4: mid-drag motion throttled; every commit (release, cancel, reset tap,
    // keyboard nudge) sent synchronously, plus a flush on hide/pagehide/unmount.
    // This surface is the one inside the perform popover — the popover unmounting
    // over a just-released fader was exactly how the final value got lost.
    const throttle = useFaderThrottle(onChange)

    // clientY-based vertical interaction: top=1.0, bottom=0.0
    const updateFromPointer = useCallback((clientY: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height))

        dispatch({ type: "drag_move", value: ratio })
        throttle.move(ratio)
    }, [throttle])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const now = Date.now()
        // Double tap detection (within 300ms)
        if (now - lastTapTime.current < 300) {
            const resetVal = displayValue > 0.1 ? 0.0 : 0.75
            isDraggingRef.current = false
            dispatch({ type: "commit", value: resetVal, now })
            throttle.commit(resetVal) // R4: a reset tap is terminal — never throttled
            return
        }
        lastTapTime.current = now

        isDraggingRef.current = true
        dispatch({ type: "drag_start" })
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientY)
    }, [updateFromPointer, displayValue, throttle])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return
        updateFromPointer(e.clientY)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        // R4: synchronous — the drop value must not wait on an animation frame
        // the closing popover will never run.
        dispatch({ type: "commit", value: displayValue, now: Date.now() })
        throttle.commit(displayValue)
    }, [displayValue, throttle])

    // Keyboard nudges are discrete sent values → commit (optimistic + pending).
    const nudge = useCallback((newVal: number) => {
        const clamped = Math.max(0, Math.min(1, newVal))
        dispatch({ type: "commit", value: clamped, now: Date.now() })
        throttle.commit(clamped) // R4: a nudge is a discrete sent value, not motion
    }, [throttle])

    const percentage = Math.round(displayValue * 100)
    const fillHeight = `${percentage}%`
    const isDragging = phase === "dragging"
    const isPending = phase === "pending"
    const barOpacity = isDragging ? "opacity-100" : (isPending ? "opacity-70" : "opacity-100")
    const barMotion = isDragging
        ? "duration-75"
        : "duration-300 ease-out motion-reduce:transition-none"
    const showStale = stale && phase === "idle"
    // R5: only while showing the desk's own (fabricated) value.
    const showUnconfirmed = unconfirmed && phase === "idle"
    const outcomeRing = outcome === "confirmed"
        ? "ring-2 ring-emerald-400/60"
        : outcome === "rejected"
            ? "ring-2 ring-red-400/60"
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
                {/* Fill bar from bottom up. R5: faint + hatched when the bridge could
                    not read this level — a fabricated 0 must not look like a measured 0. */}
                <div
                    data-testid={showUnconfirmed ? "vfader-unconfirmed-fill" : undefined}
                    className={`absolute bottom-0 left-0 right-0 transition-[height,opacity] ${barMotion} ${showUnconfirmed ? "opacity-30" : barOpacity} ${
                        isMaster ? "bg-brand/60" : "bg-brand/50"
                    }`}
                    style={{
                        height: fillHeight,
                        ...(showUnconfirmed
                            ? {
                                backgroundImage:
                                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 4px, transparent 4px 8px)",
                            }
                            : {}),
                    }}
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
                    ) : outcome === "rejected" ? (
                        <Ban
                            data-testid="vfader-rejected-cue"
                            role="img"
                            aria-label="Refused by the mixer"
                            className="w-3.5 h-3.5 text-red-400"
                        />
                    ) : outcome === "reverted" ? (
                        <Undo2
                            data-testid="vfader-reverted-cue"
                            role="img"
                            aria-label="No confirmation — reset to the mixer's level"
                            className="w-3.5 h-3.5 text-amber-400"
                        />
                    ) : showUnconfirmed ? (
                        <HelpCircle
                            data-testid="vfader-unconfirmed-cue"
                            role="img"
                            aria-label="Level unknown — could not read this from the desk"
                            className="w-3 h-3 text-muted-foreground"
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
            <div
                className={`text-[10px] font-mono font-bold mt-1 mb-0.5 ${showUnconfirmed
                    ? "text-muted-foreground/60 italic"
                    : showStale
                        ? "text-yellow-500/90"
                        : "text-muted-foreground/70"}`}
                title={showUnconfirmed ? "Could not read this level from the desk" : undefined}
            >
                {showUnconfirmed ? `~${percentage}%` : `${percentage}%`}
            </div>

            {/* R2: the reason, in words. Narrow column, so it wraps to two short
                lines rather than pushing the fader row wider. */}
            {outcome === "rejected" && (
                <div
                    data-testid="vfader-rejection-reason"
                    className="text-[9px] leading-tight text-center text-red-400 max-w-[56px] mb-0.5"
                >
                    {humanizeRejection(machine.rejectionReason ?? undefined)}
                </div>
            )}

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
