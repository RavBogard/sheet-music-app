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
    PDFArray,
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

// ── Per-page reader (pagination) ─────────────────────────────────────────────
//
// `rawContent` deliberately flattens the whole document, which cannot answer
// "which page did row 27 land on?" — and pdf-lib allocates font resource names
// (/F1…) PER PAGE, so page 2's /F1 is not necessarily page 1's font. Both
// facts matter once the cover table spans more than one page.

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

/** Drawn text page by page, plus the whole document flattened in page order. */
async function readAllPages(pdfBytes: Uint8Array) {
    const doc = await PDFDocument.load(pdfBytes)
    const pages: DrawnText[][] = []
    for (let i = 0; i < doc.getPageCount(); i++) {
        pages.push(drawnText(pageStream(doc, i), fontResourceMap(doc, i)))
    }
    return { doc, pages, all: pages.flat() }
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

    // ── Sanitisation regressions (fix round 1) ───────────────────────────────
    //
    // Every one of these throws out of `generatePrintPdf` before the clean()
    // hardening: pdf-lib's drawText TOLERATES control characters (it splits on
    // \n) but widthOfTextAtSize THROWS on them, so any measured cell rejects the
    // whole packet. The width-cap added for the folio column is what made the
    // notes cell measured for the first time.

    /** No codepoint outside WinAnsi survived into the content stream. */
    const expectWinAnsiSafe = (texts: string[]) => {
        for (const t of texts) {
            expect([...t].some(c => (c.codePointAt(0) ?? 0) > 0xff), JSON.stringify(t) + " carries a non-WinAnsi codepoint").toBe(false)
            expect([...t].some(c => { const v = c.codePointAt(0) ?? 0; return v < 0x20 || (v >= 0x7f && v <= 0x9f) }), JSON.stringify(t) + " carries a control character").toBe(false)
        }
    }

    it("REGRESSION 1: a multi-line note does not reject the packet", async () => {
        // src/components/setlist/grid/MobileRowCard.tsx binds `notes` to a free
        // two-row <textarea> ("Add lyrics, chords, or performance notes…"), so a
        // newline here is ordinary use, not a synthetic input. Measured for the
        // first time by the folio width-cap → `WinAnsi cannot encode "\n"`.
        const res = await generatePrintPdf(
            req([{ title: "Adon Olam", key: "D", notes: "hold\ncut", type: "song" }]),
        )
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        // The newline collapses to a single space rather than a ragged gap.
        expect(texts).toContain("hold cut")
        expect(texts).toContain("Adon Olam")
        expectWinAnsiSafe(texts)
    })

    it("REGRESSION 2: a non-Latin key with a transposition does not throw", async () => {
        // getTransposedKeyName returns its input UNCHANGED when the key doesn't
        // match ^[A-G], so a raw key reached drawText even though the adjacent
        // key cell was cleaned.
        const res = await generatePrintPdf(
            req([{ title: "Hashkivenu", key: "ש", notes: "", type: "song", transposition: 2 }]),
        )
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts).toContain("Hashkivenu")
        // hasTranspositions → the "As" (transposed key) column is present.
        expect(texts).toContain("As")
        expectWinAnsiSafe(texts)
    })

    it("REGRESSION 3: a header title that case-folds outside WinAnsi does not throw", async () => {
        // clean() ran BEFORE toUpperCase, and "µ" (U+00B5, inside WinAnsi)
        // upper-cases to U+039C GREEK CAPITAL MU, which is not.
        const res = await generatePrintPdf(
            req([{ title: "Kol µ Nidre", key: "", notes: "", type: "header" }]),
        )
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts.some(t => t.startsWith("KOL "))).toBe(true)
        expectWinAnsiSafe(texts)
    })

    it("REGRESSION 4: a multi-line TITLE does not throw (pre-existing, closed by the same fix)", async () => {
        // This one predates the folio work — the title-fit measurement loop has
        // always measured the title. Titles already route through clean(), so
        // hardening clean() closes it too.
        const res = await generatePrintPdf(
            req([
                { title: "Adon\nOlam", key: "C", notes: "", type: "song" },
                { title: "Yih'yu\tL'ratzon", key: "", notes: "", type: "header" },
            ]),
        )
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts).toContain("Adon Olam")
        expect(texts).toContain("YIH'YU L'RATZON")
        expectWinAnsiSafe(texts)
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

// ── Pagination (Finding 1) ───────────────────────────────────────────────────
//
// The cover table used to be ONE page that dropped every row past
// `yOffset < 60` with no marker. Measured at HEAD: a 34-track setlist drew 26
// rows and 26 folios; rows 27-34 vanished. Production templates are 30, 28 and
// 21 tracks, so two of three truncated — and because this branch made the cover
// the packet's only carrier of page numbers, a Shabbat-morning packet printed
// folios through the middle of the service and stopped before Aleinu and
// Mourner's Kaddish.

/** Lowest baseline a row may occupy (print-pipeline COVER_ROW_BOTTOM). */
const ROW_BOTTOM = 60
/** The packet footer's baseline — the only ink allowed below ROW_BOTTOM. */
const FOOTER_Y = 30

/** A 34-row service: headers, songs and prayers, every row carrying a folio. */
const SERVICE_34: PrintTrack[] = Array.from({ length: 34 }, (_, i) => ({
    title: `Service Item ${String(i + 1).padStart(2, "0")}`,
    key: i % 3 === 0 ? "G" : "",
    notes: "",
    type: i % 7 === 0 ? "header" : i % 3 === 0 ? "song" : "prayer",
    liturgyRef: { book: "crc-saturday", folio: 100 + i },
}))

/** Header rows draw their title upper-cased; everything else draws verbatim. */
const EXPECTED_TITLES = SERVICE_34.map(t =>
    t.type === "header" ? t.title.toUpperCase() : t.title,
)
const EXPECTED_FOLIOS = SERVICE_34.map(t => `p. ${t.liturgyRef!.folio}`)

/** The measured worst case: a "Prepared for" packet, which fits fewest rows. */
const personalReq = (tracks: PrintTrack[]): PrintRequest => ({
    ...req(tracks),
    musicianName: "David Lazaroff - Guitar",
    rabbi: "Rabbi Daniel Bogard",
})

describe("gig packet cover page — pagination", () => {
    it("AC-P1: a 34-track service draws ALL 34 rows and ALL 34 folios", async () => {
        const { doc, all } = await readAllPages(
            (await generatePrintPdf(personalReq(SERVICE_34))).pdf,
        )

        // It genuinely spilled — otherwise this test would pass vacuously on a
        // build that simply raised the cap.
        expect(doc.getPageCount()).toBeGreaterThan(1)

        const texts = all.map(i => i.text)
        const missingTitles = EXPECTED_TITLES.filter(t => !texts.includes(t))
        expect(missingTitles, "rows dropped off the end of the cover table").toEqual([])

        // Folios in DOCUMENT ORDER (pages in order, draw order within a page):
        // not just "all present" but "all present, in the order of service".
        expect(texts.filter(t => t.startsWith("p. "))).toEqual(EXPECTED_FOLIOS)
    })

    it("AC-P2: no row is split across the page boundary — a title and its folio always share a page", async () => {
        const { pages } = await readAllPages(
            (await generatePrintPdf(personalReq(SERVICE_34))).pdf,
        )
        const pageOf = (needle: string) =>
            pages.findIndex(items => items.some(i => i.text === needle))

        for (let i = 0; i < SERVICE_34.length; i++) {
            const titlePage = pageOf(EXPECTED_TITLES[i])
            const folioPage = pageOf(EXPECTED_FOLIOS[i])
            expect(titlePage, `${EXPECTED_TITLES[i]} was not drawn at all`).toBeGreaterThanOrEqual(0)
            expect(
                folioPage,
                `${EXPECTED_TITLES[i]} is on page ${titlePage} but its ${EXPECTED_FOLIOS[i]} is on page ${folioPage}`,
            ).toBe(titlePage)
        }
    })

    it("AC-P3: every table page repeats the column headers; only page 1 carries the header block", async () => {
        const { doc, pages } = await readAllPages(
            (await generatePrintPdf(personalReq(SERVICE_34))).pdf,
        )
        expect(doc.getPageCount()).toBeGreaterThan(1)

        for (let p = 0; p < pages.length; p++) {
            const texts = pages[p].map(i => i.text)
            expect(texts, `page ${p + 1} lost the column headers`).toContain("Song")
            expect(texts, `page ${p + 1} lost the folio column header`).toContain("Page")
            // The footer is repeated too — a continuation sheet with no footer
            // reads as a stray page once the band shuffles the packet.
            expect(texts.some(t => t.includes("song")), `page ${p + 1} lost the footer`).toBe(true)
        }

        // Title / date / "Prepared for" / "Led by" stay on page 1.
        for (const once of ["Shabbat Morning", "Prepared for: David Lazaroff - Guitar", "Led by: Rabbi Daniel Bogard"]) {
            expect(pages[0].map(i => i.text)).toContain(once)
            for (let p = 1; p < pages.length; p++) {
                expect(pages[p].map(i => i.text), `page ${p + 1} repeated the header block`).not.toContain(once)
            }
        }
    })

    it("AC-P4: nothing but the footer is drawn below the bottom margin, and nothing overruns the folio column", async () => {
        const { pages } = await readAllPages(
            (await generatePrintPdf(personalReq(SERVICE_34))).pdf,
        )
        const fonts = await metrics()
        const bold = fonts.get("Helvetica-Bold")!
        const folioW = Math.max(
            bold.widthOfTextAtSize("Page", 10),
            ...EXPECTED_FOLIOS.map(s => bold.widthOfTextAtSize(s, 9)),
        )
        const folioLeft = CONTENT_RIGHT - folioW - FOLIO_GUTTER

        for (let p = 0; p < pages.length; p++) {
            const belowMargin = pages[p]
                .filter(i => i.y < ROW_BOTTOM && i.y !== FOOTER_Y && i.text.trim())
                .map(i => `"${i.text}" at y=${i.y}`)
            expect(belowMargin, `page ${p + 1} drew a row under the bottom margin`).toEqual([])
            expect(overlapViolations(pages[p], fonts, folioLeft), `page ${p + 1}`).toEqual([])
        }
    })

    it("AC-P5: a short setlist still fits on a single cover page (no gratuitous break)", async () => {
        const { doc } = await readAllPages(
            (await generatePrintPdf(personalReq(SERVICE_34.slice(0, 12)))).pdf,
        )
        expect(doc.getPageCount()).toBe(1)
    })
})

// ── Prayer-book attribution (Finding 2) ──────────────────────────────────────
//
// The packet printed `p. 12` and named no book anywhere, while both sibling
// renderers name it — the iPad (SetlistPerformClient) and the rabbi's sheet
// (pdf/service-sheet-pdf). A musician holding a Friday packet and a Saturday
// packet gets two unqualified numbers for prayers the two books share at
// different pages.

describe("gig packet cover page — prayer book attribution", () => {
    const oneRow: PrintTrack[] = [
        {
            title: "Bar'chu",
            key: "",
            notes: "",
            type: "prayer",
            liturgyRef: { book: "shabbat-maariv", folio: 12 },
        },
    ]

    // The real registry title for `shabbat-maariv`, em dash and all — every
    // drawn string goes through clean(), whose toWinAnsi step folds U+2014 to
    // an ASCII hyphen rather than letting pdf-lib throw on it.
    const BOOK = "Shirei Shabbat — Friday Night"
    const BOOK_DRAWN = "Shirei Shabbat - Friday Night"

    it("AC-B1: draws the book title under the date, above the table", async () => {
        const { items } = await readCover(
            (await generatePrintPdf({ ...req(oneRow), bookTitle: BOOK })).pdf,
        )
        const byText = (t: string) => items.find(i => i.text === t)

        const book = byText(BOOK_DRAWN)
        expect(book, "the cover names no book").toBeDefined()

        const date = byText("Saturday, September 6, 2026")!
        const columnHeader = byText("Song")!
        // Under the date…
        expect(book!.y).toBeLessThan(date.y)
        // …and above the table's column-header band.
        expect(book!.y).toBeGreaterThan(columnHeader.y)
        // Same left margin as every other header-block line.
        expect(book!.x).toBe(50)
        // The folio it qualifies still prints.
        expect(items.map(i => i.text)).toContain("p. 12")
    })

    it("AC-B2: a setlist with no book draws nothing — no placeholder, no blank line", async () => {
        const withBook = await readCover(
            (await generatePrintPdf({ ...req(oneRow), bookTitle: BOOK })).pdf,
        )
        const without = await readCover((await generatePrintPdf(req(oneRow))).pdf)

        const a = withBook.items.map(i => i.text)
        const b = without.items.map(i => i.text)
        // Exactly one drawn string differs: the book title itself.
        expect(a.filter(t => !b.includes(t))).toEqual([BOOK_DRAWN])
        // …and the no-book cover draws NOTHING the with-book one doesn't: no
        // placeholder, no em dash, no empty label. (The exact-diff pair above
        // is the whole assertion — a `some(/book|siddur/)` sweep would only
        // catch the packet footer, "Generated by CRC Music Books".)
        expect(b.filter(t => !a.includes(t))).toEqual([])
        // The rows below the header block are untouched by the book's absence.
        expect(b).toContain("p. 12")
        expect(b).toContain("Bar'chu")
    })

    it("AC-B3: an unencodable book title degrades instead of rejecting the packet", async () => {
        // pdf-lib StandardFonts throw from widthOfTextAtSize as well as
        // drawText, so an unsanitised Hebrew book name would take down the
        // whole packet rather than one line of it.
        const res = await generatePrintPdf({
            ...req(oneRow),
            bookTitle: "שירי שבת",
        })
        const { items } = await readCover(res.pdf)
        const texts = items.map(i => i.text)
        expect(texts).toContain("p. 12")
        for (const t of texts) expect(/[^\x00-\xff]/.test(t)).toBe(false)
    })

    it("AC-B4: two setlists identical but for their book render different covers", async () => {
        // Guards the drawn output, not the cache; the result-cache key carries
        // `bookTitle` too (computeContentHash), which is why cacheVersion moved
        // 5→6 in the same change.
        const friday = await generatePrintPdf({ ...req(oneRow), bookTitle: BOOK })
        const saturday = await generatePrintPdf({
            ...req(oneRow),
            bookTitle: "CRC Saturday Siddur",
        })
        const a = (await readCover(friday.pdf)).items.map(i => i.text)
        const b = (await readCover(saturday.pdf)).items.map(i => i.text)
        expect(a).toContain(BOOK_DRAWN)
        expect(a).not.toContain("CRC Saturday Siddur")
        expect(b).toContain("CRC Saturday Siddur")
        expect(b).not.toContain(BOOK_DRAWN)
    })
})
