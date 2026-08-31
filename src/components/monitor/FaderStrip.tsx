"use client"

import { useCallback, useRef, useReducer, useEffect } from "react"
import { Loader2, Clock, Check, Undo2, Ban, HelpCircle } from "lucide-react"
import {
    faderReducer,
    humanizeRejection,
    initFaderState,
    FADER_CONFIRM_TIMEOUT_MS,
    type FaderEvent,
    type FaderMachineState,
} from "@/lib/monitor/fader-confirmation"
import { useFaderThrottle } from "@/lib/monitor/use-fader-throttle"

interface FaderStripProps {
    label: string
    value: number       // 0.0 – 1.0
    on: boolean
    isMaster?: boolean
    onChange: (value: number) => void
    onUnmuteCheck?: () => void // Optional callback to ensure the channel is unmuted when dragged
    /**
     * C-6: the live mixer state is stale (frozen / >threshold old), so this
     * displayed level may not reflect the desk. Surfaced as a non-blocking cue
     * (Clock glyph + amber readout) — the fader stays draggable, since sending
     * a command still works even when the readback is stale.
     */
    stale?: boolean
    /**
     * Monotonic authoritative-snapshot sequence (the store's `snapshotCount`).
     * Advances ONLY on a real `monitor-live/state` snapshot, never on the
     * parent's optimistic store write — this is how the confirmation machine
     * (C-2) tells a genuine desk reflection from the fader's own optimistic echo.
     */
    snapshotSeq?: number
    /**
     * R5: the bridge could not READ this value from the desk (B11 `unconfirmed`),
     * so the number shown is a fabricated 0 — not a measurement. Rendered
     * distinctly rather than as a confident level.
     */
    unconfirmed?: boolean
    /**
     * R2: the bridge refused this fader's last command. `seq` is monotonic so a
     * repeat rejection re-fires the cue; `reason` is the bridge's raw string.
     */
    rejection?: { reason: string; seq: number } | null
}

const OUTCOME_CUE_MS = 800

/** A rejection carries words to read, so it lingers longer than a check/undo glyph. */
const REJECTION_CUE_MS = 4000

export function FaderStrip({ label, value, on, isMaster, onChange, onUnmuteCheck, stale = false, snapshotSeq = 0, unconfirmed = false, rejection = null }: FaderStripProps) {
    const isDraggingRef = useRef(false)
    const sliderRef = useRef<HTMLDivElement>(null)
    const lastTapTime = useRef<number>(0)
    const lastRejectionSeq = useRef<number>(rejection?.seq ?? 0)

    // C-2/C-3/C-12: per-fader confirmation state machine (pure reducer).
    const [machine, dispatch] = useReducer(
        (s: FaderMachineState, e: FaderEvent) => faderReducer(s, e),
        undefined,
        () => initFaderState(value, snapshotSeq),
    )
    const { phase, displayValue, outcome } = machine

    // Reconcile against authoritative snapshots. The parent's optimistic store
    // write changes `value` WITHOUT advancing `snapshotSeq`; the reducer ignores
    // that echo (C-2). A real snapshot advances the seq → confirm/revert.
    useEffect(() => {
        dispatch({ type: "external", value, seq: snapshotSeq, now: Date.now() })
    }, [value, snapshotSeq])

    // C-3: while pending, fire a wall-clock timeout so the knob eases back to the
    // authoritative value even if no fresh snapshot arrives (idle desk).
    useEffect(() => {
        if (phase !== "pending" || machine.sentAt == null) return
        const remaining = machine.sentAt + FADER_CONFIRM_TIMEOUT_MS - Date.now()
        const timer = setTimeout(
            () => dispatch({ type: "tick", value, now: Date.now() }),
            Math.max(0, remaining),
        )
        return () => clearTimeout(timer)
    }, [phase, machine.sentAt, value])

    // R2: an ack said the desk refused this move. Revert immediately, with words,
    // instead of spinning out the 2s timeout and easing back wordlessly. Keyed on
    // `seq` so a second identical rejection still fires.
    useEffect(() => {
        if (!rejection || rejection.seq === lastRejectionSeq.current) return
        lastRejectionSeq.current = rejection.seq
        dispatch({ type: "rejected", value, reason: rejection.reason })
    }, [rejection, value])

    // Decay the confirmed/reverted cue after a beat. A rejection lingers longer —
    // it carries a sentence the musician has to read while playing.
    useEffect(() => {
        if (outcome == null) return
        const timer = setTimeout(
            () => dispatch({ type: "clear_outcome" }),
            outcome === "rejected" ? REJECTION_CUE_MS : OUTCOME_CUE_MS,
        )
        return () => clearTimeout(timer)
    }, [outcome])

    // R4: mid-drag motion is throttled; every COMMIT (release, cancel, reset tap)
    // sends synchronously. The hook also flushes a scheduled value on
    // visibilitychange→hidden, pagehide and unmount — the three moments that used
    // to swallow a musician's final fader position.
    const throttle = useFaderThrottle(onChange)

    const updateFromPointer = useCallback((clientX: number) => {
        if (!sliderRef.current) return
        const rect = sliderRef.current.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))

        dispatch({ type: "drag_move", value: ratio }) // optimistic local move
        throttle.move(ratio)

        if (onUnmuteCheck && !on) {
            onUnmuteCheck() // Auto-unmute if fader is grabbed but channel is muted
        }
    }, [throttle, onUnmuteCheck, on])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        const now = Date.now()
        // Double tap (within 300ms) resets: a kill to 0, or to unity (0.75) if already down.
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
            ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromPointer(e.clientX)
    }, [updateFromPointer, displayValue, throttle])

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDraggingRef.current) return
        updateFromPointer(e.clientX)
    }, [updateFromPointer])

    const handlePointerUp = useCallback(() => {
        if (!isDraggingRef.current) return
        isDraggingRef.current = false
        // R4: the drop position goes out SYNCHRONOUSLY. Previously this cancelled
        // the pending frame and then re-entered the throttle, which — the last
        // write being <100ms old — scheduled ANOTHER frame; if the popover closed
        // or iOS backgrounded the tab first, the final position never left the
        // device and the knob eased back 2s later.
        dispatch({ type: "commit", value: displayValue, now: Date.now() })
        throttle.commit(displayValue)
    }, [displayValue, throttle])

    const percentage = Math.round(displayValue * 100)
    const isDragging = phase === "dragging"
    const isPending = phase === "pending"
    // If pending, slightly dim the bar to indicate latency taking effect
    const barOpacity = isDragging ? "opacity-100" : (isPending ? "opacity-70" : "opacity-100")
    // C-3: snappy follow while dragging; gentle ease when settling to the
    // authoritative value (confirm OR revert) — no jarring hard snap-back.
    const barMotion = isDragging
        ? "duration-75"
        : "duration-300 ease-out motion-reduce:transition-none"
    // C-6: only flag the value as stale when we're showing the authoritative
    // value (not mid-drag / not awaiting our own optimistic write to settle).
    const showStale = stale && phase === "idle"
    // R5: only flag "level unknown" when we are actually showing the desk's
    // (fabricated) value — mid-drag and while pending, the number on screen is
    // the musician's own, and it is not unknown to them.
    const showUnconfirmed = unconfirmed && phase === "idle"
    // Outcome ring on the track (color-not-alone — paired with a glyph below).
    const outcomeRing = outcome === "confirmed"
        ? "ring-2 ring-emerald-400/60"
        : outcome === "rejected"
            ? "ring-2 ring-red-400/60"
            : outcome === "reverted"
                ? "ring-2 ring-amber-400/60"
                : "ring-0 ring-transparent"

    return (
        <div className={`w-full py-1.5 transition-opacity ${!on ? "opacity-50 grayscale" : ""}`}>
            <div
                ref={sliderRef}
                className={`relative h-14 w-full rounded-xl bg-zinc-900/80 border border-brand/10 overflow-hidden cursor-pointer touch-none select-none ring-inset transition-[box-shadow] duration-300 motion-reduce:transition-none ${outcomeRing}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {/* Fill bar. R5: an unconfirmed value is drawn faint + hatched so it
                    cannot be misread as a measured level — the bridge fabricated this
                    number after failing to read the desk. */}
                <div
                    data-testid={showUnconfirmed ? "fader-unconfirmed-fill" : undefined}
                    className={`absolute inset-y-0 left-0 transition-[width,opacity] ${barMotion} ${showUnconfirmed ? "opacity-30" : barOpacity} ${isMaster
                        ? "bg-brand/60"
                        : "bg-brand/50"
                        }`}
                    style={{
                        width: `${percentage}%`,
                        ...(showUnconfirmed
                            ? {
                                backgroundImage:
                                    "repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 4px, transparent 4px 8px)",
                            }
                            : {}),
                    }}
                />

                {/* Content Overlay */}
                <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
                    <span className={`text-sm font-semibold truncate pr-4 ${isMaster ? "text-white" : "text-zinc-200"}`}>
                        {label}
                    </span>
                    <div className="flex items-center gap-2">
                        {isPending && (
                            <Loader2
                                data-testid="fader-pending-cue"
                                role="img"
                                aria-label="Sending to the mixer…"
                                className="w-3 h-3 text-zinc-400 animate-spin motion-reduce:animate-none"
                            />
                        )}
                        {outcome === "confirmed" && (
                            <Check
                                data-testid="fader-confirmed-cue"
                                role="img"
                                aria-label="Level confirmed by the mixer"
                                className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                            />
                        )}
                        {outcome === "reverted" && (
                            <Undo2
                                data-testid="fader-reverted-cue"
                                role="img"
                                aria-label="No confirmation — reset to the mixer's level"
                                className="w-3.5 h-3.5 text-amber-400 shrink-0"
                            />
                        )}
                        {/* R2: the reason, in words, where there used to be silence. */}
                        {outcome === "rejected" && (
                            <span
                                data-testid="fader-rejected-cue"
                                className="flex items-center gap-1 text-[10px] font-medium text-red-400 shrink-0"
                            >
                                <Ban role="img" aria-label="Refused by the mixer" className="w-3.5 h-3.5" />
                                {humanizeRejection(machine.rejectionReason ?? undefined)}
                            </span>
                        )}
                        {showUnconfirmed && (
                            <HelpCircle
                                data-testid="fader-unconfirmed-cue"
                                role="img"
                                aria-label="Level unknown — could not read this from the desk"
                                className="w-3 h-3 text-zinc-500 shrink-0"
                            />
                        )}
                        {showStale && (
                            <Clock
                                data-testid="fader-stale-cue"
                                role="img"
                                aria-label="Level may be out of date — showing last known value"
                                className="w-3 h-3 text-yellow-500 shrink-0"
                            />
                        )}
                        <span
                            className={`text-xs font-mono font-bold shrink-0 ${showUnconfirmed
                                ? "text-zinc-500 italic"
                                : showStale
                                    ? "text-yellow-500/90"
                                    : "text-zinc-400"}`}
                            title={showUnconfirmed ? "Could not read this level from the desk" : undefined}
                        >
                            {showUnconfirmed ? `~${percentage}%` : `${percentage}%`}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
