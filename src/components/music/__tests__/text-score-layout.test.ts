import { describe, it, expect } from "vitest"
import {
    chordLyricLineWidth,
    maxRenderedLineLength,
    fitFontSize,
    type LineWidthInput,
} from "../text-score-layout"

describe("chordLyricLineWidth", () => {
    it("returns the max of summed lyric vs summed chord widths", () => {
        // lyric sum = 4 + 3 = 7; chord sum = 1 + 2 = 3 → 7
        const chunks = [
            { chord: "C", lyric: "love", isChord: true },
            { chord: "Am", lyric: "you", isChord: true },
        ]
        expect(chordLyricLineWidth(chunks)).toBe(7)
    })

    it("is governed by the chord row when lyrics are empty (chord-only line)", () => {
        const chunks = [
            { chord: "Cmaj7", lyric: "", isChord: true },
            { chord: "F#m7b5", lyric: "", isChord: true },
        ]
        expect(chordLyricLineWidth(chunks)).toBe("Cmaj7".length + "F#m7b5".length)
    })
})

describe("maxRenderedLineLength (WS-03 — chord-lyric lines are NOT a constant 40)", () => {
    it("uses the true chord-lyric width when it exceeds a short text-only line", () => {
        const groups: LineWidthInput[] = [
            { type: "text-only", textLength: 12 },
            {
                type: "chord-lyric",
                // 60-char lyric line — the prior code would have scored this 40 and clipped
                chunks: [{ chord: "C", lyric: "x".repeat(60), isChord: true }],
            },
        ]
        expect(maxRenderedLineLength(groups)).toBe(60)
    })

    it("floors at 40 for tiny charts (prevents oversized font / div-by-~0)", () => {
        const groups: LineWidthInput[] = [{ type: "text-only", textLength: 5 }]
        expect(maxRenderedLineLength(groups)).toBe(40)
    })

    it("handles an empty chart without throwing", () => {
        expect(maxRenderedLineLength([])).toBe(40)
    })
})

describe("fitFontSize (WS-03 legibility floor + cap)", () => {
    it("clamps with an 11px floor and 15px cap at zoom 1.0", () => {
        const css = fitFontSize({ maxLen: 200, zoom: 1 })
        expect(css.startsWith("clamp(")).toBe(true)
        expect(css).toContain("11px * 1")  // floor
        expect(css).toContain("15px * 1")  // cap
        expect(css).toContain("100cqi /")  // container-query basis preserved
    })

    it("scales all three bounds with zoom", () => {
        const css = fitFontSize({ maxLen: 80, zoom: 1.5 })
        expect(css).toContain("11px * 1.5")
        expect(css).toContain("15px * 1.5")
        expect(css).toContain("* 1.5)")
    })

    it("honors custom floor/cap", () => {
        const css = fitFontSize({ maxLen: 80, zoom: 1, minPx: 9, maxPx: 18 })
        expect(css).toContain("9px * 1")
        expect(css).toContain("18px * 1")
    })
})
