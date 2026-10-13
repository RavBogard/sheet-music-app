// @vitest-environment node
//
// Multi-tenant phase 7: PDF labels follow the tenant's language. A Hebrew
// tenant's service sheet and text-chart pages draw their labels (and titles)
// with the embedded Alef font, in visual order, laid out right-to-left. The
// English default path is pinned byte-for-byte by the goldens; here it is only
// checked to stay on the StandardFonts.
//
// The Hebrew strings below are UI words and invented placeholders, never
// liturgical text.
import { describe, it, expect } from "vitest"
import { getDocumentProxy } from "unpdf"
import { PDFDict, PDFDocument, PDFName } from "pdf-lib"
import EN_PDF from "@/i18n/en/pdf.json"
import { createTranslator, flattenNamespace } from "@/i18n/core"
import { renderServiceSheetPdf } from "../service-sheet-pdf"
import { renderTextChartToPdf } from "../text-chart-pdf"
import { englishPdfT, type PdfI18n } from "../pdf-i18n"

const PAGE_W = 612

export const HE_PDF_TEST: Record<string, string> = {
    "pdf.serviceSheet.untitledService": "ללא שם",
    "pdf.serviceSheet.untitledRow": "שורה ריקה",
    "pdf.serviceSheet.honors": "רשימת שמות",
    "pdf.serviceSheet.honorsContinued": "רשימת שמות (המשך)",
    "pdf.serviceSheet.sectionOrder": "סדר מלא",
    "pdf.serviceSheet.sectionMusic": "שירים בלבד",
}

/** A Hebrew translator over test strings, English for every other key. */
export function hebrewTestI18n(extra: Record<string, string> = {}): PdfI18n {
    return {
        lang: "he",
        t: createTranslator({
            lang: "he",
            messages: { ...HE_PDF_TEST, ...extra },
            fallback: flattenNamespace("pdf", EN_PDF),
        }),
    }
}

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

async function fontsOf(bytes: Uint8Array): Promise<string[]> {
    const doc = await PDFDocument.load(bytes)
    const out: string[] = []
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (!(obj instanceof PDFDict) || obj.get(PDFName.of("Type")) !== PDFName.of("Font")) continue
        out.push(String(obj.get(PDFName.of("BaseFont"))))
    }
    return [...new Set(out)].sort()
}

describe("service sheet labels in the tenant's language", () => {
    it("draws Hebrew labels with Alef, right-to-left, on an English-data sheet", async () => {
        const bytes = await renderServiceSheetPdf({
            setlistName: "",
            sectionLabel: HE_PDF_TEST["pdf.serviceSheet.sectionOrder"],
            tracks: [
                { id: "a", title: "", honors: [{ name: "Sarah Levi" }] },
                { id: "b", title: "Welcome Song", liturgyRef: { book: "b", folio: 12 } },
            ],
            i18n: hebrewTestI18n(),
        })
        const { text, items: its } = await items(bytes)
        for (const s of ["ללא שם", "שורה ריקה", "רשימת שמות", "סדר מלא", "Sarah Levi", "Welcome Song"]) {
            expect(text).toContain(s)
        }
        expect(text).not.toContain("HONORS")
        expect(text).not.toContain("(untitled)")
        expect(await fontsOf(bytes)).toEqual(["/Alef-Bold", "/Alef-Regular"])
        // Hebrew tenant: the layout mirrors (title flush right, folio on the left).
        const title = its.find((i) => i.str === "ללא שם")!
        expect(title.right).toBeCloseTo(PAGE_W - 54, 0)
        const folio = its.find((i) => i.str === "12")!
        expect(folio.x).toBeCloseTo(54, 0)
    })

    it("continues the honors box with the translated continuation label", async () => {
        const honors = Array.from({ length: 300 }, (_, i) => ({ name: `Person ${i}`, note: "x".repeat(60) }))
        const { text } = await items(
            await renderServiceSheetPdf({ setlistName: "x", tracks: [{ id: "a", title: "t", honors }], i18n: hebrewTestI18n() }),
        )
        // Brackets are mirrored for display (bidi L4); text extraction does not
        // mirror them back, so match the words.
        expect(text).toMatch(/רשימת שמות .המשך./)
    })

    it("an explicit English translator stays on Helvetica", async () => {
        const bytes = await renderServiceSheetPdf({
            setlistName: "",
            tracks: [{ id: "a", title: "", honors: [{ name: "A" }] }],
            i18n: { t: englishPdfT(), lang: "en" },
        })
        const { text } = await items(bytes)
        expect(text).toContain("HONORS")
        expect(text).toContain("(untitled)")
        expect(text).toContain("Service")
        expect(await fontsOf(bytes)).toEqual(["/Helvetica", "/Helvetica-Bold"])
    })
})

describe("text chart title for a Hebrew tenant", () => {
    const CHART = ["C       G", "Hello   world"].join("\n")

    it("draws a Hebrew song title with Alef, right-aligned; the chart body stays Courier, left-to-right", async () => {
        const pdf = await PDFDocument.create()
        await renderTextChartToPdf(pdf, "שיר בדיקה", CHART, { i18n: hebrewTestI18n() })
        // A second chart in the same document reuses the embedded font.
        await renderTextChartToPdf(pdf, "Second", CHART, { i18n: hebrewTestI18n() })
        const bytes = await pdf.save()
        const { text, items: its } = await items(bytes)
        expect(text).toContain("שיר בדיקה")
        expect(text).not.toContain("?")
        const title = its.find((i) => i.str === "שיר בדיקה")!
        expect(title.right).toBeCloseTo(PAGE_W - 50, 0)
        const chord = its.find((i) => i.str.startsWith("C"))!
        expect(chord.x).toBeCloseTo(50, 0)
        expect(await fontsOf(bytes)).toEqual(["/Alef-Bold", "/Alef-Regular", "/Courier"])
    })

    it("English (default) keeps Helvetica-Bold and never embeds Alef", async () => {
        const pdf = await PDFDocument.create()
        await renderTextChartToPdf(pdf, "Song", CHART)
        expect(await fontsOf(await pdf.save())).toEqual(["/Courier", "/Helvetica-Bold"])
    })
})
