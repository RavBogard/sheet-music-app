// @vitest-environment node
//
// Multi-tenant phase 7: the gig packet's own labels (cover table headers,
// "Prepared for", footer, the omitted-charts page) and the omission reasons
// follow the tenant's language. For a Hebrew tenant they are drawn with the
// embedded Alef font, in visual order, with the cover table mirrored
// right-to-left; song titles in Hebrew print as Hebrew instead of '?'.
// English stays on Helvetica (its bytes are pinned by the goldens).
//
// Hebrew strings here are UI words and invented placeholders, never liturgical
// text.
import { describe, it, expect, vi } from "vitest"
import { getDocumentProxy } from "unpdf"
import { PDFDict, PDFDocument, PDFName } from "pdf-lib"
import EN_PDF from "@/i18n/en/pdf.json"
import { createTranslator, flattenNamespace } from "@/i18n/core"

const CHART_TEXT = ["C       G", "Hello   world"].join("\n")

vi.mock("@/lib/file-fetcher", () => ({
    fetchFileById: vi.fn(async (id: string) => {
        if (id === "missing") return null
        return { buffer: Buffer.from(CHART_TEXT), contentType: "text/plain", source: "firebase-storage" }
    }),
}))

vi.mock("@/lib/firebase-admin", () => {
    const subColl = { get: async () => ({ empty: true, forEach: () => {} }) }
    const docRef = {
        // A test can set a congregation printFooter through this global.
        get: async () => {
            const footer = (globalThis as { __printFooter?: string }).__printFooter
            return footer ? { exists: true, data: () => ({ printFooter: footer }) } : { exists: false, data: () => undefined }
        },
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

import { generatePrintPdf, type PrintRequest } from "../print-pipeline"
import type { PdfI18n } from "@/lib/pdf/pdf-i18n"

const PAGE_W = 612

const HE: Record<string, string> = {
    "pdf.packet.columnNumber": "מס'",
    "pdf.packet.columnSong": "שירים",
    "pdf.packet.columnKey": "מפתח",
    "pdf.packet.columnVocalLead": "סולן",
    "pdf.packet.columnTransposedKey": "כמו",
    "pdf.packet.columnNotes": "הערות",
    "pdf.packet.columnPage": "עמוד",
    "pdf.packet.folio": "עמ' {page}",
    "pdf.packet.preparedFor": "עבור: {name}",
    "pdf.packet.ledBy": "מוביל: {name}",
    "pdf.packet.capo": "קאפו {fret}",
    "pdf.packet.songCount_one": "שיר אחד",
    "pdf.packet.songCount_two": "שני שירים",
    "pdf.packet.songCount_other": "{count} שירים",
    "pdf.packet.transposed": "מותאם",
    "pdf.packet.omittedTitle": "תווים חסרים",
    "pdf.packet.omittedIntro": "השורות האלה לא הודפסו:",
    "pdf.omission.noChart": "אין קובץ תווים לשיר הזה.",
    "pdf.omission.fileMissing": "קובץ התווים חסר.",
    "pdf.progress.preparing": "מכין הדפסה",
}

function hebrew(): PdfI18n {
    return {
        lang: "he",
        t: createTranslator({ lang: "he", messages: HE, fallback: flattenNamespace("pdf", EN_PDF) }),
    }
}

function request(): PrintRequest {
    return {
        title: "Friday band night",
        date: "2026-09-04",
        musicianName: "Randy",
        tracks: [
            { title: "פתיחה", key: "", notes: "", type: "header" },
            {
                title: "שיר בדיקה",
                key: "C",
                notes: "",
                leadMusician: "דנה",
                fileId: "f1",
                transposition: 2,
                capoFret: 2,
                liturgyRef: { book: "b", folio: 12 },
            },
            { title: "Second Song", key: "G", notes: "", fileId: "missing" },
            { title: "Third Song", key: "D", notes: "" },
        ],
    }
}

interface Item {
    str: string
    x: number
    right: number
    page: number
}

async function items(bytes: Uint8Array): Promise<{ text: string; items: Item[] }> {
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    const out: Item[] = []
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const content = await page.getTextContent()
        for (const it of content.items as Array<{ str: string; transform: number[]; width: number }>) {
            if (!("str" in it) || !it.str.trim()) continue
            out.push({ str: it.str, x: it.transform[4], right: it.transform[4] + it.width, page: p })
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

describe("generatePrintPdf — labels in the tenant's language", () => {
    it("a Hebrew packet builds, embeds Alef and prints the Hebrew labels and titles", async () => {
        const progress: string[] = []
        const result = await generatePrintPdf(request(), (p) => progress.push(p.message), hebrew())
        const { text } = await items(result.pdf)

        for (const s of ["שירים", "מפתח", "סולן", "כמו", "הערות", "עמוד", "עבור", "Randy", "שיר בדיקה", "פתיחה", "דנה", "קאפו", "מותאם", "תווים חסרים"]) {
            expect(text).toContain(s)
        }
        // Hebrew data no longer degrades to '?' on a Hebrew tenant's packet.
        expect(text).not.toContain("??")
        // None of the English labels leak through.
        // ("Song" also appears in the English track titles, which are data.)
        for (const s of ["Vocal Lead", "Prepared for", "Charts omitted"]) expect(text).not.toContain(s)

        const fonts = await fontsOf(result.pdf)
        expect(fonts).toContain("/Alef-Bold")
        expect(fonts).toContain("/Alef-Regular")
        expect(fonts).not.toContain("/Helvetica")
        expect(fonts).not.toContain("/Helvetica-Oblique")
        // The text chart body stays Courier.
        expect(fonts).toContain("/Courier")

        expect(progress[0]).toBe("מכין הדפסה")
    })

    it("omissions carry a machine code and the reason in the tenant's language", async () => {
        const result = await generatePrintPdf(request(), undefined, hebrew())
        expect(result.stats.omittedTracks).toEqual([
            { title: "Second Song", fileId: "missing", code: "file_missing", reason: "קובץ התווים חסר." },
            { title: "Third Song", code: "no_chart", reason: "אין קובץ תווים לשיר הזה." },
        ])
    })

    it("the cover table mirrors right-to-left", async () => {
        const result = await generatePrintPdf(request(), undefined, hebrew())
        const { items: its } = await items(result.pdf)
        const cover = its.filter((i) => i.page === 1)
        // Title and the song column are flush to the right margin / their mirrored column edge.
        expect(cover.find((i) => i.str === "Friday band night")!.right).toBeCloseTo(PAGE_W - 50, 0)
        expect(cover.find((i) => i.str === "שירים")!.right).toBeCloseTo(PAGE_W - 75, 0)
        // The folio column moves to the left margin.
        expect(cover.find((i) => i.str === "עמוד")!.x).toBeCloseTo(50, 0)
        for (const i of cover) {
            expect(i.x).toBeGreaterThanOrEqual(45)
            expect(i.right).toBeLessThanOrEqual(PAGE_W - 45)
        }
    })

    it("an English packet with a Hebrew track title embeds Alef and prints it, not '?'", async () => {
        const req: PrintRequest = {
            title: "Friday band night",
            date: "2026-09-04",
            tracks: [
                { title: "שיר בדיקה", key: "C", notes: "", leadMusician: "Randy", fileId: "f1" },
                { title: "Second Song", key: "G", notes: "", fileId: "f1" },
            ],
        }
        const result = await generatePrintPdf(req)
        const { text, items: its } = await items(result.pdf)
        expect(text).toContain("שיר בדיקה")
        expect(text).not.toContain("?")
        // English labels, English (left-to-right) layout.
        for (const s of ["Song", "Key", "Vocal Lead", "2 songs"]) expect(text).toContain(s)
        expect(its.find((i) => i.page === 1 && i.str === "Song")!.x).toBeCloseTo(75, 0)
        const fonts = await fontsOf(result.pdf)
        expect(fonts).toContain("/Alef-Bold")
        expect(fonts).toContain("/Alef-Regular")
        expect(fonts).not.toContain("/Helvetica")
    })

    it("a Hebrew congregation footer on an all-Latin packet prints with Alef", async () => {
        const g = globalThis as { __printFooter?: string }
        g.__printFooter = "להקה בדיקה • 2026"
        try {
            const res = await generatePrintPdf({
                title: "Friday band night",
                date: "2026-09-04",
                tracks: [{ title: "Second Song", key: "G", notes: "", fileId: "f1" }],
            })
            const { text } = await items(res.pdf)
            expect(text).toContain("להקה בדיקה")
            expect(text).not.toContain("?")
            expect(await fontsOf(res.pdf)).toContain("/Alef-Regular")
        } finally {
            delete g.__printFooter
        }
    })

    it("English (no translator) stays on Helvetica with English labels and codes", async () => {
        const result = await generatePrintPdf({
            ...request(),
            tracks: request().tracks.map((t) => ({ ...t, title: t.title.replace(/[\u0590-\u05ff ]+/g, "") || "Opening", leadMusician: "Dana" })),
        })
        const { text } = await items(result.pdf)
        for (const s of ["Song", "Key", "Vocal Lead", "Notes", "Page", "Prepared for: Randy", "Capo 2", "Charts omitted from this packet"]) {
            expect(text).toContain(s)
        }
        const fonts = await fontsOf(result.pdf)
        expect(fonts).not.toContain("/Alef-Bold")
        expect(fonts).toContain("/Helvetica")
        expect(result.stats.omittedTracks.map((o) => [o.code, o.reason])).toEqual([
            ["file_missing", "The chart file is missing or empty."],
            ["no_chart", "No chart is attached to this song."],
        ])
    })
})
