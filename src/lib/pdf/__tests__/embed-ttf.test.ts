// @vitest-environment node
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PDFDocument, rgb } from "pdf-lib"
import { extractText } from "unpdf"
import { embedTtf, parseTtf } from "../embed-ttf"
import { toVisual } from "../bidi-visual"
import { loadAlefFonts } from "../hebrew-fonts"

const FONT_DIR = join(__dirname, "..", "fonts")
const regular = new Uint8Array(readFileSync(join(FONT_DIR, "Alef-Regular.ttf")))
const boldBytes = new Uint8Array(readFileSync(join(FONT_DIR, "Alef-Bold.ttf")))

async function pdfText(bytes: Uint8Array): Promise<string> {
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true })
    return text
}

describe("parseTtf (Alef)", () => {
    const f = parseTtf(regular)

    it("reads the core metrics", () => {
        expect(f.postScriptName).toBe("Alef-Regular")
        expect(f.unitsPerEm).toBe(2048)
        expect(f.numGlyphs).toBeGreaterThan(300)
        expect(f.ascender).toBeGreaterThan(0)
        expect(f.descender).toBeLessThan(0)
        expect(f.capHeight).toBeGreaterThan(0)
        expect(f.bbox.xMax).toBeGreaterThan(f.bbox.xMin)
        expect(f.advances.length).toBe(f.numGlyphs)
    })

    it("maps Hebrew and Latin through the cmap", () => {
        const alef = f.cmap.get(0x05d0)
        const A = f.cmap.get(0x41)
        expect(alef).toBeGreaterThan(0)
        expect(A).toBeGreaterThan(0)
        expect(alef).not.toBe(A)
        expect(f.advances[alef!]).toBeGreaterThan(0)
        expect(f.advances[A!]).toBeGreaterThan(0)
        // Every Hebrew letter is covered.
        for (let cp = 0x05d0; cp <= 0x05ea; cp++) expect(f.cmap.has(cp)).toBe(true)
        // Niqqud are zero-advance marks.
        expect(f.advances[f.cmap.get(0x05b8)!]).toBe(0)
    })

    it("rejects a non-TrueType buffer", () => {
        expect(() => parseTtf(new Uint8Array(64))).toThrow(/TrueType/)
    })

    it("parses the bold face and the generated base64 modules match the TTFs", async () => {
        expect(parseTtf(boldBytes).postScriptName).toBe("Alef-Bold")
        const mods = await loadAlefFonts()
        expect(Buffer.from(mods.regular).equals(Buffer.from(regular))).toBe(true)
        expect(Buffer.from(mods.bold).equals(Buffer.from(boldBytes))).toBe(true)
    })
})

describe("embedTtf", () => {
    it("measures text from hmtx advances", async () => {
        const doc = await PDFDocument.create()
        const font = embedTtf(doc, regular)
        const f = font.parsed
        const expected = ((f.advances[f.cmap.get(0x05e9)!] + f.advances[f.cmap.get(0x05d9)!]) / 2048) * 10
        expect(font.widthOfTextAtSize("שי", 10)).toBeCloseTo(expected, 6)
        // Order-independent (wrapping measures logical text, draws visual).
        expect(font.widthOfTextAtSize("שיר חדש", 12)).toBeCloseTo(
            font.widthOfTextAtSize(toVisual("שיר חדש"), 12),
            6,
        )
        expect(font.widthOfTextAtSize("A", 12)).toBeGreaterThan(0)
        expect(font.heightAtSize(12)).toBeGreaterThan(font.heightAtSize(12, { descender: false }))
    })

    it("encodes text as 2-byte glyph ids, with a fallback for unmapped chars", async () => {
        const doc = await PDFDocument.create()
        const font = embedTtf(doc, regular)
        const gA = font.parsed.cmap.get(0x41)!
        const gQ = font.parsed.cmap.get(0x3f)!
        expect(font.encodeText("A").asString()).toBe(gA.toString(16).padStart(4, "0").toUpperCase())
        // U+4E00 (CJK) is not in Alef: drawn as '?'.
        expect(font.glyphFor(0x4e00)).toBe(gQ)
        expect(font.hasGlyph(0x4e00)).toBe(false)
        // An unmapped combining mark (cantillation U+0591) is dropped, not '?'.
        expect(font.encodeText("א֑").asString().length).toBe(4)
    })

    it("round-trips Hebrew and Latin through a saved PDF via ToUnicode", async () => {
        const doc = await PDFDocument.create()
        const font = embedTtf(doc, regular)
        const bold = embedTtf(doc, boldBytes)
        const page = doc.addPage([612, 792])
        font.drawText(page, toVisual("שיר חדש"), { x: 50, y: 700, size: 14, color: rgb(0, 0, 0) })
        bold.drawText(page, "Band One", { x: 50, y: 650, size: 14, color: rgb(0, 0, 0) })
        font.drawText(page, toVisual("להקה 12"), { x: 50, y: 600, size: 14, color: rgb(0, 0, 0) })
        const bytes = await doc.save()

        const reloaded = await PDFDocument.load(bytes)
        expect(reloaded.getPageCount()).toBe(1)

        const text = await pdfText(bytes)
        expect(text).toContain("Band One")
        // pdf.js recovers logical order for RTL runs from the visual glyph order.
        expect(text).toContain("שיר חדש")
        expect(text).toContain("להקה")
        expect(text).toContain("12")
        expect(text).not.toContain("?")
    })

    it("reuses one font resource key per page", async () => {
        const doc = await PDFDocument.create()
        const font = embedTtf(doc, regular)
        const page = doc.addPage()
        font.drawText(page, "A", { x: 0, y: 0, size: 10, color: rgb(0, 0, 0) })
        font.drawText(page, "B", { x: 0, y: 20, size: 10, color: rgb(0, 0, 0) })
        const fonts = page.node.normalizedEntries().Font
        expect(fonts.keys().length).toBe(1)
    })
})
