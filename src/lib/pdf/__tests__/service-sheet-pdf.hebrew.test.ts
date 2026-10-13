// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import { getDocumentProxy } from "unpdf"
import { PDFDict, PDFDocument, PDFName } from "pdf-lib"
import { renderServiceSheetPdf, type ServiceSheetInput } from "../service-sheet-pdf"

// Spy on the font loader so we can prove the English path never reaches it.
vi.mock("../hebrew-fonts", async (importOriginal) => {
    const mod = await importOriginal<typeof import("../hebrew-fonts")>()
    return { loadAlefFonts: vi.fn(mod.loadAlefFonts) }
})
import { loadAlefFonts } from "../hebrew-fonts"

const PAGE_W = 612
const MARGIN = 54

interface Item {
    str: string
    x: number
    right: number
    y: number
}

async function items(bytes: Uint8Array): Promise<{ text: string; items: Item[] }> {
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    const out: Item[] = []
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const content = await page.getTextContent()
        for (const it of content.items as Array<{ str: string; transform: number[]; width: number }>) {
            if (!("str" in it) || !it.str.trim()) continue
            out.push({ str: it.str, x: it.transform[4], right: it.transform[4] + it.width, y: it.transform[5] })
        }
    }
    return { text: out.map((i) => i.str).join("\n"), items: out }
}

/** "Subtype:BaseFont[:Encoding]" for every font dict (object streams are compressed). */
async function fontsOf(bytes: Uint8Array): Promise<string[]> {
    const doc = await PDFDocument.load(bytes)
    const out: string[] = []
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue
        const enc = obj.get(PDFName.of("Encoding"))
        out.push(
            [obj.get(PDFName.of("Subtype")), obj.get(PDFName.of("BaseFont")), enc instanceof PDFName ? enc : ""]
                .map(String)
                .filter(Boolean)
                .join(":"),
        )
    }
    return out.sort()
}

const HEBREW: ServiceSheetInput = {
    setlistName: "שיר חדש עם הלהקה",
    eventDate: "2026-09-04",
    rabbi: "דוד כהן",
    sectionLabel: "חזרה",
    tracks: [
        { id: "h", type: "header", title: "פתיחה" },
        {
            id: "a",
            type: "song",
            title: "שיר חדש",
            performer: "להקה",
            liturgyRef: { book: "b", folio: 34 },
            honors: [{ name: "שרה לוי", note: "קריאה" }],
        },
        {
            id: "b",
            type: "song",
            title: "בוקר טוב (Band One)",
            leadMusician: "Randy",
            description: "חזרה בשעה 3:30 עם כל הלהקה",
        },
    ],
}

describe("renderServiceSheetPdf — Hebrew", () => {
    it("prints Hebrew as real glyphs, not '?'", async () => {
        const bytes = await renderServiceSheetPdf(HEBREW)
        const { text } = await items(bytes)
        for (const s of ["שיר חדש עם הלהקה", "דוד כהן", "שרה לוי", "קריאה", "להקה", "פתיחה", "Randy"]) {
            expect(text).toContain(s)
        }
        expect(text).toContain("34")
        expect(text).toContain("3:30")
        expect(text).not.toContain("?")
        // Alef is embedded as a Type0/Identity-H font; Helvetica is not used.
        expect(await fontsOf(bytes)).toEqual([
            "/CIDFontType2:/Alef-Bold",
            "/CIDFontType2:/Alef-Regular",
            "/Type0:/Alef-Bold:/Identity-H",
            "/Type0:/Alef-Regular:/Identity-H",
        ])
        expect(loadAlefFonts).toHaveBeenCalled()
    })

    it("lays out a Hebrew-first sheet right-to-left", async () => {
        const { items: its } = await items(await renderServiceSheetPdf(HEBREW))
        const title = its.find((i) => i.str.includes("הלהקה"))!
        expect(title.right).toBeCloseTo(PAGE_W - MARGIN, 0)
        const row = its.find((i) => i.str === "שיר חדש")!
        expect(row.right).toBeCloseTo(PAGE_W - MARGIN, 0)
        // The folio closes the title line on the LEFT in RTL.
        const folio = its.find((i) => i.str === "34")!
        expect(folio.x).toBeCloseTo(MARGIN, 0)
        // Mixed title keeps its Latin words intact.
        expect(its.some((i) => i.str.includes("Band One"))).toBe(true)
    })

    it("keeps LTR layout when asked, with Hebrew still correct", async () => {
        const { items: its, text } = await items(
            await renderServiceSheetPdf({ ...HEBREW, direction: "ltr" }),
        )
        const row = its.find((i) => i.str === "שיר חדש")!
        expect(row.x).toBeCloseTo(MARGIN, 0)
        const folio = its.find((i) => i.str === "34")!
        expect(folio.right).toBeCloseTo(PAGE_W - MARGIN, 0)
        expect(text).toContain("שרה לוי")
    })

    it("an English sheet with one Hebrew title stays LTR and prints the title", async () => {
        const { items: its } = await items(
            await renderServiceSheetPdf({
                setlistName: "Friday Evening",
                tracks: [
                    { id: "a", title: "Welcome Song", liturgyRef: { book: "b", folio: 12 } },
                    { id: "b", title: "שיר חדש" },
                ],
            }),
        )
        const he = its.find((i) => i.str === "שיר חדש")!
        expect(he.x).toBeCloseTo(MARGIN, 0)
        const en = its.find((i) => i.str === "Welcome Song")!
        expect(en.x).toBeCloseTo(MARGIN, 0)
    })

    it("wraps long Hebrew lines inside the margins", async () => {
        const long = Array.from({ length: 30 }, (_, i) => (i % 2 ? "להקה" : "חזרה")).join(" ")
        const { items: its } = await items(
            await renderServiceSheetPdf({
                setlistName: long,
                tracks: [{ id: "a", title: long, honors: [{ name: long }] }],
            }),
        )
        expect(its.length).toBeGreaterThan(4)
        for (const i of its) {
            expect(i.x).toBeGreaterThanOrEqual(MARGIN - 0.5)
            expect(i.right).toBeLessThanOrEqual(PAGE_W - MARGIN + 0.5)
        }
    })

    it("English-only input never loads the Hebrew fonts", async () => {
        vi.mocked(loadAlefFonts).mockClear()
        const bytes = await renderServiceSheetPdf({
            setlistName: "Friday Evening",
            rabbi: "Rabbi Daniel",
            tracks: [{ id: "a", title: "Welcome Song “Live”" }],
        })
        expect(loadAlefFonts).not.toHaveBeenCalled()
        expect(await fontsOf(bytes)).toEqual([
            "/Type1:/Helvetica-Bold:/WinAnsiEncoding",
            "/Type1:/Helvetica:/WinAnsiEncoding",
        ])
    })
})
