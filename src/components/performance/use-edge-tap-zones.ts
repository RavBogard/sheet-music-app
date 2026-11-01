"use client"

/**
 * PERF-05 — wires edge tap zones onto the chart scroll container.
 *
 * One wrapper for every viewer (PDF, MusicXML, text, image): native pointer
 * listeners on the container PDFOverlay already renders, nothing inside the
 * viewers. When a turn fires it re-resolves the viewer's own scroller from the
 * tap point (`chart-scroll-target.ts`) and does nothing unless that viewer has
 * finished rendering and its scroller is measured — a forward tap must never
 * skip a chart the musician hasn't seen.
 *
 * A turn runs DOUBLE_TAP_MS after the tap so a double-tap can cancel it. A tap
 * within SCROLL_QUIET_MS of the chart scrolling (stopping momentum) is ignored.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
    classifyTap,
    isDoubleTap,
    isZoomedPastFit,
    planTurn,
    DOUBLE_TAP_MS,
    isTapZoneIgnoredTarget,
    type TapSample,
    type TurnDirection,
} from "./edge-tap-zones"
import { resolveTurnTarget, type TurnViewerKind } from "./chart-scroll-target"

export interface EdgeTapZoneOptions {
    enabled: boolean
    isRtl: boolean
    /** The viewer showing the current chart (PDFOverlay's `resolveViewerKind`). */
    viewerKind: TurnViewerKind
    /** Read at press and at turn time: a long-press, popover or sheet owns the screen. */
    isSuppressed: () => boolean
    onNextChart: () => void
    onPreviousChart: () => void
}

function visualScale(): number | undefined {
    return typeof window !== "undefined" ? window.visualViewport?.scale : undefined
}

function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
    } catch {
        return false
    }
}

/**
 * Returns a callback ref for the chart scroll container. A callback ref (not a
 * RefObject) so the listeners follow the element when PDFOverlay swaps between
 * its leader and musician container branches.
 */
export function useEdgeTapZones(options: EdgeTapZoneOptions): (el: HTMLElement | null) => void {
    const optsRef = useRef(options)
    useEffect(() => { optsRef.current = options })

    const { enabled } = options
    const [container, setContainer] = useState<HTMLElement | null>(null)
    const ref = useCallback((el: HTMLElement | null) => setContainer(el), [])

    useEffect(() => {
        if (!enabled || !container) return

        const pointers = new Set<number>()
        let down: (TapSample & { id: number }) | null = null
        let maxMove = 0
        let multiTouch = false
        let ignoreGesture = false
        let lastTapUpT: number | null = null
        let pending: { timer: ReturnType<typeof setTimeout> } | null = null
        let lastScrollT = -Infinity
        let msSinceScrollAtDown = Infinity

        const cancelPending = () => {
            if (pending) clearTimeout(pending.timer)
            pending = null
        }

        const runTurn = (direction: TurnDirection, point: { x: number; y: number }) => {
            const o = optsRef.current
            if (o.isSuppressed()) return
            // Re-resolve now: the viewer may have re-rendered during the wait.
            const target = resolveTurnTarget(o.viewerKind, container, point)
            if (!target) return
            const { scroller } = target
            const plan = planTurn(direction, {
                scrollTop: scroller.scrollTop,
                clientHeight: scroller.clientHeight,
                scrollHeight: scroller.scrollHeight,
            }, { ready: target.ready })
            if (plan.kind === "none") return
            if (plan.kind === "next-chart") o.onNextChart()
            else if (plan.kind === "previous-chart") o.onPreviousChart()
            else if (typeof scroller.scrollTo === "function") {
                scroller.scrollTo({ top: plan.top, behavior: prefersReducedMotion() ? "auto" : "smooth" })
            } else {
                scroller.scrollTop = plan.top
            }
        }

        const onDown = (e: PointerEvent) => {
            if (e.pointerType === "mouse" && e.button !== 0) return
            const newGesture = pointers.size === 0
            pointers.add(e.pointerId)
            if (newGesture) {
                multiTouch = false
                ignoreGesture = false
                maxMove = 0
            }
            if (pointers.size > 1) {
                multiTouch = true
                cancelPending()
                return
            }
            const now = e.timeStamp || performance.now()
            if (pending && isDoubleTap(lastTapUpT, now)) {
                // Second tap of a double-tap: drop the first tap's turn, and this one.
                cancelPending()
                ignoreGesture = true
            }
            const target = e.target instanceof Element ? e.target : null
            // Scoped to the container: the dialog around the chart doesn't count.
            if (isTapZoneIgnoredTarget(target, container)) ignoreGesture = true
            if (optsRef.current.isSuppressed()) ignoreGesture = true
            down = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId }
            msSinceScrollAtDown = now - lastScrollT
        }

        const onMove = (e: PointerEvent) => {
            if (!down || e.pointerId !== down.id) return
            maxMove = Math.max(maxMove, Math.hypot(e.clientX - down.x, e.clientY - down.y))
        }

        const onUp = (e: PointerEvent) => {
            pointers.delete(e.pointerId)
            if (!down || e.pointerId !== down.id) return
            const start = down
            down = null
            if (ignoreGesture) return
            // The chart scrolled during the press: a drag, not a tap.
            if (lastScrollT >= start.t) return
            const now = e.timeStamp || performance.now()
            const rect = container.getBoundingClientRect()
            const o = optsRef.current
            const point = { x: start.x, y: start.y }
            const target = resolveTurnTarget(o.viewerKind, container, point)
            const direction = classifyTap(start, { x: e.clientX, y: e.clientY, t: now }, rect, {
                multiTouch,
                maxMovePx: maxMove,
                // Zoomed only when the content is really wider than its
                // viewport (or pinch-zoomed) — a saved app zoom alone is not.
                zoomedIn: isZoomedPastFit(
                    target ? { scrollWidth: target.scroller.scrollWidth, clientWidth: target.scroller.clientWidth } : { scrollWidth: 0, clientWidth: 0 },
                    visualScale(),
                ),
                suppressed: o.isSuppressed(),
                isRtl: o.isRtl,
                msSinceScroll: msSinceScrollAtDown,
            })
            if (!direction) return
            lastTapUpT = now
            cancelPending()
            const timer = setTimeout(() => {
                pending = null
                runTurn(direction, point)
            }, DOUBLE_TAP_MS)
            pending = { timer }
        }

        const onCancel = (e: PointerEvent) => {
            pointers.delete(e.pointerId)
            if (down && e.pointerId === down.id) down = null
        }

        // Scroll events don't bubble; a capture listener on the container
        // also sees the inner PDF / image scrollers.
        const onScroll = (e: Event) => {
            lastScrollT = e.timeStamp || performance.now()
        }

        container.addEventListener("scroll", onScroll, { capture: true, passive: true })
        container.addEventListener("pointerdown", onDown)
        container.addEventListener("pointermove", onMove)
        container.addEventListener("pointerup", onUp)
        container.addEventListener("pointercancel", onCancel)
        return () => {
            cancelPending()
            container.removeEventListener("scroll", onScroll, { capture: true })
            container.removeEventListener("pointerdown", onDown)
            container.removeEventListener("pointermove", onMove)
            container.removeEventListener("pointerup", onUp)
            container.removeEventListener("pointercancel", onCancel)
        }
    }, [container, enabled])

    return ref
}
