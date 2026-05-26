/**
 * Server-side PDF chord extraction using pdfjs-dist.
 *
 * Extracts chord symbol positions from PDF pages without a browser.
 * Coordinates are in PDF points (72pt = 1 inch) and map directly
 * to pdf-lib's drawing coordinate system — no conversion needed.
 *
 * Algorithm:
 *  1. Load PDF with pdfjs-dist (Node.js compatible)
 *  2. Extract text items with positions from each page
 *  3. Two-pass merge to reassemble split characters (F + # + m + 7 → F#m7)
 *  4. Chord regex filtering with exclusion list
 *  5. Return structured chord positions per page
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface ExtractedChord {
    text: string       // Clean chord text (e.g., "F#m7", "Bb/D")
    x: number          // X position in PDF points (left edge)
    y: number          // Y position in PDF points (baseline, bottom-up)
    w: number          // Width in PDF points
    h: number          // Height in PDF points (font size)
}

export interface PageChords {
    page: number       // 1-indexed page number
    chords: ExtractedChord[]
    pageWidth: number  // PDF page width in points
    pageHeight: number // PDF page height in points
}

export interface ExtractionResult {
    pages: PageChords[]
    totalChords: number
}

// ─── Lazy pdfjs-dist loader ──────────────────────────────────────────
// Dynamic import prevents Next.js from bundling pdfjs-dist into client code.
// Only loaded when server-side extraction functions are actually called.

let _pdfjsModule: typeof import('pdfjs-dist') | null = null

// Exported (v70-04) so the setlist-import document extractor reuses the same
// server-side loader (legacy build) instead of duplicating it. Callers MUST
// spread `PDFJS_NODE_SAFE_OPTIONS` into their `getDocument({...})` call —
// see the constant's docstring below for why.
export async function getPdfjs() {
    if (!_pdfjsModule) {
        _pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs")
    }
    return _pdfjsModule
}

/**
 * Documented Node-safe `getDocument()` options for pdfjs-dist v5 in
 * serverless Node. Required because pdfjs-dist's default
 * fake-worker path (triggered by `GlobalWorkerOptions.workerSrc=""`
 * or by not configuring a worker at all) evals a code segment that
 * constructs `new DOMMatrix()`. Vercel serverless Node (<22.13) does
 * not expose `DOMMatrix` globally → `DOMMatrix is not defined`.
 *
 * `disableWorker:true` bypasses the fake-worker entirely; the
 * remaining flags disable other DOM-coupled paths (font enumeration,
 * worker fetch, eval-based optimizations) that the text-extraction
 * + chord-extraction codepaths do not need.
 *
 * Caught 2026-05-26 by supervisor dry-running
 * `backfill_searchable_text({dryRun:true, limit:10})` against prod
 * (10/10 errors, all "DOMMatrix is not defined"). Closes the F4-B
 * Phase 4 APPLY blocker AND incidentally restores
 * `/api/setlists/import/extract-document` (PDF branch),
 * `/api/setlist/print/*`, and `/api/library/detect-key`, all of
 * which were silently failing on the same code path.
 */
export const PDFJS_NODE_SAFE_OPTIONS = {
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
} as const

// ─── Chord Detection ─────────────────────────────────────────────────

import { isChord, cleanChordText } from './chord-utils'

// ─── Text Merging ────────────────────────────────────────────────────

interface TextItem {
    text: string
    x: number
    y: number
    w: number
    h: number
    r: number  // right edge (x + w)
}

/**
 * Two-pass merge algorithm for reassembling chord symbols
 * that PDF creators split across multiple text items.
 */
function mergeTextItems(items: TextItem[]): TextItem[] {
    if (items.length === 0) return []

    // Sort: top-to-bottom (Y descending in PDF coords), then left-to-right
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) < 5) return a.x - b.x
        return b.y - a.y
    })

    // ── Pass 1: Merge horizontally adjacent ──
    const pass1: TextItem[] = []
    let cur = { ...items[0] }

    for (let i = 1; i < items.length; i++) {
        const next = items[i]
        const maxH = Math.max(cur.h, next.h, 8)
        const sameLine = Math.abs(cur.y - next.y) < maxH * 1.5
        const gap = next.x - cur.r
        const isClose = gap >= -3 && gap < maxH * 0.6

        if (sameLine && isClose) {
            cur = {
                ...cur,
                text: cur.text + next.text,
                r: Math.max(cur.r, next.r),
                w: Math.max(cur.r, next.r) - cur.x,
                h: Math.max(cur.h, next.h),
                y: Math.max(cur.y, next.y),
            }
        } else {
            pass1.push(cur)
            cur = { ...next }
        }
    }
    pass1.push(cur)

    // ── Pass 2: Absorb trailing chord suffixes ──
    const pass2: TextItem[] = []

    for (let i = 0; i < pass1.length; i++) {
        let item = { ...pass1[i] }
        const looksLikeChordStart = /^[A-G][b#]?(?:m|M|maj|min|dim|aug|sus|add|no|alt|dom)?/.test(item.text)

        if (looksLikeChordStart) {
            while (i + 1 < pass1.length) {
                const next = pass1[i + 1]
                const nextText = next.text.trim()

                const isChordSuffix =
                    /^\d+$/.test(nextText) ||
                    /^(sus|add|no|maj|min|dim|aug|dom)\d*$/.test(nextText) ||
                    /^\/[A-G][b#]?$/.test(nextText)

                if (!isChordSuffix) break

                const sameLine = Math.abs(item.y - next.y) < Math.max(item.h, next.h, 8) * 2
                const gap = next.x - item.r
                if (!sameLine || gap > item.h * 2 || gap < -item.w) break

                item = {
                    ...item,
                    text: item.text + nextText,
                    r: Math.max(item.r, next.r),
                    w: Math.max(item.r, next.r) - item.x,
                }
                i++
            }
        }

        pass2.push(item)
    }

    return pass2
}

// ─── Main Extraction ─────────────────────────────────────────────────

/**
 * Extract chord positions from all pages of a PDF.
 */
export async function extractChordsFromPdf(
    pdfData: Uint8Array | ArrayBuffer
): Promise<ExtractionResult> {
    const pdfjs = await getPdfjs()
    const data = pdfData instanceof ArrayBuffer ? new Uint8Array(pdfData) : pdfData

    const pdfDoc = await pdfjs.getDocument({
        ...PDFJS_NODE_SAFE_OPTIONS,
        data,
    }).promise

    const pages: PageChords[] = []
    let totalChords = 0

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const textContent = await page.getTextContent()

        const items: TextItem[] = (textContent.items as Array<{ str?: string; transform?: number[]; width?: number; height?: number }>)
            .filter(item => item.str && item.str.trim())
            .map(item => {
                const x = item.transform?.[4] ?? 0
                const y = item.transform?.[5] ?? 0
                const w = item.width || 0
                const h = item.height || 0
                return { text: item.str!.trim(), x, y, w, h, r: x + w }
            })

        const merged = mergeTextItems(items)

        const chords: ExtractedChord[] = merged
            .filter(item => isChord(item.text))
            .map(item => ({
                text: cleanChordText(item.text),
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
            }))

        totalChords += chords.length
        pages.push({
            page: pageNum,
            chords,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
        })
    }

    return { pages, totalChords }
}

/**
 * Extract chords from a single page of a PDF.
 */
export async function extractChordsFromPage(
    pdfData: Uint8Array | ArrayBuffer,
    pageNumber: number
): Promise<PageChords | null> {
    const pdfjs = await getPdfjs()
    const data = pdfData instanceof ArrayBuffer ? new Uint8Array(pdfData) : pdfData

    const pdfDoc = await pdfjs.getDocument({
        ...PDFJS_NODE_SAFE_OPTIONS,
        data,
    }).promise

    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return null

    const page = await pdfDoc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()

    type PdfTextItem = { str: string; transform: number[]; width?: number; height?: number }
    const rawItems = textContent.items as PdfTextItem[]
    const items: TextItem[] = rawItems
        .filter((item) => item.str && item.str.trim())
        .map((item) => ({
            text: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            w: item.width || 0,
            h: item.height || 0,
            r: item.transform[4] + (item.width || 0),
        }))

    const merged = mergeTextItems(items)
    const chords = merged
        .filter(item => isChord(item.text))
        .map(item => ({
            text: cleanChordText(item.text),
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
        }))

    return {
        page: pageNumber,
        chords,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
    }
}
