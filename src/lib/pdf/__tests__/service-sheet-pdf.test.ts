// @vitest-environment node
import { describe, it, expect } from "vitest"
import { inflateSync } from "node:zlib"
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib"
import { renderServiceSheetPdf } from "../service-sheet-pdf"

const BASE = {
    setlistName: "Erev Shabbat",
    eventDate: "2026-09-04",
    rabbi: "Rabbi Daniel",
    book: "crc-friday",
    bookTitle: "CRC Friday Siddur",
}

function track(over: Record<string, unknown> = {}) {
    return { id: "t1", title: "Mi Chamocha", type: "prayer", ...over }
}

// --- Overflow harness -------------------------------------------------------
// Page-count assertions cannot see a name printed off the edge of the paper: the
// PDF stays structurally valid and the page count never moves. So we decode the
// content streams and check where every glyph run actually lands.

const PAGE_W = 612
const MARGIN = 54

interface Run {
    page: number
    x: number
    y: number
    size: number
    bold: boolean
    text: string
}

let fontCache: { bold: PDFFont; body: PDFFont } | null = null
async function fonts() {
    if (!fontCache) {
        const doc = await PDFDocument.create()
        fontCache = {
            bold: await doc.embedFont(StandardFonts.HelveticaBold),
            body: await doc.embedFont(StandardFonts.Helvetica),
        }
    }
    return fontCache
}

/** Decode every `<hex> Tj` run with its `Tm` origin and `Tf` font/size. */
function extractRuns(bytes: Uint8Array): Run[] {
    const buf = Buffer.from(bytes)
    const runs: Run[] = []
    let pageIdx = -1
    let i = 0
    while (i < buf.length) {
        const s = buf.indexOf("stream", i)
        if (s === -1) break
        if (s >= 3 && buf.subarray(s - 3, s).toString("latin1") === "end") {
            i = s + 6
            continue
        }
        let d = s + 6
        if (buf[d] === 0x0d) d++
        if (buf[d] === 0x0a) d++
        const e = buf.indexOf("endstream", d)
        if (e === -1) break
        const raw = buf.subarray(d, e)
        let txt: string
        try {
            txt = inflateSync(raw).toString("latin1")
        } catch {
            txt = raw.toString("latin1")
        }
        if (txt.includes("Tj")) {
            pageIdx++
            let size = 0
            let bold = false
            let x = 0
            let y = 0
            const op =
                /\/(\S+?)\s+([\d.]+)\s+Tf|([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+Tm|<([0-9A-Fa-f]*)>\s*Tj/g
            let m: RegExpExecArray | null
            while ((m = op.exec(txt)) !== null) {
                if (m[1] !== undefined) {
                    bold = m[1].includes("Helvetica-Bold")
                    size = Number(m[2])
                } else if (m[7] !== undefined) {
                    x = Number(m[7])
                    y = Number(m[8])
                } else if (m[9] !== undefined) {
                    const hex = m[9]
                    let text = ""
                    for (let k = 0; k + 1 < hex.length; k += 2) {
                        text += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
                    }
                    runs.push({ page: pageIdx, x, y, size, bold, text })
                }
            }
        }
        i = e + 9
    }
    return runs
}

async function runWidth(r: Run): Promise<number> {
    const f = await fonts()
    return (r.bold ? f.bold : f.body).widthOfTextAtSize(r.text, r.size)
}

/**
 * Every drawn run must sit inside the printable column and on the physical page.
 * Returns offenders so a failure message names the text that escaped.
 */
async function overflows(bytes: Uint8Array) {
    const bad: string[] = []
    for (const r of extractRuns(bytes)) {
        const w = await runWidth(r)
        if (r.x + w > PAGE_W - MARGIN + 1) {
            bad.push(`right-overflow p${r.page} x=${r.x.toFixed(1)} w=${w.toFixed(1)} "${r.text}"`)
        }
        if (r.x < MARGIN - 1) {
            bad.push(`left-overflow p${r.page} x=${r.x.toFixed(1)} "${r.text}"`)
        }
        if (r.y < 20) {
            bad.push(`off-page p${r.page} y=${r.y.toFixed(1)} "${r.text}"`)
        }
    }
    return bad
}

describe("renderServiceSheetPdf", () => {
    it("produces a valid single-page PDF for a short service", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track(), track({ id: "t2", title: "Shalom Rav" })],
        })
        const pdf = await PDFDocument.load(bytes)
        expect(pdf.getPageCount()).toBe(1)
    })

    it("keeps a realistic 30-row service to two pages or fewer", async () => {
        const tracks = Array.from({ length: 30 }, (_, i) =>
            track({
                id: `t${i}`,
                title: `Moment ${i}`,
                performer: i % 3 === 0 ? "Congregation" : "Band",
                liturgyRef: { book: "crc-friday", folio: i + 1 },
            }),
        )
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks }))
        expect(pdf.getPageCount()).toBeLessThanOrEqual(2)
    })

    it("paginates rather than truncating a very long service", async () => {
        const tracks = Array.from({ length: 200 }, (_, i) => track({ id: `t${i}`, title: `Moment ${i}` }))
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks }))
        expect(pdf.getPageCount()).toBeGreaterThan(2)
    })

    it("renders a row that has no liturgyRef without failing", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ liturgyRef: undefined }), track({ id: "t2", liturgyRef: { book: "crc-friday", folio: 23 } })],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("renders honors without throwing and grows the header block", async () => {
        const withHonors = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ honors: [{ name: "Rachel Cohen", note: "birthday — candle lighting" }] })],
        })
        expect((await PDFDocument.load(withHonors)).getPageCount()).toBe(1)
    })

    it("does not throw on Hebrew input (degrades via toWinAnsi)", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ title: "מי כמוך" })],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("renders header rows as dividers without a page number", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ id: "h1", title: "Kabbalat Shabbat", type: "header" }), track()],
        })
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    })

    it("handles an empty setlist", async () => {
        const pdf = await PDFDocument.load(await renderServiceSheetPdf({ ...BASE, tracks: [] }))
        expect(pdf.getPageCount()).toBe(1)
    })
})

describe("renderServiceSheetPdf — nothing runs off the paper", () => {
    // Finding L: a Torah service bundling several aliyot onto one row is ordinary
    // here. Unwrapped, the cue line printed honorees' names off the edge and the
    // page count never moved, so no test noticed.
    it("wraps a cue line carrying six honors inside the content column", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [
                track({
                    title: "Torah Service — Aliyot",
                    performer: "Congregation",
                    leadMusician: "Randy",
                    honors: [
                        { name: "Rachel Cohen", note: "first aliyah" },
                        { name: "Michael Rosenbaum", note: "second aliyah" },
                        { name: "Sarah Goldstein-Meyer", note: "third aliyah" },
                        { name: "David Lazaroff", note: "fourth aliyah" },
                        { name: "Miriam Abramowitz", note: "hagbah" },
                        { name: "Jonathan Feldman", note: "gelilah" },
                    ],
                }),
            ],
        })
        expect(await overflows(bytes)).toEqual([])
    })

    it("keeps every honoree's name present when the cue line wraps", async () => {
        const names = ["Rachel Cohen", "Michael Rosenbaum", "Sarah Goldstein-Meyer", "David Lazaroff", "Miriam Abramowitz", "Jonathan Feldman"]
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ honors: names.map((name) => ({ name, note: "aliyah" })) })],
        })
        const drawn = extractRuns(bytes).map((r) => r.text).join(" ")
        for (const name of names) {
            // wrapping may split on spaces, so check each word survives
            for (const word of name.split(" ")) expect(drawn).toContain(word)
        }
    })

    // Finding M: a single token wider than the column was assigned and drawn
    // unclipped rather than broken.
    it("hard-breaks a 150-character unbroken token instead of running off the page", async () => {
        const token = "A".repeat(150)
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [track({ description: `Note: ${token} end.` })],
        })
        expect(await overflows(bytes)).toEqual([])
    })

    // Finding N: the honors box drew its lines in a loop that never re-checked
    // remaining space, so past ~61 entries they landed below the physical page.
    it("paginates a 70-entry honors box instead of drawing below the page", async () => {
        const honors = Array.from({ length: 70 }, (_, i) => ({
            name: `Honoree Number ${i}`,
            note: "yahrzeit remembrance",
        }))
        const bytes = await renderServiceSheetPdf({ ...BASE, tracks: [track({ honors })] })
        expect(await overflows(bytes)).toEqual([])
        expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1)
    })

    // Finding O: nothing guaranteed the title cleared the right-aligned folio.
    it("keeps a long row title clear of a 3-digit folio", async () => {
        const bytes = await renderServiceSheetPdf({
            ...BASE,
            tracks: [
                track({
                    title: "Prayer for the Healing of Body and Spirit — Mi Shebeirach for All Who Are Ill Among Our Congregation and Their Families",
                    liturgyRef: { book: "crc-friday", folio: 118 },
                }),
            ],
        })
        expect(await overflows(bytes)).toEqual([])

        const runs = extractRuns(bytes)
        const folio = runs.find((r) => r.text === "118" && r.size === 14)
        expect(folio).toBeDefined()
        const titleRuns = runs.filter((r) => r.size === 11)
        expect(titleRuns.length).toBeGreaterThan(0)
        for (const t of titleRuns) {
            const right = t.x + (await runWidth(t))
            expect(right).toBeLessThanOrEqual(folio!.x)
        }
    })

    it("keeps a long service name and long section label inside the page", async () => {
        const bytes = await renderServiceSheetPdf({
            setlistName: "Shabbat Morning Service and B'nai Mitzvah of Sarah and Jonathan Goldstein-Meyer",
            eventDate: "2026-09-05",
            rabbi: "Rabbi Daniel Bogard and Rabbi Randy Fleisher",
            bookTitle: "Mishkan T'filah for Shabbat Morning, CRC Transliteration Edition",
            tracks: [
                track({ id: "h1", type: "header", title: "Torah Service and Reading of the Weekly Portion Ki Teitzei" }),
                track({ liturgyRef: { book: "crc-friday", folio: 240 } }),
            ],
        })
        expect(await overflows(bytes)).toEqual([])
    })

    it("keeps the realistic 30-row service clean of overflow", async () => {
        const tracks = Array.from({ length: 30 }, (_, i) =>
            track({
                id: `t${i}`,
                title: `Moment ${i}`,
                performer: i % 3 === 0 ? "Congregation" : "Band",
                liturgyRef: { book: "crc-friday", folio: i + 1 },
            }),
        )
        expect(await overflows(await renderServiceSheetPdf({ ...BASE, tracks }))).toEqual([])
    })
})
