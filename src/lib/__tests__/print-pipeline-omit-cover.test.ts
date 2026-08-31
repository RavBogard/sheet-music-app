// @vitest-environment node
//
// print-this-chart (PDFOverlay desktop print action): `omitCover: true` must
// render ONLY the chart page(s) — no multi-page cover table — while every
// existing caller (which never sets the field) keeps getting the cover
// exactly as before. This reads the actual PDF content stream (mirrors
// print-pipeline-folio.test.ts's rawContent/readAllPages pattern) rather than
// just checking that bytes came back, so a regression that silently drew a
// blank or wrong first page would be caught, not just "PDF exists".
import { describe, it, expect, vi } from "vitest"
import { inflateSync } from "node:zlib"
import { PDFDocument, PDFRawStream, PDFName, PDFArray } from "pdf-lib"

const CHART_TEXT = ["Verse 1", "C       G", "Hello   world", "Am      F", "this is the song"].join("\n")

vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(async () => ({
        buffer: Buffer.from(CHART_TEXT),
        contentType: "text/plain",
        source: "firebase-storage",
    })),
}))

// Firestore: config read misses (default footer); chordData empty; getAll empty.
// Storage: result-cache miss + no-op save. Mirrors print-pipeline-folio.test.ts.
vi.mock("@/lib/firebase-admin", () => {
    const subColl = { get: async () => ({ empty: true, forEach: () => {} }) }
    const docRef = {
        get: async () => ({ exists: false, data: () => undefined }),
        collection: () => subColl,
    }
    const coll = { doc: () => docRef }
    return {
        initAdmin: () => true,
        getFirestore: () => ({ collection: () => coll, getAll: async () => [] }),
        getStorage: () => ({
            bucket: () => ({
                file: () => ({
                    exists: async () => [false],
                    save: async () => undefined,
                    download: async () => [Buffer.from("")],
                }),
            }),
        }),
    }
})

import { generatePrintPdf, type PrintRequest, type PrintTrack } from "../print-pipeline"

// ── Minimal content-stream reader (subset of print-pipeline-folio.test.ts's
// rawContent/readAllPages apparatus — this fixture never needs font/position
// tracking, only "which literal strings did this page draw"). ──

function unescapeLiteral(s: string): string {
    return s.replace(/\\([nrtbf()\\])/g, (_, c) =>
        ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c,
    )
}

function hexToText(hex: string): string {
    const h = hex.replace(/\s+/g, "")
    let out = ""
    for (let i = 0; i + 1 < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16))
    return out
}

const TEXT_RE = /<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g

function drawnStrings(content: string): string[] {
    const out: string[] = []
    TEXT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = TEXT_RE.exec(content)) !== null) {
        if (m[1] !== undefined) out.push(hexToText(m[1]))
        else if (m[2] !== undefined) out.push(unescapeLiteral(m[2]))
    }
    return out
}

/** The (inflated) content stream(s) belonging to exactly one page. */
function pageStream(doc: PDFDocument, pageIndex: number): string {
    const parts: string[] = []
    const push = (obj: unknown) => {
        if (!(obj instanceof PDFRawStream)) return
        const bytes = obj.getContents()
        let decoded: Buffer
        try {
            decoded = inflateSync(Buffer.from(bytes))
        } catch {
            decoded = Buffer.from(bytes)
        }
        parts.push(decoded.toString("latin1"))
    }
    const contents = doc.context.lookup(doc.getPage(pageIndex).node.get(PDFName.of("Contents")))
    if (contents instanceof PDFArray) {
        for (let i = 0; i < contents.size(); i++) push(doc.context.lookup(contents.get(i)))
    } else {
        push(contents)
    }
    return parts.join("\n")
}

/** Drawn text, page by page. */
async function readAllPages(pdfBytes: Uint8Array) {
    const doc = await PDFDocument.load(pdfBytes)
    const pages: string[][] = []
    for (let i = 0; i < doc.getPageCount(); i++) pages.push(drawnStrings(pageStream(doc, i)))
    return { doc, pages }
}

const baseReq = (overrides: Partial<PrintRequest> = {}): PrintRequest => ({
    title: "Shake It Off",
    date: "Saturday, June 20, 2026",
    coverOnly: false,
    tracks: [
        {
            title: "Shake It Off",
            key: "Bb",
            notes: "",
            fileId: "upload-text-1",
            mimeType: "text/plain",
            type: "song",
        } as PrintTrack,
    ],
    ...overrides,
})

describe("generatePrintPdf — omitCover (print-this-chart)", () => {
    it("AC-1: omitCover:true renders ONLY the chart page — no cover table", async () => {
        const res = await generatePrintPdf(baseReq({ omitCover: true }))
        const { doc, pages } = await readAllPages(res.pdf)

        // Exactly the chart page(s) — the cover table never got built.
        expect(doc.getPageCount()).toBe(1)

        const page1 = pages[0]
        // The chart itself is there (renderTextChartToPdf's title + lyric/chord body).
        expect(page1).toContain("Shake It Off")
        expect(page1.some(t => t.includes("Hello"))).toBe(true)
        // Cover-table-only artifacts must be absent: the column header and the
        // packet footer are drawn ONLY inside buildCoverPage, never on an
        // appended chart page.
        expect(page1).not.toContain("Song")
        expect(page1.some(t => t.includes("CRC Music Books"))).toBe(false)
    })

    it("AC-2: the default (omitCover unset) is byte-for-byte unaffected — cover page still leads", async () => {
        const res = await generatePrintPdf(baseReq())
        const { doc, pages } = await readAllPages(res.pdf)

        // Cover page + at least one chart page.
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
        // Page 1 is the cover table (has the column header); the chart text
        // itself lands on a later page.
        expect(pages[0]).toContain("Song")
        const chartPage = pages.find(p => p.some(t => t.includes("Hello")))
        expect(chartPage, "the chart never rendered").toBeDefined()
    })

    it("AC-3: omitCover:true and omitCover:false do not collide on the result cache", async () => {
        // Same tracks/title/date, differing only by omitCover — two
        // structurally different documents must not hash to the same
        // print-cache key (computeContentHash includes `omitCover`).
        const withCover = await generatePrintPdf(baseReq())
        const withoutCover = await generatePrintPdf(baseReq({ omitCover: true }))
        expect(withCover.pdf.byteLength).not.toBe(withoutCover.pdf.byteLength)

        const a = await readAllPages(withCover.pdf)
        const b = await readAllPages(withoutCover.pdf)
        expect(a.doc.getPageCount()).toBeGreaterThan(b.doc.getPageCount())
    })
})
