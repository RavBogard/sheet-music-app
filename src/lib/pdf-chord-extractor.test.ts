import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for pdf-chord-extractor.ts
 *
 * Mocks pdfjs-dist to provide controlled text items at known positions.
 * Uses real chord-utils (isChord, cleanChordText) for integration accuracy.
 */

// ── Mock pdfjs-dist ──

interface MockTextItem {
    str: string
    transform: number[]
    width: number
    height: number
}

function createMockPage(textItems: MockTextItem[], width = 612, height = 792) {
    return {
        getViewport: vi.fn().mockReturnValue({ width, height }),
        getTextContent: vi.fn().mockResolvedValue({
            items: textItems,
        }),
    }
}

function createMockPdfDoc(pages: ReturnType<typeof createMockPage>[]) {
    return {
        numPages: pages.length,
        getPage: vi.fn().mockImplementation((pageNum: number) => {
            if (pageNum < 1 || pageNum > pages.length) {
                throw new Error(`Invalid page number: ${pageNum}`)
            }
            return Promise.resolve(pages[pageNum - 1])
        }),
    }
}

function textItem(str: string, x: number, y: number, w: number, h = 12): MockTextItem {
    return { str, transform: [1, 0, 0, 1, x, y], width: w, height: h }
}

// Mock the pdfjs-dist module
const mockGetDocument = vi.fn()

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
    getDocument: mockGetDocument,
    GlobalWorkerOptions: { workerSrc: '' },
}))

// Do NOT mock chord-utils — use real implementation
// vi.mock('./chord-utils') ← intentionally not mocked

describe('pdf-chord-extractor', () => {
    let extractChordsFromPdf: typeof import('./pdf-chord-extractor').extractChordsFromPdf
    let extractChordsFromPage: typeof import('./pdf-chord-extractor').extractChordsFromPage

    beforeEach(async () => {
        vi.resetModules()
        mockGetDocument.mockReset()
        // Re-import to get fresh module state
        const mod = await import('./pdf-chord-extractor')
        extractChordsFromPdf = mod.extractChordsFromPdf
        extractChordsFromPage = mod.extractChordsFromPage
    })

    describe('extractChordsFromPdf', () => {
        it('extracts chords from a single-page PDF', async () => {
            const page = createMockPage([
                textItem('Am', 50, 700, 20),
                textItem('G', 150, 700, 12),
                textItem('C', 250, 700, 12),
                textItem('F', 350, 700, 12),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.pages).toHaveLength(1)
            expect(result.totalChords).toBe(4)
            expect(result.pages[0].chords.map(c => c.text)).toEqual(['Am', 'G', 'C', 'F'])
            expect(result.pages[0].page).toBe(1)
            expect(result.pages[0].pageWidth).toBe(612)
            expect(result.pages[0].pageHeight).toBe(792)
        })

        it('returns 0 chords for PDF with no chord-like text', async () => {
            const page = createMockPage([
                textItem('Hello World', 50, 700, 80),
                textItem('This is a song', 50, 680, 100),
                textItem('Verse 1', 50, 660, 50),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(0)
            expect(result.pages[0].chords).toHaveLength(0)
        })

        it('filters out lyrics and section markers', async () => {
            const page = createMockPage([
                textItem('Verse', 50, 700, 40),    // section marker — filtered
                textItem('Am', 50, 680, 20),         // chord — kept
                textItem('Hallelujah', 150, 680, 80), // lyric — filtered
                textItem('G', 300, 680, 12),          // chord — kept
                textItem('Chorus', 50, 640, 50),     // section marker — filtered
                textItem('D', 50, 620, 12),           // chord — kept
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(3)
            expect(result.pages[0].chords.map(c => c.text)).toEqual(['Am', 'G', 'D'])
        })

        it('extracts chords from multiple pages separately', async () => {
            const page1 = createMockPage([
                textItem('C', 50, 700, 12),
                textItem('G', 150, 700, 12),
            ])
            const page2 = createMockPage([
                textItem('Am', 50, 700, 20),
                textItem('F', 150, 700, 12),
                textItem('Dm', 250, 700, 20),
            ])
            const doc = createMockPdfDoc([page1, page2])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.pages).toHaveLength(2)
            expect(result.totalChords).toBe(5)
            expect(result.pages[0].page).toBe(1)
            expect(result.pages[0].chords.map(c => c.text)).toEqual(['C', 'G'])
            expect(result.pages[1].page).toBe(2)
            expect(result.pages[1].chords.map(c => c.text)).toEqual(['Am', 'F', 'Dm'])
        })

        it('merges horizontally adjacent text items into chords', async () => {
            // "F" + "#" + "m" at close x positions on same line → "F#m"
            const page = createMockPage([
                textItem('F', 50, 700, 8, 12),
                textItem('#', 58, 700, 6, 12),
                textItem('m', 64, 700, 8, 12),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(1)
            expect(result.pages[0].chords[0].text).toBe('F#m')
        })

        it('does not merge items on different lines', async () => {
            const page = createMockPage([
                textItem('Am', 50, 700, 20, 12),
                textItem('G', 50, 650, 12, 12),  // Different Y — different line
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(2)
            expect(result.pages[0].chords.map(c => c.text)).toEqual(['Am', 'G'])
        })

        it('handles empty page (no text items)', async () => {
            const page = createMockPage([])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(0)
            expect(result.pages[0].chords).toHaveLength(0)
        })

        it('filters blank text items', async () => {
            const page = createMockPage([
                textItem('', 50, 700, 0),
                textItem('  ', 100, 700, 10),
                textItem('Am', 200, 700, 20),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(1)
            expect(result.pages[0].chords[0].text).toBe('Am')
        })

        it('merges chord suffix (slash bass note)', async () => {
            // "G" then "/B" nearby — pass 2 should absorb "/B" as chord suffix
            const page = createMockPage([
                textItem('G', 50, 700, 10, 12),
                textItem('/B', 60, 700, 14, 12),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(1)
            expect(result.pages[0].chords[0].text).toBe('G/B')
        })

        it('merges numeric suffix onto chord start', async () => {
            // "Am" then "7" nearby → "Am7"
            const page = createMockPage([
                textItem('Am', 50, 700, 16, 12),
                textItem('7', 66, 700, 8, 12),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            expect(result.totalChords).toBe(1)
            expect(result.pages[0].chords[0].text).toBe('Am7')
        })

        it('preserves chord position coordinates', async () => {
            const page = createMockPage([
                textItem('Dm', 123, 456, 20, 14),
            ])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPdf(new Uint8Array([1, 2, 3]))

            const chord = result.pages[0].chords[0]
            expect(chord.x).toBe(123)
            expect(chord.y).toBe(456)
            expect(chord.w).toBe(20)
            expect(chord.h).toBe(14)
        })

        it('accepts ArrayBuffer input', async () => {
            const page = createMockPage([textItem('C', 50, 700, 12)])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const buffer = new ArrayBuffer(3)
            const result = await extractChordsFromPdf(buffer)

            expect(result.totalChords).toBe(1)
        })
    })

    describe('extractChordsFromPage', () => {
        it('returns chords for a valid page number', async () => {
            const page1 = createMockPage([textItem('C', 50, 700, 12)])
            const page2 = createMockPage([textItem('Am', 50, 700, 20), textItem('F', 150, 700, 12)])
            const doc = createMockPdfDoc([page1, page2])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPage(new Uint8Array([1, 2, 3]), 2)

            expect(result).not.toBeNull()
            expect(result!.page).toBe(2)
            expect(result!.chords).toHaveLength(2)
            expect(result!.chords.map(c => c.text)).toEqual(['Am', 'F'])
        })

        it('returns null for page number below 1', async () => {
            const page = createMockPage([textItem('C', 50, 700, 12)])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPage(new Uint8Array([1, 2, 3]), 0)

            expect(result).toBeNull()
        })

        it('returns null for page number beyond document', async () => {
            const page = createMockPage([textItem('C', 50, 700, 12)])
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPage(new Uint8Array([1, 2, 3]), 5)

            expect(result).toBeNull()
        })

        it('returns page dimensions', async () => {
            const page = createMockPage([], 800, 600)
            const doc = createMockPdfDoc([page])
            mockGetDocument.mockReturnValue({ promise: Promise.resolve(doc) })

            const result = await extractChordsFromPage(new Uint8Array([1, 2, 3]), 1)

            expect(result).not.toBeNull()
            expect(result!.pageWidth).toBe(800)
            expect(result!.pageHeight).toBe(600)
        })
    })
})
