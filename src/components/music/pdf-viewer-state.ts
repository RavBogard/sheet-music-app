/**
 * Pure decision helpers for PDFViewer's render-reliability logic, extracted so
 * they can be unit-tested without rendering react-pdf (which needs a pdfjs
 * worker and does not run in jsdom). The timer/observer wiring lives in the
 * component; the DECISIONS live here.
 */

export interface RenderWatchdogInputs {
    hasSource: boolean
    loading: boolean
    hasError: boolean
    numPages: number
    renderTimedOut: boolean
}

/**
 * WS-05: should the render-stage watchdog be armed? Only once bytes are in hand
 * (source set, not loading, no error) but pdfjs hasn't yet reported its page
 * count (numPages === 0) and we haven't already timed out. When this is true and
 * stays true past the watchdog window, the viewer surfaces Retry instead of an
 * infinite "Rendering…" spinner.
 */
export function shouldStartRenderWatchdog(s: RenderWatchdogInputs): boolean {
    return s.hasSource && !s.loading && !s.hasError && s.numPages === 0 && !s.renderTimedOut
}

/**
 * WS-16: is a width change rotate-scale (orientation flip) rather than
 * scrollbar/layout jitter? Only resets the retry budget for genuine reflows.
 * Requires a prior real width so the initial 0→N measure doesn't count.
 */
export function isRotateScaleResize(prevWidth: number, newWidth: number, threshold = 120): boolean {
    return prevWidth > 0 && Math.abs(newWidth - prevWidth) >= threshold
}

export type FitMode = 'width' | 'page'

export interface FitPageInputs {
    /** Available container width in CSS px (already minus scrollbar slack). */
    containerWidth: number
    /** Available container height in CSS px. */
    containerHeight: number
    /** Page intrinsic aspect ratio = pageHeight / pageWidth (portrait > 1). */
    pageAspect: number
    /** Active fit mode. */
    mode: FitMode
    /** User zoom multiplier (1 = fit baseline). */
    zoom: number
}

/**
 * WS-14 / WS-26: compute the px width to render a PDF page at, honoring the
 * active fit mode.
 *
 * - `'width'` (default, current behavior): the page fills the container width,
 *   then the user zoom scales it. A tall portrait page in a wide landscape
 *   viewport overflows below the fold — this is fit-to-WIDTH.
 * - `'page'`: the page is sized so its HEIGHT fits the container height
 *   (`width = containerHeight / pageAspect`), capped at the container width so
 *   a wide/landscape page never exceeds the width. This makes a portrait chart
 *   fully visible in landscape with no vertical scroll. User zoom then scales.
 *
 * Guards: a non-positive containerHeight or pageAspect (page dims not yet
 * measured) falls back to the width contract so we never return 0/NaN and never
 * regress the default. zoom is clamped to >= 0.
 */
export function computeFitPageWidth(s: FitPageInputs): number {
    const zoom = s.zoom > 0 ? s.zoom : 1
    const widthFit = s.containerWidth * zoom
    if (s.mode !== 'page') return widthFit
    if (s.containerHeight <= 0 || s.pageAspect <= 0 || s.containerWidth <= 0) return widthFit
    const heightConstrainedWidth = s.containerHeight / s.pageAspect
    const fitPageBaseline = Math.min(s.containerWidth, heightConstrainedWidth)
    return fitPageBaseline * zoom
}
