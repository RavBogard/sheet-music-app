"use client"

/**
 * PERF-05 — wires edge tap zones onto the chart scroll container.
 *
 * One wrapper for every viewer (PDF, MusicXML, text, image): native pointer
 * listeners on the container PDFOverlay already renders, nothing inside the
 * viewers. At turn time it scrolls the nearest scrollable element under the
 * tap (PDFViewer and ImageScoreViewer scroll inside themselves; MusicXML and
 * text scroll the container), found by walking up from the tap target.
 *
 * A turn runs DOUBLE_TAP_MS after the tap so a double-tap can cancel it.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
    classifyTap,
    isDoubleTap,
    planTurn,
    DOUBLE_TAP_MS,
    TAP_ZONE_IGNORE_SELECTOR,
    type TapSample,
    type TurnDirection,
} from "./edge-tap-zones"

export interface EdgeTapZoneOptions {
    enabled: boolean
    isRtl: boolean
    /** Read at tap time: zoomed in past fit-width. */
    isZoomedIn: () => boolean
    /** Read at press and at turn time: a long-press, popover or sheet owns the screen. */
    isSuppressed: () => boolean
    onNextChart: () => void
    onPreviousChart: () => void
}

function isScrollableY(el: Element): boolean {
    const style = window.getComputedStyle(el)
    const oy = style.overflowY
    return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1
}

/** Nearest vertically scrollable element from `from` up to (and including) `container`. */
export function findScrollTarget(from: Element | null, container: HTMLElement): HTMLElement {
    let el: Element | null = from
    while (el && el !== container && container.contains(el)) {
        if (el instanceof HTMLElement && isScrollableY(el)) return el
        el = el.parentElement
    }
    return container
}

function nativeZoomedIn(): boolean {
    const scale = typeof window !== "undefined" ? window.visualViewport?.scale : undefined
    return typeof scale === "number" && scale > 1.01
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
        let down: (TapSample & { id: number; target: Element | null }) | null = null
        let maxMove = 0
        let multiTouch = false
        let ignoreGesture = false
        let lastTapUpT: number | null = null
        let pending: { timer: ReturnType<typeof setTimeout> } | null = null

        const cancelPending = () => {
            if (pending) clearTimeout(pending.timer)
            pending = null
        }

        const runTurn = (direction: TurnDirection, target: Element | null) => {
            const o = optsRef.current
            if (o.isSuppressed()) return
            const scroller = findScrollTarget(target, container)
            const plan = planTurn(direction, {
                scrollTop: scroller.scrollTop,
                clientHeight: scroller.clientHeight,
                scrollHeight: scroller.scrollHeight,
            })
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
            if (target?.closest(TAP_ZONE_IGNORE_SELECTOR)) ignoreGesture = true
            if (optsRef.current.isSuppressed()) ignoreGesture = true
            down = { x: e.clientX, y: e.clientY, t: now, id: e.pointerId, target }
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
            const now = e.timeStamp || performance.now()
            const rect = container.getBoundingClientRect()
            const o = optsRef.current
            const direction = classifyTap(start, { x: e.clientX, y: e.clientY, t: now }, rect, {
                multiTouch,
                maxMovePx: maxMove,
                zoomedIn: o.isZoomedIn() || nativeZoomedIn(),
                suppressed: o.isSuppressed(),
                isRtl: o.isRtl,
            })
            if (!direction) return
            lastTapUpT = now
            cancelPending()
            const timer = setTimeout(() => {
                pending = null
                runTurn(direction, start.target)
            }, DOUBLE_TAP_MS)
            pending = { timer }
        }

        const onCancel = (e: PointerEvent) => {
            pointers.delete(e.pointerId)
            if (down && e.pointerId === down.id) down = null
        }

        container.addEventListener("pointerdown", onDown)
        container.addEventListener("pointermove", onMove)
        container.addEventListener("pointerup", onUp)
        container.addEventListener("pointercancel", onCancel)
        return () => {
            cancelPending()
            container.removeEventListener("pointerdown", onDown)
            container.removeEventListener("pointermove", onMove)
            container.removeEventListener("pointerup", onUp)
            container.removeEventListener("pointercancel", onCancel)
        }
    }, [container, enabled])

    return ref
}
