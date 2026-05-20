import { describe, expect, it } from "vitest"

import {
    compareTitleToFilename,
    detectOccasionTokens,
} from "../chart-bond-audit"

/**
 * setlist-fixes Lane B — pure-function coverage for the bond-mismatch heuristic
 * and the occasion-token detector. These run in the fast `npm run test` suite
 * (no emulator). The Firestore-touching `review_chart_bonds` + clone wiring is
 * covered in mcp-chart-bond-audit.emulator.test.ts.
 */
describe("compareTitleToFilename", () => {
    it("flags an obvious mismatch (Barchu bonded to Ahava Raba.pdf)", () => {
        const r = compareTitleToFilename("Barchu", "Ahava Raba.pdf")
        expect(r.mismatch).toBe(true)
        expect(r.overlapScore).toBe(0)
    })

    it("flags a topical mismatch (Hallelujah Jam bonded to a Tu Bishvat chart)", () => {
        const r = compareTitleToFilename("Hallelujah Jam", "Tu_Bishvat_Niggun.pdf")
        expect(r.mismatch).toBe(true)
    })

    it("does NOT flag a legitimate arranger/variant suffix", () => {
        const r = compareTitleToFilename("Hineh Ma Tov", "Hineh_Ma_Tov_Lev.pdf")
        expect(r.mismatch).toBe(false)
        expect(r.overlapScore).toBeGreaterThanOrEqual(0.34)
    })

    it("does NOT flag a parenthetical arranger ((Frankel))", () => {
        expect(
            compareTitleToFilename("Shalom Rav", "Shalom_Rav_(Frankel).pdf")
                .mismatch,
        ).toBe(false)
    })

    it("clears a separator-free filename via the compact-substring rescue", () => {
        const r = compareTitleToFilename("Adon Olam", "AdonOlam.pdf")
        expect(r.mismatch).toBe(false)
        expect(r.overlapScore).toBe(1)
    })

    it("folds diacritics and underscore/dash separators before comparing", () => {
        expect(
            compareTitleToFilename("Sh'ma Yisrael", "shma-yisrael.pdf").mismatch,
        ).toBe(false)
    })

    it("never flags when either side is empty (can't judge)", () => {
        expect(compareTitleToFilename("", "Anything.pdf").mismatch).toBe(false)
        expect(compareTitleToFilename("Barchu", "").mismatch).toBe(false)
    })

    it("treats an exact title==filename (sans ext) as a perfect match", () => {
        const r = compareTitleToFilename("Oseh Shalom", "Oseh Shalom.pdf")
        expect(r.mismatch).toBe(false)
        expect(r.overlapScore).toBe(1)
    })
})

describe("detectOccasionTokens", () => {
    it("detects a parsha name + the parashat keyword", () => {
        const hits = detectOccasionTokens("Torah Service — Parashat Emor")
        expect(hits).toContain("emor")
        expect(hits).toContain("parashat")
    })

    it("detects a holiday token", () => {
        expect(detectOccasionTokens("Shavuot Yizkor")).toEqual(
            expect.arrayContaining(["shavuot", "yizkor"]),
        )
    })

    it("detects an ISO date on the raw text (dashes survive)", () => {
        expect(detectOccasionTokens("Notes from 2026-05-02")).toContain(
            "<iso-date>",
        )
    })

    it("detects a gregorian month token", () => {
        expect(detectOccasionTokens("Shabbat Morning — May 16")).toContain("may")
    })

    it("returns empty for an occasion-neutral title", () => {
        expect(detectOccasionTokens("Oseh Shalom")).toEqual([])
        expect(detectOccasionTokens("")).toEqual([])
    })

    it("does not substring-match a short parsha inside another word", () => {
        // "bo" is a parsha; must NOT fire on "Boi Kallah" (token is "boi").
        expect(detectOccasionTokens("Boi Kallah")).not.toContain("bo")
    })
})
