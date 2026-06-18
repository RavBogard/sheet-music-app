// @vitest-environment node
// pdf-lib's internal `instanceof Uint8Array` check fails under jsdom, so the
// renderer must run in the Node environment (same rationale as mcp-gig-packet).
import { describe, it, expect } from "vitest"
import { PDFDocument } from "pdf-lib"
import {
    toWinAnsi,
    isChordToken,
    isChordLine,
    transposeChartText,
    renderTextChartToPdf,
} from "../text-chart-pdf"

// A representative scraped text chord chart (chord line over lyric line).
const SAMPLE = [
    "Verse 1",
    "C       G",
    "Hello   world",
    "Am      F",
    "this is the song",
    "",
    "Chorus",
    "G   D   Em  C",
    "na  na  na  na",
].join("\n")

describe("isChordToken / isChordLine", () => {
    it("recognizes chords and chord-chart punctuation", () => {
        expect(isChordToken("C")).toBe(true)
        expect(isChordToken("G")).toBe(true)
        expect(isChordToken("Am")).toBe(true)
        expect(isChordToken("F#m7")).toBe(true)
        expect(isChordToken("C/E")).toBe(true)
        expect(isChordToken("N.C.")).toBe(true)
        expect(isChordToken("x2")).toBe(true)
        expect(isChordToken("|")).toBe(true)
        expect(isChordToken("Hello")).toBe(false)
    })
    it("classifies chord lines vs lyric lines", () => {
        expect(isChordLine("C       G")).toBe(true)
        expect(isChordLine("G   D   Em  C")).toBe(true)
        expect(isChordLine("Hello   world")).toBe(false)
        expect(isChordLine("this is the song")).toBe(false)
        expect(isChordLine("")).toBe(false)
    })
})

describe("transposeChartText", () => {
    it("AC-2: semitones 0 returns the chart byte-identical", () => {
        expect(transposeChartText(SAMPLE, 0)).toBe(SAMPLE)
    })

    it("AC-2: transposes chord lines, leaves lyric/section lines untouched", () => {
        const out = transposeChartText(SAMPLE, 2)
        const lines = out.split("\n")
        // chord line "C       G" → "D       A" (whole-step, same widths → exact columns)
        expect(lines[1]).toBe("D       A")
        // lyric line untouched
        expect(lines[2]).toBe("Hello   world")
        // "Am      F" → "Bm      G"
        expect(lines[3]).toBe("Bm      G")
        expect(lines[4]).toBe("this is the song")
        // section header untouched
        expect(lines[0]).toBe("Verse 1")
        // "G   D   Em  C" → "A   E   F#m G"
        expect(lines[7].startsWith("A")).toBe(true)
    })

    it("AC-2: anchors transposed chords at original columns when widths match", () => {
        const out = transposeChartText("C       G", 2)
        expect(out.indexOf("D")).toBe(0)
        expect(out.indexOf("A")).toBe(8)
    })

    it("AC-2: keeps a >=1-space gap when a transposed chord widens into the next", () => {
        // "C F" +1 → C→Db (2 chars) would collide with F's column 2 → push right 1 space
        const out = transposeChartText("C F", 1, true)
        expect(out.startsWith("Db")).toBe(true)
        // the two chords stay separated by at least one space, order preserved
        expect(/^Db\s+\S/.test(out)).toBe(true)
    })
})

describe("toWinAnsi", () => {
    it("AC-3: substitutes smart quotes, dashes, ellipsis, nbsp", () => {
        expect(toWinAnsi("don’t")).toBe("don't")
        expect(toWinAnsi("“hi”")).toBe('"hi"')
        expect(toWinAnsi("a—b")).toBe("a-b")
        expect(toWinAnsi("x…")).toBe("x...")
    })
    it("AC-3: maps anything outside WinAnsi to '?' (never throws downstream)", () => {
        expect(toWinAnsi("שלום")).toBe("????") // Hebrew → ?
    })
})

describe("renderTextChartToPdf", () => {
    it("AC-1: appends at least one page for a text chart", async () => {
        const pdf = await PDFDocument.create()
        const before = pdf.getPageCount()
        await renderTextChartToPdf(pdf, "Hello World", SAMPLE)
        expect(pdf.getPageCount()).toBeGreaterThan(before)
    })

    it("AC-1: paginates a long chart across multiple pages", async () => {
        const pdf = await PDFDocument.create()
        const long = Array.from({ length: 300 }, (_, i) => `line ${i} C G Am F`).join("\n")
        await renderTextChartToPdf(pdf, "Long Chart", long)
        expect(pdf.getPageCount()).toBeGreaterThan(1)
    })

    it("AC-3: does not throw on unicode artifacts", async () => {
        const pdf = await PDFDocument.create()
        await expect(
            renderTextChartToPdf(pdf, "Sm’art — Title", "C\nDon’t — stop …\nשלום"),
        ).resolves.toBeUndefined()
        expect(pdf.getPageCount()).toBeGreaterThan(0)
    })

    it("AC-2: renders a transposed chart without throwing and produces pages", async () => {
        const pdf = await PDFDocument.create()
        await renderTextChartToPdf(pdf, "Transposed", SAMPLE, { transposition: 2 })
        expect(pdf.getPageCount()).toBeGreaterThan(0)
    })
})
