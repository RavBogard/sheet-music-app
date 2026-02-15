/**
 * Server-side PDF transposition renderer.
 *
 * Takes an original PDF + extracted chord positions + transposition options
 * and produces a new PDF with chords replaced by their transposed equivalents.
 *
 * Uses pdf-lib to draw white rectangles over original chords and
 * write transposed text at the same positions. Coordinates from
 * pdf-chord-extractor.ts map directly — no conversion needed.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib"
import { transposeChord } from "@/lib/music-math"
import type { PageChords, ExtractedChord } from "@/lib/pdf-chord-extractor"

// ─── Types ───────────────────────────────────────────────────────────

export interface TransposeOptions {
    semitones: number           // +/- semitone offset
    preferFlats?: boolean       // Force flat notation (Bb vs A#)
    capoFret?: number           // If set, add capo notation to output
    chordColor?: {              // RGB 0-1 for transposed chord text
        r: number
        g: number
        b: number
    }
}

export interface TransposeResult {
    pdf: Uint8Array             // The modified PDF bytes
    stats: {
        pagesProcessed: number
        chordsTransposed: number
        pagesSkipped: number    // Pages with no chords
    }
}

// ─── Default Colors ──────────────────────────────────────────────────

const DEFAULT_TRANSPOSED_COLOR = { r: 0, g: 0, b: 0 }  // Black for print
const COVER_COLOR = rgb(1, 1, 1)  // White rectangle to cover originals

// ─── Renderer ────────────────────────────────────────────────────────

/**
 * Apply transposition to a PDF using pre-extracted chord positions.
 *
 * @param pdfData    - Original PDF as Uint8Array or ArrayBuffer
 * @param chordPages - Chord positions from pdf-chord-extractor
 * @param options    - Transposition parameters
 * @returns          - New PDF bytes and stats
 */
export async function transposePdf(
    pdfData: Uint8Array | ArrayBuffer,
    chordPages: PageChords[],
    options: TransposeOptions
): Promise<TransposeResult> {
    const { semitones, preferFlats, chordColor } = options

    // Load the PDF for modification
    const doc = await PDFDocument.load(pdfData, { ignoreEncryption: true })
    const font = await doc.embedFont(StandardFonts.HelveticaBold)

    const color = chordColor
        ? rgb(chordColor.r, chordColor.g, chordColor.b)
        : rgb(DEFAULT_TRANSPOSED_COLOR.r, DEFAULT_TRANSPOSED_COLOR.g, DEFAULT_TRANSPOSED_COLOR.b)

    let chordsTransposed = 0
    let pagesProcessed = 0
    let pagesSkipped = 0

    for (const pageData of chordPages) {
        const pageIndex = pageData.page - 1 // pdf-lib uses 0-indexed

        // Safety: skip if page doesn't exist in the document
        if (pageIndex < 0 || pageIndex >= doc.getPageCount()) {
            pagesSkipped++
            continue
        }

        if (pageData.chords.length === 0) {
            pagesSkipped++
            continue
        }

        const page = doc.getPage(pageIndex)
        pagesProcessed++

        for (const chord of pageData.chords) {
            const transposed = transposeChord(chord.text, semitones, preferFlats)

            // Calculate cover rectangle dimensions
            // Must be wide enough for BOTH the original and transposed text
            const transposedWidth = font.widthOfTextAtSize(transposed, chord.h * 0.9)
            const coverWidth = Math.max(chord.w, transposedWidth) + 6  // 3pt padding each side
            const coverHeight = chord.h + 4  // 2pt padding top and bottom

            // Draw white rectangle to cover original chord
            // Position: slightly below baseline and left of chord
            page.drawRectangle({
                x: chord.x - 2,
                y: chord.y - (chord.h * 0.25) - 1,  // Extend below baseline for descenders
                width: coverWidth,
                height: coverHeight,
                color: COVER_COLOR,
            })

            // Draw transposed chord at the original position
            page.drawText(transposed, {
                x: chord.x,
                y: chord.y,
                size: chord.h * 0.9,  // Slightly smaller than detected height for clean fit
                font,
                color,
            })

            chordsTransposed++
        }
    }

    const pdfBytes = await doc.save()

    return {
        pdf: pdfBytes,
        stats: {
            pagesProcessed,
            chordsTransposed,
            pagesSkipped,
        },
    }
}

/**
 * Convenience: extract + transpose in one call.
 * For use when you don't have cached chord data.
 */
export async function extractAndTransposePdf(
    pdfData: Uint8Array | ArrayBuffer,
    options: TransposeOptions
): Promise<{ result: TransposeResult; chordPages: PageChords[] }> {
    // Dynamic import to avoid circular dependency at module level
    const { extractChordsFromPdf } = await import("@/lib/pdf-chord-extractor")

    const { pages: chordPages } = await extractChordsFromPdf(pdfData)
    const result = await transposePdf(pdfData, chordPages, options)

    return { result, chordPages }
}
