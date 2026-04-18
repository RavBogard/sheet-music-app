/**
 * Background key detection from PDF chord charts.
 *
 * Uses pdfjs-dist text layer extraction (no AI cost) to extract chords
 * from page 1, then estimates the key using music-math heuristics.
 */

import { fetchFileById } from "@/lib/file-fetcher"
import { extractChordsFromPage } from "@/lib/pdf-chord-extractor"
import { estimateKey } from "@/lib/music-math"
import { logger } from "@/lib/logger"

/**
 * Detect the native key of a PDF chart by extracting chords from page 1.
 * Returns the estimated key string (e.g., "G", "Am") or null if detection fails.
 */
export async function detectKeyFromPdf(fileId: string): Promise<string | null> {
    try {
        const file = await fetchFileById(fileId, "application/pdf")
        if (!file) {
            logger.warn(`[KeyDetection] File not found: ${fileId}`)
            return null
        }

        if (!file.contentType.includes("pdf")) {
            return null
        }

        const pageChords = await extractChordsFromPage(
            new Uint8Array(file.buffer),
            1
        )

        if (!pageChords || pageChords.chords.length === 0) {
            return null
        }

        const chordTexts = pageChords.chords.map(c => c.text)
        return estimateKey(chordTexts)
    } catch (e) {
        logger.warn(`[KeyDetection] Failed for ${fileId}:`, e instanceof Error ? e.message : e)
        return null
    }
}
