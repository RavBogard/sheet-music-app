/**
 * Regression cover for the 2026-09-10 "Print this chart prints a blank page"
 * bug.
 *
 * Root cause (probed live in Chrome 152 on prod): a `blob:` PDF handed to a
 * hidden iframe is taken over by Chrome's PDF plugin in a CROSS-ORIGIN
 * frame. `iframe.onload` fires while the frame still holds an empty
 * placeholder document, so the old `contentWindow.print()` there printed
 * nothing but the browser's header/footer; and once the plugin has swapped
 * in, reading `contentWindow.print` throws SecurityError. There is no moment
 * at which that frame is printable from this origin.
 *
 * The fix rasterizes with pdf.js and prints a document THIS origin authored.
 * These tests pin the two properties that make that work: the routing never
 * hands a PDF blob to a plugin frame again, and the authored document gives
 * every chart page its own correctly-oriented, fitted sheet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildPrintDocumentHtml, type PrintPageImage } from "../print-document"

const page = (widthPt: number, heightPt: number, url = "blob:x"): PrintPageImage => ({
    url,
    widthPt,
    heightPt,
})

describe("buildPrintDocumentHtml", () => {
    it("AC-1: gives every chart page its own sheet", () => {
        const html = buildPrintDocumentHtml(
            [page(612, 792, "blob:p1"), page(612, 792, "blob:p2"), page(612, 792, "blob:p3")],
            "Hashkivenu",
        )
        expect(html.match(/class="pg"/g)).toHaveLength(3)
        expect(html).toContain('src="blob:p1"')
        expect(html).toContain('src="blob:p2"')
        expect(html).toContain('src="blob:p3"')
        expect(html).toContain("page-break-after: always")
        // The trailing break would otherwise eject a blank final sheet.
        expect(html).toContain(".pg:last-child { page-break-after: auto")
    })

    it("AC-2: a portrait chart prints portrait", () => {
        expect(buildPrintDocumentHtml([page(612, 792)], "T")).toContain("size: portrait")
    })

    it("AC-3: a landscape chart prints landscape — not shrunken onto a portrait sheet", () => {
        expect(buildPrintDocumentHtml([page(792, 612)], "T")).toContain("size: landscape")
    })

    it("AC-4: a mixed document follows the majority orientation", () => {
        const mostlyLandscape = [page(792, 612), page(792, 612), page(612, 792)]
        expect(buildPrintDocumentHtml(mostlyLandscape, "T")).toContain("size: landscape")
        // An even split is not a majority — portrait stays the default.
        const evenSplit = [page(792, 612), page(612, 792)]
        expect(buildPrintDocumentHtml(evenSplit, "T")).toContain("size: portrait")
    })

    it("AC-5: pages scale to fit without cropping", () => {
        const html = buildPrintDocumentHtml([page(612, 792)], "T")
        expect(html).toContain("object-fit: contain")
        expect(html).toContain("max-height: 100%")
    })

    it("AC-6: a chart title carrying HTML metacharacters can't break the document", () => {
        const html = buildPrintDocumentHtml([page(612, 792)], 'Sh"ma <b> & Co')
        expect(html).toContain("<title>Sh&quot;ma &lt;b&gt; &amp; Co</title>")
        expect(html).not.toContain("<b>")
    })
})

// ── Routing: no path may hand a PDF blob to a plugin frame ──

// `vi.hoisted` because vi.mock factories are hoisted above these bindings —
// the print-document factory runs during this file's own top-level import.
const spies = vi.hoisted(() => ({
    printPdfBlob: vi.fn(async (_blob: Blob, _title: string) => {}),
    printImageBlob: vi.fn(async (_blob: Blob, _title: string) => {}),
    generatePdfBlob: vi.fn(async () => new Blob(["server-pdf"], { type: "application/pdf" })),
    getFile: vi.fn(async () => new Blob(["cached-pdf"], { type: "application/pdf" })),
}))
const { printPdfBlob, printImageBlob, generatePdfBlob } = spies

vi.mock("../print-document", async importOriginal => ({
    ...(await importOriginal<typeof import("../print-document")>()),
    printPdfBlob: spies.printPdfBlob,
    printImageBlob: spies.printImageBlob,
}))
vi.mock("@/lib/print-generation", () => ({ generatePdfBlob: spies.generatePdfBlob }))
vi.mock("@/lib/offline-idb", () => ({ getFile: spies.getFile }))

const track = {
    fileId: "file-1",
    fileName: "hashkivenu.pdf",
    mimeType: "application/pdf",
    title: "Hashkivenu",
    key: "Am",
    tune: "",
    notes: "",
    leadMusician: "",
    type: "song",
} as const

describe("printCurrentChart routing", () => {
    beforeEach(() => {
        printPdfBlob.mockClear()
        printImageBlob.mockClear()
        generatePdfBlob.mockClear()
    })

    const run = async (over: Record<string, unknown>) => {
        const { printCurrentChart } = await import("../print-current-chart")
        await printCurrentChart({
            viewerKind: "pdf",
            track: { ...track },
            networkUrl: "/api/drive/file/file-1",
            transposition: 0,
            capoFret: 0,
            ...over,
        } as Parameters<typeof printCurrentChart>[0])
    }

    it("AC-7: an untransposed PDF goes through the authored-document printer, never a raw plugin frame", async () => {
        await run({})
        expect(printPdfBlob).toHaveBeenCalledTimes(1)
        expect(printPdfBlob.mock.calls[0][1]).toBe("Hashkivenu")
        expect(generatePdfBlob).not.toHaveBeenCalled()
    })

    it("AC-8: a transposed PDF renders server-side first, then prints through the same path", async () => {
        await run({ transposition: 2 })
        expect(generatePdfBlob).toHaveBeenCalledTimes(1)
        expect(printPdfBlob).toHaveBeenCalledTimes(1)
    })

    it("AC-9: a text chart renders server-side, then prints through the same path", async () => {
        await run({ viewerKind: "text" })
        expect(generatePdfBlob).toHaveBeenCalledTimes(1)
        expect(printPdfBlob).toHaveBeenCalledTimes(1)
    })

    it("AC-10: an image chart uses the image printer", async () => {
        await run({ viewerKind: "image" })
        expect(printImageBlob).toHaveBeenCalledTimes(1)
        expect(printPdfBlob).not.toHaveBeenCalled()
    })
})
