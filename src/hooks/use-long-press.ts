"use client"

/**
 * Long-press detection hook for the live-director gesture (the
 * `band_leader`/`admin`-only path that opens the change-key / swap-chart /
 * insert-song action sheet from PDFOverlay or a setlist row).
 *
 * Design constraints (per `.paul/research/live-key-song-swap/DISCUSSION.md`
 * ##RATIFIED BUILD SPEC):
 * - ~500ms hold to fire (`durationMs` configurable for tests).
 * - Movement past `slopPx` cancels (keeps tap+scroll cleanly distinguished).
 * - Suppresses the synthetic click that follows a successful long-press so
 *   the host element's `onClick` (e.g. "tap-to-open-chart") does NOT also fire.
 * - Suppresses the iOS native context menu / callout that long-press would
 *   normally trigger on a touch target.
 * - Single-touch / primary-mouse-button only — multi-touch or right-click
 *   never starts a long-press timer.
 *
 * The hook returns a spreadable handler bag plus a small `style` chunk
 * (`touch-action: manipulation` + iOS callout/selection suppression) that
 * the host element should also adopt for the gesture to feel right on iPad.
 *
 * Tap-once-commit per DISCUSSION ##ADDENDUM 4: the long-press itself is
 * the deliberate gesture — no confirm dialog wraps the fired callback.
 */

import { useCallback, useEffect, useRef } from "react"
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react"

const DEFAULT_DURATION_MS = 500
const DEFAULT_SLOP_PX = 10

export interface UseLongPressOptions {
    /**
     * Fired once the pointer has been held for `durationMs` without moving
     * past `slopPx`. Receives the original PointerEvent so callers can read
     * coordinates / target if needed.
     */
    onLongPress: (event: ReactPointerEvent) => void
    /** Hold threshold in ms. Default 500. */
    durationMs?: number
    /** Movement cancel threshold in px. Default 10. */
    slopPx?: number
    /** When true, the hook reports the events as no-ops (no timer, no click
     *  suppression, no context-menu suppression). */
    disabled?: boolean
}

export interface UseLongPressBag {
    onPointerDown: (e: ReactPointerEvent) => void
    onPointerUp: (e: ReactPointerEvent) => void
    onPointerMove: (e: ReactPointerEvent) => void
    onPointerCancel: (e: ReactPointerEvent) => void
    onContextMenu: (e: ReactMouseEvent) => void
    onClick: (e: ReactMouseEvent) => void
    style: CSSProperties
}

export function useLongPress({
    onLongPress,
    durationMs = DEFAULT_DURATION_MS,
    slopPx = DEFAULT_SLOP_PX,
    disabled = false,
}: UseLongPressOptions): UseLongPressBag {
    const stateRef = useRef<{
        timer: number | null
        startX: number
        startY: number
        pointerId: number | null
        fired: boolean
    }>({ timer: null, startX: 0, startY: 0, pointerId: null, fired: false })

    // Keep the latest onLongPress in a ref so we don't tear down + rebuild the
    // handler bag every render (consumers spread these onto JSX elements;
    // identity stability avoids React re-binding work).
    const onLongPressRef = useRef(onLongPress)
    useEffect(() => { onLongPressRef.current = onLongPress }, [onLongPress])

    const clearTimer = useCallback(() => {
        const s = stateRef.current
        if (s.timer != null) {
            window.clearTimeout(s.timer)
            s.timer = null
        }
    }, [])

    const resetTracking = useCallback(() => {
        clearTimer()
        stateRef.current.pointerId = null
    }, [clearTimer])

    // Tear down any in-flight timer when the consumer unmounts.
    useEffect(() => {
        return () => clearTimer()
    }, [clearTimer])

    const onPointerDown = useCallback(
        (e: ReactPointerEvent) => {
            if (disabled) return
            // Primary button / single touch only. iOS PointerEvent reports
            // `button: 0` for touch and `button: 0` for left mouse; everything
            // else (right-click, middle-click, multi-touch second finger) we
            // ignore to keep the gesture intentional.
            if (e.pointerType === "mouse" && e.button !== 0) return
            // If a prior pointer is still being tracked (e.g. second finger
            // came down while the first is still held), bail rather than
            // doubling the timer — single-touch intent only.
            if (stateRef.current.pointerId !== null) return

            stateRef.current.pointerId = e.pointerId
            stateRef.current.startX = e.clientX
            stateRef.current.startY = e.clientY
            stateRef.current.fired = false

            const event = e
            stateRef.current.timer = window.setTimeout(() => {
                stateRef.current.timer = null
                stateRef.current.fired = true
                // Caller's callback. Tap-once-commit semantics (no confirm).
                onLongPressRef.current(event)
            }, durationMs)
        },
        [disabled, durationMs],
    )

    const onPointerMove = useCallback(
        (e: ReactPointerEvent) => {
            const s = stateRef.current
            if (s.pointerId !== e.pointerId || s.timer == null) return
            const dx = Math.abs(e.clientX - s.startX)
            const dy = Math.abs(e.clientY - s.startY)
            if (dx > slopPx || dy > slopPx) resetTracking()
        },
        [slopPx, resetTracking],
    )

    const onPointerUp = useCallback(
        (e: ReactPointerEvent) => {
            if (stateRef.current.pointerId !== e.pointerId) return
            // Either the long-press already fired (we keep `fired: true` so
            // the subsequent click is suppressed) OR the pointer-up beat the
            // timer (cancel cleanly so the host's onClick can run).
            resetTracking()
        },
        [resetTracking],
    )

    const onPointerCancel = useCallback(
        (e: ReactPointerEvent) => {
            if (stateRef.current.pointerId !== e.pointerId) return
            // Browser cancelled the pointer (iOS scroll started, system
            // gesture took over, etc.) — drop the timer; the long-press
            // never actually fired so we don't need to suppress a click.
            stateRef.current.fired = false
            resetTracking()
        },
        [resetTracking],
    )

    const onContextMenu = useCallback(
        (e: ReactMouseEvent) => {
            if (disabled) return
            // Suppress the iOS Safari long-press callout ("Look up / Copy /
            // Share") and the desktop right-click menu on the gesture target.
            // Without this, iOS hijacks the long-press for its own UI.
            e.preventDefault()
        },
        [disabled],
    )

    const onClick = useCallback((e: ReactMouseEvent) => {
        // The synthetic click that follows a fired long-press must NOT also
        // open a chart (the host element's tap-to-open handler). Consume it
        // here and reset the flag so the next genuine tap is unaffected.
        if (stateRef.current.fired) {
            e.preventDefault()
            e.stopPropagation()
            stateRef.current.fired = false
        }
    }, [])

    return {
        onPointerDown,
        onPointerUp,
        onPointerMove,
        onPointerCancel,
        onContextMenu,
        onClick,
        style: {
            touchAction: "manipulation",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
        },
    }
}
