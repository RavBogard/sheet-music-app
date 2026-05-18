/**
 * Cycle-4 C4-007 regression — every `library_index.name` write boundary
 * (processChartUpload, the legacy setlist importer, acceptEnrichment,
 * editEnrichment) routes its raw input through `normalizeChartTitle`.
 *
 * Cycle-3 REG-001 closed the upload write boundary; cycle-4 cowork
 * found two more sites that leaked leading whitespace and forked the
 * dedupe bucket. These tests pin the helper contract that all four
 * sites now share.
 */

import { describe, expect, it } from "vitest"

import { normalizeChartTitle } from "../normalize-chart-title"

describe("normalizeChartTitle", () => {
    it("strips leading whitespace (the Ana B'Koach repro)", () => {
        expect(normalizeChartTitle(" Ana B_Koach")).toBe("Ana B_Koach")
        expect(normalizeChartTitle("  Ana B_Koach")).toBe("Ana B_Koach")
        expect(normalizeChartTitle("\t Ana B_Koach")).toBe("Ana B_Koach")
    })

    it("strips trailing whitespace", () => {
        expect(normalizeChartTitle("Ana B_Koach ")).toBe("Ana B_Koach")
        expect(normalizeChartTitle("Ana B_Koach\t")).toBe("Ana B_Koach")
        expect(normalizeChartTitle("Ana B_Koach \n")).toBe("Ana B_Koach")
    })

    it("strips outer NBSP (U+00A0)", () => {
        // NBSP slips in from Drive metadata + Word/Pages copy-paste;
        // it isn't matched by `String#trim()` in some legacy engines
        // but `\s` covers it in modern V8. Pinned explicitly.
        expect(normalizeChartTitle(" Ana B'Koach ")).toBe(
            "Ana B'Koach",
        )
    })

    it("collapses internal whitespace runs to a single space", () => {
        expect(normalizeChartTitle("Ana  B'Koach")).toBe("Ana B'Koach")
        expect(normalizeChartTitle("Ana\tB'Koach")).toBe("Ana B'Koach")
        expect(normalizeChartTitle("Ana   B'Koach")).toBe(
            "Ana B'Koach",
        )
    })

    it("is idempotent", () => {
        const once = normalizeChartTitle(" Ana   B'Koach ")
        const twice = normalizeChartTitle(once)
        expect(twice).toBe(once)
        expect(twice).toBe("Ana B'Koach")
    })

    it("returns empty string for whitespace-only input", () => {
        // Callers decide what to do with empty; the helper doesn't
        // invent fallback text.
        expect(normalizeChartTitle("   ")).toBe("")
        expect(normalizeChartTitle("\t\n")).toBe("")
        expect(normalizeChartTitle("")).toBe("")
    })

    it("preserves internal punctuation and unicode", () => {
        expect(normalizeChartTitle("Ana B'Koach (as of 3-27-26)")).toBe(
            "Ana B'Koach (as of 3-27-26)",
        )
        expect(normalizeChartTitle("Mizmor L'David — Carlebach")).toBe(
            "Mizmor L'David — Carlebach",
        )
        expect(normalizeChartTitle("⚠️ STRESS TEST — Adon Olam")).toBe(
            "⚠️ STRESS TEST — Adon Olam",
        )
    })
})
