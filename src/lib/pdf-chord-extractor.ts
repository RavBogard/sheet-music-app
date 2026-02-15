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

let _pdfjsModule: any = null

async function getPdfjs() {
    if (!_pdfjsModule) {
        _pdfjsModule = await import("pdfjs-dist/legacy/build/pdf.mjs")
        // Disable worker threads in server/serverless context
        if (_pdfjsModule.GlobalWorkerOptions) {
            _pdfjsModule.GlobalWorkerOptions.workerSrc = ""
        }
    }
    return _pdfjsModule
}

// ─── Chord Detection ─────────────────────────────────────────────────

// Comprehensive chord regex for worship lead sheets
const CHORD_REGEX = /^[A-G][b#]?(?:m|min|maj|dim|aug|sus|add|M|no|alt|dom)?(?:\d{0,2})?(?:(?:sus|add|no|maj|min|dim|aug|dom)\d{0,2})*(?:\/[A-G][b#]?)?$/

// Words that match the regex but aren't chords
const EXCLUDED_WORDS = new Set([
    "A",       // Too ambiguous as a standalone letter
    "I", "II", "III", "IV", "V", "VI", "VII",
    "Fine", "Da", "Dal",
])

// Performance directions and section markers
const SECTION_MARKERS = new Set([
    "Chorus", "Bridge", "Coda", "Fine", "Ending",
    "DC", "DS", "CODA", "FINE",
])

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

// ─── Chord Filtering ─────────────────────────────────────────────────

function isChord(text: string): boolean {
    const clean = text.replace(/[^\w#b\/]/g, "")
    if (!clean) return false
    if (EXCLUDED_WORDS.has(clean)) return false
    if (SECTION_MARKERS.has(clean)) return false
    if (clean.length > 10) return false
    return CHORD_REGEX.test(clean)
}

function cleanChordText(text: string): string {
    let clean = text.replace(/\u266F/g, "#").replace(/\u266D/g, "b")
    clean = clean.replace(/[^\w#b\/]/g, "")
    return clean
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
        data,
        useSystemFonts: true,
        verbosity: 0,
    }).promise

    const pages: PageChords[] = []
    let totalChords = 0

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })
        const textContent = await page.getTextContent()

        const items: TextItem[] = textContent.items
            .filter((item: any) => item.str && item.str.trim())
            .map((item: any) => {
                const x = item.transform[4]
                const y = item.transform[5]
                const w = item.width || 0
                const h = item.height || 0
                return { text: item.str.trim(), x, y, w, h, r: x + w }
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
        data,
        useSystemFonts: true,
        verbosity: 0,
    }).promise

    if (pageNumber < 1 || pageNumber > pdfDoc.numPages) return null

    const page = await pdfDoc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.0 })
    const textContent = await page.getTextContent()

    const items: TextItem[] = textContent.items
        .filter((item: any) => item.str && item.str.trim())
        .map((item: any) => ({
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
