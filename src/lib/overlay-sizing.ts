/**
 * Pure sizing logic for chord overlay rendering.
 *
 * Computes the minimum overlay width needed to:
 * 1. Fully cover the original chord text in the PDF
 * 2. Fit the transposed chord text being displayed
 *
 * Uses a character-width heuristic table calibrated for
 * Times New Roman Bold (the overlay font). No canvas measurement needed.
 */

import type { ChordOverlay } from "@/lib/chord-cache"

// Average character width as a fraction of font-size (em) for Times New Roman Bold.
// Values are conservative (slightly wide) — we want to over-cover, not under-cover.
const CHAR_WIDTH_EM: Record<string, number> = {
    'W': 0.88, 'M': 0.84, 'm': 0.68,
    '#': 0.64, 'b': 0.60, '/': 0.44,
    'A': 0.72, 'B': 0.70, 'C': 0.70, 'D': 0.74, 'E': 0.66,
    'F': 0.62, 'G': 0.76, 'a': 0.56, 'd': 0.60, 'i': 0.34,
    's': 0.48, 'u': 0.58, 'j': 0.36, 'n': 0.58, 'o': 0.56,
    '7': 0.54, '9': 0.54, '1': 0.46, '3': 0.52, '4': 0.52,
    '5': 0.54, '6': 0.54, '2': 0.52, '0': 0.56,
    'default': 0.58,
}

/**
 * Estimate the rendered pixel width of a chord string in the overlay font.
 */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
    if (!text) return 0
    let width = 0
    for (const char of text) {
        const ratio = CHAR_WIDTH_EM[char] ?? CHAR_WIDTH_EM['default']
        width += fontSizePx * ratio
    }
    // 8% buffer for kerning variance and anti-aliasing
    return width * 1.08
}

export interface OverlayDimensions {
    fontSizePx: number
    /** Minimum width in px to cover the original chord text */
    coverWidthPx: number
    /** Final overlay width — max(cover, transposed text width) */
    minWidthPx: number
    /** Horizontal padding applied to the overlay div */
    padH: number
}

/**
 * Compute all sizing values for a single chord overlay.
 *
 * @param chord           The ChordOverlay data (carries original width measurement)
 * @param displayText     The text that will be rendered (may be transposed)
 * @param containerWidthPx  Pixel width of the PDF page container at render time
 */
export function computeOverlayDimensions(
    chord: ChordOverlay,
    displayText: string,
    containerWidthPx: number,
): OverlayDimensions {
    const padH = 4

    // --- Font size ---
    // sizeOverride takes priority, then detected pxHeight, then fallback
    const rawHeight = chord.sizeOverride?.pxHeight ?? chord.pxHeight ?? 0
    const fontSizePx = rawHeight > 4
        ? Math.max(12, Math.min(rawHeight * 0.85, 28))
        : 16

    // --- Cover width: must cover the ORIGINAL chord text in the PDF ---
    const originalWPct = chord.sizeOverride?.wPct ?? chord.w ?? 0
    let coverWidthPx: number

    if (originalWPct > 0 && containerWidthPx > 0) {
        // Convert the scanned percentage width to pixels
        coverWidthPx = (originalWPct / 100) * containerWidthPx
    } else {
        // Fallback: estimate from original text character count
        coverWidthPx = estimateTextWidthPx(
            chord.originalText || chord.text,
            fontSizePx,
        )
    }
    // Add horizontal padding
    coverWidthPx += padH * 2

    // --- Transposed text width ---
    const transposedWidthPx = estimateTextWidthPx(displayText, fontSizePx) + padH * 2

    // --- Final: accommodate whichever is larger ---
    const minWidthPx = Math.max(coverWidthPx, transposedWidthPx)

    return { fontSizePx, coverWidthPx, minWidthPx, padH }
}
