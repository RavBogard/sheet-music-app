import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"

import { stripFirstPage, parseMatchedPairs } from "../heal-run-from-plan"

async function makePdf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    for (let i = 0; i < pages; i++) doc.addPage([200, 200])
    return doc.save()
}

describe("stripFirstPage", () => {
    it("removes page 1 from a 3-page PDF → 2 pages", async () => {
        const r = await stripFirstPage(await makePdf(3))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.origPages).toBe(3)
        expect(r.newPages).toBe(2)
        // result is a valid loadable PDF with the new page count
        const reloaded = await PDFDocument.load(r.bytes)
        expect(reloaded.getPageCount()).toBe(2)
    })

    it("reduces a 2-page PDF to 1 page", async () => {
        const r = await stripFirstPage(await makePdf(2))
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.newPages).toBe(1)
    })

    it("refuses a 1-page PDF (too_few_pages) — never produces an empty upload", async () => {
        const r = await stripFirstPage(await makePdf(1))
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.reason).toBe("too_few_pages")
        expect(r.origPages).toBe(1)
    })
})

describe("parseMatchedPairs", () => {
    it("extracts localFile + fileId from a heal-plan matched[]", () => {
        const plan = {
            matched: [
                { localFile: "C:/b/993122D003 Adonai Oz.pdf", fileId: "uuid-1", matchedKey: "adonaioz", via: "fileName" as const },
                { localFile: "C:/b/993122D004 Hodu.pdf", fileId: "uuid-2", matchedKey: "hodu", via: "title" as const },
            ],
        }
        expect(parseMatchedPairs(plan)).toEqual([
            { localFile: "C:/b/993122D003 Adonai Oz.pdf", fileId: "uuid-1" },
            { localFile: "C:/b/993122D004 Hodu.pdf", fileId: "uuid-2" },
        ])
    })

    it("returns [] for a plan with no matched array", () => {
        expect(parseMatchedPairs({ matched: undefined as never })).toEqual([])
    })
})
