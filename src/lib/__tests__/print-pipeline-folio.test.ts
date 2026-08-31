// @vitest-environment node
//
// Phase 4 regression: the musicians' gig packet silently dropped liturgyRef, so
// the cover page — the only place a service-flow row is ever drawn in the packet
// — printed no prayer-book page numbers while the rabbi's service sheet did.
//
// These assertions read the actual PDF CONTENT STREAM rather than checking that
// bytes came out. A PDF that draws text past the edge of the paper is still a
// structurally valid PDF: that is exactly how the service sheet's off-page
// honoree-name bug passed its entire suite. So we decode what was drawn, where,
// in which font, at what size, and assert geometry.
import { describe, it, expect, vi } from "vitest"
import { inflateSync } from "node:zlib"
import {
    PDFDocument,
    PDFRawStream,
    PDFName,
    PDFDict,
    StandardFonts,
    rgb,
    type PDFFont,
} from "pdf-lib"

// Firestore: config read misses (default footer); chordData empty; getAll empty.
// Storage: result-cache miss + no-op save. Cover-only never touches the fetcher.
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

// ── Content-stream reader ────────────────────────────────────────────────────

interface DrawnText {
    text: string
    x: number
    y: number
    size: number
    baseFont: string
}

/** Inflate every FlateDecode stream in the doc and concatenate the text ops. */
function rawContent(doc: PDFDocument): string {
    const chunks: string[] = []
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFRawStream)) continue
        const bytes = obj.getContents()
        let decoded: Buffer
        try {
            decoded = inflateSync(Buffer.from(bytes))
        } catch {
            decoded = Buffer.from(bytes)
        }
        const s = decoded.toString("latin1")
        if (s.includes("Tj") || s.includes("TJ")) chunks.push(s)
    }
    return chunks.join("\n")
}

/** Map the page's font resource names (/F1…) to their BaseFont (Helvetica-Bold…). */
function fontResourceMap(doc: PDFDocument, pageIndex: number): Map<string, string> {
    const map = new Map<string, string>()
    const res = doc.getPage(pageIndex).node.Resources()
    const fonts = res?.lookupMaybe(PDFName.of("Font"), PDFDict)
    if (!fonts) return map
    for (const [key, value] of fonts.entries()) {
        const fd = doc.context.lookup(value, PDFDict)
        const base = fd?.get(PDFName.of("BaseFont"))
        if (base instanceof PDFName) {
            map.set(key.asString().replace(/^\//, ""), base.asString().replace(/^\//, ""))
        }
    }
    return map
}

const OP_RE = new RegExp(
    [
        String.raw`\/([^\s/<>\[\]]+)\s+([\d.]+)\s+Tf`, // 1,2  font + size
        String.raw`([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm`, // 3-8 matrix
        String.raw`<([0-9A-Fa-f\s]*)>\s*Tj`, // 9   hex-encoded show
        String.raw`\(((?:\\.|[^\\)])*)\)\s*Tj`, // 10  literal show
    ].join("|"),
    "g",
)

/**
 * Bytes 0x80–0x9F are NOT Latin-1 in a WinAnsi-encoded PDF string — CP1252 puts
 * printable glyphs there (bullet, smart quotes, en/em dash). Decoding them as
 * Latin-1 yields C1 control codepoints that pdf-lib then refuses to re-measure,
 * which is a bug in the reader, not in the document.
 */
// Codepoints for bytes 0x80..0x9F, in order. 0 marks a slot CP1252 leaves
// undefined. Written numerically so an invisible glyph cannot shift the indices.
const CP1252_HIGH = [
    0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
    0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
    0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
]

function byteToChar(b: number): string {
    if (b >= 0x80 && b <= 0x9f) {
        const cp = CP1252_HIGH[b - 0x80]
        return cp ? String.fromCharCode(cp) : "?"
    }
    return String.fromCharCode(b)
}

function hexToText(hex: string): string {
    const h = hex.replace(/\s+/g, "")
    let out = ""
    for (let i = 0; i + 1 < h.length; i += 2) out += byteToChar(parseInt(h.slice(i, i + 2), 16))
    return out
}

function unescapeLiteral(s: string): string {
    return s.replace(/\\([nrtbf()\\])/g, (_, c) =>
        ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c,
    )
}

/** Every `Tj` on the page, with the position and font state in force when drawn. */
function drawnText(content: string, fonts: Map<string, string>): DrawnText[] {
    const out: DrawnText[] = []
    let size = 0
    let baseFont = ""
    let x = 0
    let y = 0
    OP_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = OP_RE.exec(content)) !== null) {
        if (m[1] !== undefined) {
            baseFont = fonts.get(m[1]) ?? m[1]
            size = parseFloat(m[2])
        } else if (m[3] !== undefined) {
            x = parseFloat(m[7])
            y = parseFloat(m[8])
        } else if (m[9] !== undefined) {
            out.push({ text: hexToText(m[9]), x, y, size, baseFont })
        } else if (m[10] !== undefined) {
            out.push({ text: unescapeLiteral(m[10]), x, y, size, baseFont })
        }
    }
    return out
}

/** Real pdf-lib metrics for the three faces the cover page uses. */
async function metrics(): Promise<Map<string, PDFFont>> {
    const scratch = await PDFDocument.create()
    const m = new Map<string, PDFFont>()
    m.set("Helvetica", await scratch.embedFont(StandardFonts.Helvetica))
    m.set("Helvetica-Bold", await scratch.embedFont(StandardFonts.HelveticaBold))
    m.set("Helvetica-Oblique", await scratch.embedFont(StandardFonts.HelveticaOblique))
    return m
}

const PAGE_W = 612
const MARGIN = 50
const CONTENT_RIGHT = PAGE_W - MARGIN // 562
const FOLIO_GUTTER = 8

/**
 * The invariant this whole test file exists to defend: nothing drawn on the
 * cover page may run past the right margin of the paper, and nothing outside
 * the folio column may reach into it.
 *
 * Returns a human-readable violation per offending run of text. Proven to
 * actually fire by the negative-control test at the bottom of this file — a
 * checker that silently returns [] is worse than no checker at all, which is
 * the lesson from the off-page honoree bug.
 */
function overlapViolations(items: DrawnText[], fonts: Map<string, PDFFont>, folioLeft: number): string[] {
    const bad: string[] = []
    for (const it of items) {
        const font = fonts.get(it.baseFont)
        if (!font || !it.text) continue
        const right = it.x + font.widthOfTextAtSize(it.text, it.size)
        if (right > CONTENT_RIGHT + 0.01) {
            bad.push(`"${it.text}" runs to x=${right.toFixed(1)}, past the right margin ${CONTENT_RIGHT}`)
            continue
        }
        const isFolioCell = it.x >= folioLeft - 0.01
        if (!isFolioCell && right > folioLeft + 0.01) {
            bad.push(`"${it.text}" runs to x=${right.toFixed(1)}, into the folio column at ${folioLeft.toFixed(1)}`)
        }
    }
    return bad
}

async function readCover(pdfBytes: Uint8Array) {
    const doc = await PDFDocument.load(pdfBytes)
    const items = drawnText(rawContent(doc), fontResourceMap(doc, 0))
    return { doc, items }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LONG_TITLE =
    "Hashkivenu Adonai Eloheinu L'shalom V'ha'amideinu Malkeinu L'chayim Tovim U'l'shalom"
const LONG_NOTES = "watch the ritardando into the final refrain, then hold"

const req = (tracks: PrintTrack[]): PrintRequest => ({
    title: "Shabbat Morning",
    date: "Saturday, September 6, 2026",
    coverOnly: true,
    tracks,
})

describe("gig packet cover page — liturgyRef folio column", () => {
    it("AC-1: a flow row with a folio renders `p. 12`", async () => {
        const { items } = await readCover(
            (
                await generatePrintPdf(
                    req([
                        {
                            title: "Bar'chu",
                            key: "",
                            notes: "",
                            type: "prayer",
                            liturgyRef: { book: "mishkan-tfilah", folio: 12 },
                        },
                    ]),
                )
            ).pdf,
        )
        const texts = items.map(i => i.text)
        expect(texts).toContain("p. 12")
        // …and it is right-aligned into the reserved column, not left-aligned
        // somewhere in the middle of the table.
        const folio = items.find(i => i.text === "p. 12")!
        const fonts = await metrics()
        const right = folio.x + fonts.get("Helvetica-Bold")!.widthOfTextAtSize("p. 12", folio.size)
        expect(right).toBeCloseTo(CONTENT_RIGHT, 1)
        // The column gets a header only when at least one row has a folio.
        expect(texts).toContain("Page")
    })

    it("AC-2: a row without a liturgyRef renders no page number, and does not block generation", async () => {
        const res = await generatePrintPdf(
            req([
                { title: "Mi Chamocha", key: "G", notes: "", type: "song" },
                { title: "Silent Prayer", key: "", notes: "", type: "prayer" },
            ]),
        )
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts.filter(t => t.startsWith("p. "))).toEqual([])
        // No folios anywhere → no column header either.
        expect(texts).not.toContain("Page")
        // Both rows still printed.
        expect(texts).toContain("Mi Chamocha")
        expect(texts).toContain("Silent Prayer")
    })

    it("AC-3: only the rows that have a folio get one, mixed in one setlist", async () => {
        const { items } = await readCover(
            (
                await generatePrintPdf(
                    req([
                        { title: "Opening", key: "", notes: "", type: "header" },
                        {
                            title: "Bar'chu",
                            key: "",
                            notes: "",
                            type: "prayer",
                            liturgyRef: { book: "mishkan-tfilah", folio: 12 },
                        },
                        { title: "Mi Chamocha", key: "G", notes: "", type: "song" },
                        {
                            title: "Aleinu",
                            key: "",
                            notes: "",
                            type: "prayer",
                            liturgyRef: { book: "mishkan-tfilah", folio: 586 },
                        },
                    ]),
                )
            ).pdf,
        )
        expect(items.map(i => i.text).filter(t => t.startsWith("p. ")).sort()).toEqual([
            "p. 12",
            "p. 586",
        ])
    })

    it("AC-4: a long title and long notes never overlap the folio column or run off the paper", async () => {
        const tracks: PrintTrack[] = [
            {
                title: LONG_TITLE,
                key: "",
                notes: "",
                type: "prayer",
                performer: "Rabbi Daniel Bogard",
                liturgyRef: { book: "mishkan-tfilah", folio: 128 },
            },
            {
                title: LONG_TITLE,
                key: "Ab",
                notes: LONG_NOTES,
                type: "song",
                leadMusician: "David Lazaroff",
                capoFret: 3,
                liturgyRef: { book: "mishkan-tfilah", folio: 9 },
            },
            {
                // Header rows have their own (wider) title budget.
                title: LONG_TITLE.toUpperCase(),
                key: "",
                notes: "",
                type: "header",
                liturgyRef: { book: "mishkan-tfilah", folio: 400 },
            },
        ]
        const { items } = await readCover((await generatePrintPdf(req(tracks))).pdf)
        const fonts = await metrics()

        const folioW = Math.max(
            fonts.get("Helvetica-Bold")!.widthOfTextAtSize("Page", 10),
            ...["p. 128", "p. 9", "p. 400"].map(s =>
                fonts.get("Helvetica-Bold")!.widthOfTextAtSize(s, 9),
            ),
        )
        const folioLeft = CONTENT_RIGHT - folioW - FOLIO_GUTTER

        expect(overlapViolations(items, fonts, folioLeft)).toEqual([])
        // Every folio still made it onto the page despite the crowded rows.
        expect(items.map(i => i.text).filter(t => t.startsWith("p. ")).sort()).toEqual([
            "p. 128",
            "p. 400",
            "p. 9",
        ])
    })

    it("AC-5: Hebrew and smart punctuation degrade to WinAnsi instead of throwing", async () => {
        // pdf-lib StandardFonts are WinAnsi-only and THROW on an unencodable
        // codepoint — from drawText and from widthOfTextAtSize alike. Before the
        // sanitisation pass a single Hebrew character in a title took down gig
        // packet generation for the entire setlist.
        const res = await generatePrintPdf(
            req([
                {
                    title: "בָּרְכוּ — Bar'chu",
                    key: "",
                    notes: "שְׁמַע",
                    type: "prayer",
                    performer: "רַב דָּנִיֵּאל",
                    liturgyRef: { book: "mishkan-tfilah", folio: 12 },
                },
            ]),
        )
        expect(res.pdf.byteLength).toBeGreaterThan(0)
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts).toContain("p. 12")
        // No raw multi-byte codepoint survived into the stream.
        for (const t of texts) expect(/[^\x00-\xff]/.test(t)).toBe(false)
    })

    it("NEGATIVE CONTROL: the overlap checker actually fires on an overlapping row", async () => {
        // Evidence that AC-4 is not vacuously green. Hand-build the exact defect
        // AC-4 forbids — an unmeasured notes cell drawn over the folio column and
        // off the right edge — and prove the same extractor + checker reports it.
        const doc = await PDFDocument.create()
        const bold = await doc.embedFont(StandardFonts.HelveticaBold)
        const oblique = await doc.embedFont(StandardFonts.HelveticaOblique)
        const page = doc.addPage([PAGE_W, 792])
        const folioText = "p. 128"
        const folioW = bold.widthOfTextAtSize(folioText, 9)
        const folioLeft = CONTENT_RIGHT - folioW - FOLIO_GUTTER
        page.drawText(folioText, {
            x: CONTENT_RIGHT - folioW, y: 700, size: 9, font: bold, color: rgb(0, 0, 0),
        })
        // 18 characters at 9pt starting at colNotes=475 — the pre-fix
        // character-count cap, which never measured anything.
        page.drawText("watch the ritard...", {
            x: 475, y: 700, size: 9, font: oblique, color: rgb(0, 0, 0),
        })

        const { items } = await readCover(await doc.save())
        const violations = overlapViolations(items, await metrics(), folioLeft)

        expect(violations.length).toBeGreaterThan(0)
        expect(violations.join(" ")).toMatch(/watch the ritard/)
    })
})
