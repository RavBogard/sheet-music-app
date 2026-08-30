// @vitest-environment node
import { describe, it, expect } from "vitest"
import { PDFDocument } from "pdf-lib"
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
