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
import {
    STRIPPABLE_EXTENSION_RE,
    bareStem,
    titleSpecificity,
} from "@/lib/mcp/title-specificity"

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
            // Mirror PCU's exact line (post 2026-05-25 normalizedname-pin):
            //   const normalizedName = nameLower
            //       .replace(STRIPPABLE_EXTENSION_RE, "")
            //       .replace(/[^a-z0-9]/g, "")
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
                const inline = title
                    .toLowerCase()
                    .replace(STRIPPABLE_EXTENSION_RE, "")
                    .replace(/[^a-z0-9]/g, "")
                expect(helper).toBe(inline)
            }
        })

        // β — trailing media extension strip (2026-05-25
        // recompute-helper-normalizedname-pin lane). Mirrors the bareStem
        // ext-strip introduced by pdf-stem-drift at `e01dc2b1a`, applied
        // to the `normalizedName` axis. Closes the 233-row historical
        // drift surfaced by pdf-stem-drift DRY-RUN-001.
        // FINDINGS: `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`.
        it("strips trailing .pdf before alphanumeric collapse", () => {
            // Pre-pin: "hodusilverpdf"; historical-good + post-pin: "hodusilver".
            expect(
                recomputeIndexNameFields("Hodu (Silver).pdf", 2).normalizedName,
            ).toBe("hodusilver")
        })
        it("strips trailing .musicxml + preserves apostrophe collapse", () => {
            expect(
                recomputeIndexNameFields("V'Shamru.musicxml", 3).normalizedName,
            ).toBe("vshamru")
        })
        it("strips trailing .mp3 on multi-word title", () => {
            expect(
                recomputeIndexNameFields("Adon Olam.mp3", 1).normalizedName,
            ).toBe("adonolam")
        })
        it("strips trailing .wav and .m4a", () => {
            expect(recomputeIndexNameFields("foo.wav", 1).normalizedName).toBe(
                "foo",
            )
            expect(recomputeIndexNameFields("foo.m4a", 1).normalizedName).toBe(
                "foo",
            )
        })
        it("case-insensitive extension match (.PDF, .MusicXML)", () => {
            expect(recomputeIndexNameFields("Song.PDF", 1).normalizedName).toBe(
                "song",
            )
            expect(
                recomputeIndexNameFields("Song.MusicXML", 1).normalizedName,
            ).toBe("song")
        })
        it("strips ONE trailing extension only (no /g flag)", () => {
            // "song.pdf.pdf" → strip trailing .pdf → "song.pdf" → strip non-
            // alphanumerics → "songpdf". Semantic intent: only one extension
            // removed; the inner ".pdf" is data, not packaging.
            expect(
                recomputeIndexNameFields("song.pdf.pdf", 1).normalizedName,
            ).toBe("songpdf")
        })
        it("leaves unknown extensions (.txt, .doc, .gif) intact", () => {
            // Conservative whitelist — only the documented media extensions
            // strip. `.txt` etc. fold via the alphanumeric pass.
            expect(
                recomputeIndexNameFields("notes.txt", 1).normalizedName,
            ).toBe("notestxt")
            expect(recomputeIndexNameFields("art.gif", 1).normalizedName).toBe(
                "artgif",
            )
        })
        it("leaves no-extension titles unchanged", () => {
            expect(recomputeIndexNameFields("Hashkivenu", 1).normalizedName).toBe(
                "hashkivenu",
            )
            expect(
                recomputeIndexNameFields("Hashkivenu (Klepper-Freelander)", 1)
                    .normalizedName,
            ).toBe("hashkivenuklepperfreelander")
        })
        it("strips extension AND collapses paren clarifier in one shot", () => {
            // "Eitz Chayim - Weisenberg.pdf" → strip .pdf → "Eitz Chayim - Weisenberg"
            // → lowercase + strip non-alphanumerics → "eitzchayimweisenberg".
            expect(
                recomputeIndexNameFields(
                    "Eitz Chayim - Weisenberg.pdf",
                    1,
                ).normalizedName,
            ).toBe("eitzchayimweisenberg")
        })
        it("regression: historical-good shapes from FINDINGS sample", () => {
            // Pinned from `.paul/research/recompute-helper-normalizedname-drift/FINDINGS.md`
            // §"Sample mismatches" — the stored values represent the
            // historical-correct shape we're restoring algorithmic parity with.
            expect(
                recomputeIndexNameFields(
                    "T'Filat Haderech (Friedman).pdf",
                    1,
                ).normalizedName,
            ).toBe("tfilathaderechfriedman")
            expect(
                recomputeIndexNameFields(
                    "V'Nomar L'Fanav (Chassidic Folk).pdf",
                    1,
                ).normalizedName,
            ).toBe("vnomarlfanavchassidicfolk")
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

    describe("PCU parity (byte-for-byte vs library-upload.ts inline compute)", () => {
        // This is the regression guard the dispatch calls out: the helper
        // must produce IDENTICAL field values to PCU's inline compute, or
        // the F-7 fix has silently drifted from the canonical write path.
        function pcuInline(title: string, siblingsInCatalog: number) {
            // Verbatim copy of PCU's compute at library-upload.ts (post
            // 2026-05-25 normalizedname-pin: ext-strip BEFORE alphanumeric
            // collapse). If PCU's inline shape changes, mirror it here +
            // run this test.
            const nameLower = title.toLowerCase()
            const normalizedName = nameLower
                .replace(STRIPPABLE_EXTENSION_RE, "")
                .replace(/[^a-z0-9]/g, "")
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
            // β — ext-strip parity coverage (2026-05-25 normalizedname-pin).
            // Locks in the post-α PCU-vs-helper contract on ext-bearing
            // titles; pre-α the helper and PCU diverged silently because
            // no fixture exercised the path.
            ["Hodu (Silver).pdf", 2],
            ["T'Filat Haderech (Friedman).pdf", 1],
            ["V'Shamru.musicxml", 3],
            ["Adon Olam.mp3", 1],
            ["song.PDF", 1],
            ["song.pdf.pdf", 1],
            ["Eitz Chayim - Weisenberg.pdf", 1],
            ["notes.txt", 1],
            ["foo.wav", 1],
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
