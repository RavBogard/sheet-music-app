/**
 * Pure sizing logic for chord overlay rendering.
 *
 * Computes the minimum overlay width needed to:
 * 1. Fully cover the original chord text in the PDF
 * 2. Fit the transposed chord text being displayed
 *
 * Font size is derived from the chord's percentage height (h%) relative
 * to the live container height, so it scales correctly with zoom.
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

// Minimum font size to remain legible
const FONT_MIN_PX = 10

// Multiplier from absolute box height to font-size.
// The Vision API provides tight bounding boxes wrapping the text ink without padding.
// A scale of 1.0 maps the font size exactly to the original text's vertical height.
const H_PCT_TO_FONT_SCALE = 1.0

// Default chord row height as percentage of page (for AI-added chords with no size data).
// Typical hymnal/worship lead sheet chords occupy ~2.5-3.5% of a US Letter page height.
// 2.8% at a standard 1100px container yields ~27.7px — close to what most charts use.
const DEFAULT_CHORD_H_PCT = 2.8

/**
 * Compute all sizing values for a single chord overlay.
 *
 * @param chord              The ChordOverlay data (carries h% and w% from scan time)
 * @param displayText        The text that will be rendered (may be transposed)
 * @param containerWidthPx   Pixel width of the PDF page container at render time
 * @param containerHeightPx  Pixel height of the PDF page container at render time
 */
export function computeOverlayDimensions(
    chord: ChordOverlay,
    displayText: string,
    containerWidthPx: number,
    containerHeightPx: number,
): OverlayDimensions {
    const padH = 4

    // --- Font size ---
    // Priority 1: explicit user size override
    if (chord.sizeOverride?.pxHeight && chord.sizeOverride.pxHeight > 4) {
        const fontSizePx = Math.max(FONT_MIN_PX, chord.sizeOverride.pxHeight)
        return buildDimensions(chord, displayText, containerWidthPx, fontSizePx, padH)
    }

    // Priority 2: h% x containerHeightPx — zoom-reactive, stale-proof
    const hPct = chord.h ?? 0
    if (hPct > 0 && containerHeightPx > 0) {
        const rawPx = (hPct / 100) * containerHeightPx
        const fontSizePx = Math.max(FONT_MIN_PX, rawPx * H_PCT_TO_FONT_SCALE)
        return buildDimensions(chord, displayText, containerWidthPx, fontSizePx, padH)
    }

    // Priority 3: AI-added chords have no h — estimate from container height
    const fallbackPx = containerHeightPx > 0
        ? Math.max(FONT_MIN_PX, (containerHeightPx * DEFAULT_CHORD_H_PCT / 100) * H_PCT_TO_FONT_SCALE)
        : 16
    return buildDimensions(chord, displayText, containerWidthPx, fallbackPx, padH)
}

function buildDimensions(
    chord: ChordOverlay,
    displayText: string,
    containerWidthPx: number,
    fontSizePx: number,
    padH: number,
): OverlayDimensions {
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
