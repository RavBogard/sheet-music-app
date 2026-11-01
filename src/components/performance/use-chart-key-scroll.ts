"use client"

/**
 * Keyboard scrolling inside the open chart (WCAG 2.1.1). Arrow Up/Down move a
 * line, Page Up/Down and Space (Shift+Space back) move most of a screen, Home
 * and End jump to the top and bottom.
 *
 * Scrolling stays within the current chart: it never moves to the next or
 * previous chart (pedal chart-to-chart navigation is a separate, deferred
 * decision). It scrolls the viewer's own scroller, the same one the edge tap
 * zones use, so PDF and image charts scroll their inner pane.
 *
 * Keys typed into a field or pressed on a button, link or slider are left to
 * that control. Nothing happens while a menu, sheet or chord editor owns the
 * screen (`isSuppressed`).
 */

import { useEffect, useRef } from "react"
import { resolveTurnTarget, type TurnViewerKind } from "./chart-scroll-target"

export const LINE_SCROLL_PX = 48
export const PAGE_SCROLL_FRACTION = 0.85

const INTERACTIVE_SELECTOR = [
    "input",
    "textarea",
    "select",
    "button",
    "a[href]",
    "[contenteditable='true']",
    "[role=button]",
    "[role=slider]",
    "[role=textbox]",
    "[role=menuitem]",
    "[role=option]",
    "[role=switch]",
    "[role=combobox]",
].join(",")

export interface ChartKeyScrollOptions {
    /** The chart container (PDFOverlay's scroll wrapper). */
    getContainer: () => HTMLElement | null
    /** The surface the keys belong to (the overlay root). */
    getSurface: () => HTMLElement | null
    viewerKind: TurnViewerKind
    isSuppressed: () => boolean
}

/** The new scrollTop for a key, or null when the key isn't a scroll key. */
export function planKeyScroll(
    key: string,
    shiftKey: boolean,
    m: { scrollTop: number; clientHeight: number; scrollHeight: number },
): number | null {
    const max = Math.max(0, m.scrollHeight - m.clientHeight)
    const page = Math.max(LINE_SCROLL_PX, Math.round(m.clientHeight * PAGE_SCROLL_FRACTION))
    let top: number
    switch (key) {
        case "ArrowDown": top = m.scrollTop + LINE_SCROLL_PX; break
        case "ArrowUp": top = m.scrollTop - LINE_SCROLL_PX; break
        case "PageDown": top = m.scrollTop + page; break
        case "PageUp": top = m.scrollTop - page; break
        case " ":
        case "Spacebar": top = m.scrollTop + (shiftKey ? -page : page); break
        case "Home": top = 0; break
        case "End": top = max; break
        default: return null
    }
    return Math.min(max, Math.max(0, top))
}

export function useChartKeyScroll(options: ChartKeyScrollOptions): void {
    const optsRef = useRef(options)
    useEffect(() => { optsRef.current = options })

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
            const o = optsRef.current
            const surface = o.getSurface()
            const container = o.getContainer()
            if (!surface || !container) return
            const target = e.target instanceof Element ? e.target : null
            // Only keys aimed at the chart surface (or nowhere in particular).
            if (target && target !== document.body && !surface.contains(target)) return
            if (target && target !== container && target.closest(INTERACTIVE_SELECTOR)) return
            if (o.isSuppressed()) return
            const turn = resolveTurnTarget(o.viewerKind, container)
            if (!turn) return
            const { scroller } = turn
            const top = planKeyScroll(e.key, e.shiftKey, {
                scrollTop: scroller.scrollTop,
                clientHeight: scroller.clientHeight,
                scrollHeight: scroller.scrollHeight,
            })
            if (top === null) return
            e.preventDefault()
            if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top })
            else scroller.scrollTop = top
        }
        document.addEventListener("keydown", onKeyDown)
        return () => document.removeEventListener("keydown", onKeyDown)
    }, [])
}
