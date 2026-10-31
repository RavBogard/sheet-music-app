/**
 * PERF-05 — which element a page turn scrolls, and whether the chart in it has
 * finished rendering. Wrapper-level: it reads seams the viewers already expose
 * (`data-pdf-scroll`, `data-pdf-page`, `data-image-scroll`, the MusicXML print
 * target, `data-text-score`) and changes nothing inside them.
 *
 * Scrollers per viewer:
 * - PDF (and chordpro, which renders through PDFViewer): `[data-pdf-scroll]`.
 * - Image: `[data-image-scroll]`.
 * - MusicXML and text: these viewers have no scroller of their own; PDFOverlay's
 *   chart container IS their scroller (SmartScoreViewer's `findScrollableAncestor`
 *   relies on the same fact). It is used only once that viewer's rendered
 *   content is present in it.
 * - Audio / unknown: no target. Tap zones do nothing.
 *
 * There is never a fallback to the outer container for PDF or image: if their
 * scroller is missing, the turn does nothing.
 */

import type { ViewerKind } from "./resolveViewerKind"

export type TurnViewerKind = ViewerKind

export interface TurnTarget {
    scroller: HTMLElement
    /** The viewer has finished rendering (not loading, not failed). */
    ready: boolean
}

function elementAt(point: { x: number; y: number } | undefined): Element | null {
    if (!point || typeof document === "undefined" || typeof document.elementFromPoint !== "function") return null
    try {
        return document.elementFromPoint(point.x, point.y)
    } catch {
        return null
    }
}

/** The viewer's own scroller: under the tap point first, else the one in the container. */
function viewerScroller(container: HTMLElement, selector: string, point?: { x: number; y: number }): HTMLElement | null {
    const hit = elementAt(point)?.closest(selector)
    if (hit instanceof HTMLElement && container.contains(hit)) return hit
    const found = container.querySelector(selector)
    return found instanceof HTMLElement ? found : null
}

export function resolveTurnTarget(
    kind: TurnViewerKind,
    container: HTMLElement,
    point?: { x: number; y: number },
): TurnTarget | null {
    switch (kind) {
        case "pdf":
        case "chordpro": {
            const scroller = viewerScroller(container, "[data-pdf-scroll]", point)
            if (!scroller) return null
            // Every page has painted its canvas. While loading, failed, or
            // still measuring, there are no pages (or pages without canvases).
            const pages = Array.from(scroller.querySelectorAll("[data-pdf-page]"))
            const ready = pages.length > 0 && pages.every((p) => p.querySelector("canvas") !== null)
            return { scroller, ready }
        }
        case "image": {
            const scroller = viewerScroller(container, "[data-image-scroll]", point)
            if (!scroller) return null
            const img = scroller.querySelector("img")
            const ready =
                !!img && img.complete && img.naturalWidth > 0 && scroller.querySelector('[role="alert"]') === null
            return { scroller, ready }
        }
        case "musicxml": {
            const score = container.querySelector('[data-print-target="musicxml-score"]')
            // Rendered SVG present, no "rendering score" overlay.
            const ready = !!score?.querySelector("svg") && container.querySelector('[role="status"]') === null
            return { scroller: container, ready }
        }
        case "text": {
            const ready = container.querySelector("[data-text-score]") !== null
            return { scroller: container, ready }
        }
        default:
            return null
    }
}
