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
