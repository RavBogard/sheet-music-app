/**
 * Wave-2 ingest-mutator-matrix F-7 — unit tests for the
 * `recomputeIndexNameFields` helper.
 *
 * The helper MUST produce values byte-for-byte equivalent to what
 * `processChartUpload` writes inline at `library-upload.ts:540-545`.
 * If these tests drift from PCU, the F-7 fix has regressed.
 */

import { describe, it, expect } from "vitest"
import { recomputeIndexNameFields } from "../recompute-index-name-fields"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"

describe("recomputeIndexNameFields — F-7 helper", () => {
    describe("nameLower", () => {
        it("lowercases ASCII", () => {
            expect(recomputeIndexNameFields("Adon Olam", 1).nameLower).toBe("adon olam")
        })

        it("preserves whitespace + punctuation", () => {
            expect(
                recomputeIndexNameFields("Hashkivenu (Klepper-Freelander)", 1).nameLower,
            ).toBe("hashkivenu (klepper-freelander)")
        })

        it("handles emoji + non-Latin runs intact (lowercase only)", () => {
            // PCU's nameLower lowercases without stripping — emojis pass through.
            expect(
                recomputeIndexNameFields("⚠️ STRESS TEST — Adon Olam", 1).nameLower,
            ).toBe("⚠️ stress test — adon olam")
        })
    })

    describe("normalizedName", () => {
        it("strips to lowercase a-z 0-9 only", () => {
            expect(
                recomputeIndexNameFields("Hashkivenu (Klepper-Freelander)", 1)
                    .normalizedName,
            ).toBe("hashkivenuklepperfreelander")
        })

        it("preserves dedup-bucket parity with PCU's inline compute", () => {
            // Mirror PCU's exact line:
            //   const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
            const cases = [
                "Ana B'Koach",
                " Ana  B'Koach",
                "Eitz Chayim - Weisenberg",
                "⚠️ STRESS TEST — Adon Olam",
                "Adon Olam (Goldfarb)",
                "L'cha Dodi 5",
                "",
            ]
            for (const title of cases) {
                const helper = recomputeIndexNameFields(title, 1).normalizedName
                const inline = title.toLowerCase().replace(/[^a-z0-9]/g, "")
                expect(helper).toBe(inline)
            }
        })
    })

    describe("stem", () => {
        it("delegates to bareStem (drops parens + hyphen-composer)", () => {
            expect(recomputeIndexNameFields("Adon Olam (Goldfarb)", 1).stem).toBe(
                bareStem("Adon Olam (Goldfarb)"),
            )
            expect(
                recomputeIndexNameFields("Eitz Chayim - Weisenberg", 1).stem,
            ).toBe(bareStem("Eitz Chayim - Weisenberg"))
        })

        it("returns the same stem for two arrangements of the same liturgy", () => {
            const a = recomputeIndexNameFields("Hashkivenu (Klepper)", 1).stem
            const b = recomputeIndexNameFields(
                "Hashkivenu (Freelander)",
                2,
            ).stem
            expect(a).toBe(b)
        })

        it("returns empty stem for empty title", () => {
            expect(recomputeIndexNameFields("", 1).stem).toBe("")
        })
    })

    describe("titleSpecificity", () => {
        it("delegates to titleSpecificity (W-02 §2 scoring)", () => {
            for (const [title, siblings] of [
                ["Adon Olam (Goldfarb)", 1],
                ["Hashkivenu", 3],
                ["Eitz Chayim - Weisenberg", 1],
                ["⚠️ STRESS TEST", 1],
                ["", 1],
            ] as Array<[string, number]>) {
                expect(
                    recomputeIndexNameFields(title, siblings).titleSpecificity,
                ).toBe(titleSpecificity(title, siblings))
            }
        })

        it("siblings count drives the -0.2 / +0.2 swing", () => {
            const unique = recomputeIndexNameFields("Modim Anachnu Lach", 1)
                .titleSpecificity
            const shared = recomputeIndexNameFields("Modim Anachnu Lach", 3)
                .titleSpecificity
            // Per W-02 §2: +0.2 unique, -0.2 shared. Delta is 0.4 (modulo clamping).
            expect(unique).toBeGreaterThan(shared)
        })
    })

    describe("PCU parity (byte-for-byte vs library-upload.ts:540-545 inline compute)", () => {
        // This is the regression guard the dispatch calls out: the helper
        // must produce IDENTICAL field values to PCU's inline compute, or
        // the F-7 fix has silently drifted from the canonical write path.
        function pcuInline(title: string, siblingsInCatalog: number) {
            // Verbatim copy of PCU's compute at lines 384, 392, 522, 545.
            const nameLower = title.toLowerCase()
            const normalizedName = nameLower.replace(/[^a-z0-9]/g, "")
            const stem = bareStem(title)
            return {
                nameLower,
                normalizedName,
                stem,
                titleSpecificity: titleSpecificity(title, siblingsInCatalog),
            }
        }

        const cases: Array<[string, number]> = [
            ["Adon Olam", 1],
            ["Adon Olam (Goldfarb)", 2],
            ["Hashkivenu (Klepper-Freelander)", 5],
            ["Hashkivenu", 5],
            ["Eitz Chayim - Weisenberg", 1],
            ["⚠️ STRESS TEST — Adon Olam", 1],
            ["Ana B'Koach", 1],
            ["L'cha Dodi 5", 3],
            ["MIKDASH_MELECH", 1],
            ["", 1],
        ]

        for (const [title, siblings] of cases) {
            it(`parity: "${title}" / siblings=${siblings}`, () => {
                expect(recomputeIndexNameFields(title, siblings)).toEqual(
                    pcuInline(title, siblings),
                )
            })
        }
    })
})
