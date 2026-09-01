import { describe, expect, it } from "vitest"

import { dedupeNormalize } from "../tools/library"

/**
 * L1-W1 (R-0901-live-cw-1 §4) — `dedupe_library`'s exact pass could not see the
 * dominant duplication shape in this library: a Drive row named `X.pdf` beside
 * an upload row named `X`. The normalizer kept the extension, so the two names
 * produced two different keys and never grouped.
 *
 * R-0831-guards-2 asks for the fail branch to be SHOWN, not promised. So this
 * file pins BOTH sides:
 *
 *   `legacyDedupeNormalize` is the pre-wave implementation, copied verbatim
 *   (it is the shipped chain minus the STRIPPABLE_EXTENSION_RE line). Each
 *   pair below is asserted to NOT group under it and to group under the
 *   shipped one. If someone removes the extension strip, the second half of
 *   every case fails; if someone "fixes" the legacy copy, the first half does.
 *
 * The pairs are real rows read off the live catalog on 2026-09-01, taken from
 * the L0 census return's §B list rather than invented.
 */

/** The exact pre-L1-W1 chain. Do not "improve" it — it is a fixture. */
function legacyDedupeNormalize(s: string): string {
    return s
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[_\s\-]+/g, " ")
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .trim()
}

/** [name without extension, name with extension] — both live in prod. */
const LIVE_PAIRS: ReadonlyArray<readonly [string, string]> = [
    ["Achot ketana", "Achot ketana.pdf"],
    ["Dodi Li", "Dodi Li.pdf"],
    ["V'Shamru", "V'Shamru.pdf"],
    ["V'Shamru (Old Skool)", "V'Shamru (Old Skool).pdf"],
]

describe("dedupeNormalize — trailing extension strip (L1-W1)", () => {
    describe("the fail branch: the pre-wave normalizer does NOT group these", () => {
        it.each(LIVE_PAIRS)(
            "legacy keeps %j and %j in separate groups",
            (bare, withExt) => {
                expect(legacyDedupeNormalize(bare)).not.toBe(
                    legacyDedupeNormalize(withExt),
                )
            },
        )

        it("legacy welds the extension onto the stem (the actual defect)", () => {
            expect(legacyDedupeNormalize("Achot ketana.pdf")).toBe(
                "achot ketanapdf",
            )
        })
    })

    describe("the fix: the shipped normalizer groups them", () => {
        it.each(LIVE_PAIRS)("groups %j with %j", (bare, withExt) => {
            expect(dedupeNormalize(bare)).toBe(dedupeNormalize(withExt))
        })

        it("strips the extension without disturbing the stem", () => {
            expect(dedupeNormalize("Achot ketana.pdf")).toBe("achot ketana")
            expect(dedupeNormalize("V'Shamru (Old Skool).pdf")).toBe(
                "vshamru old skool",
            )
        })
    })

    describe("the strip stays narrow", () => {
        it("covers every token in the shared pinned set", () => {
            for (const ext of [
                "pdf",
                "musicxml",
                "xml",
                "mxl",
                "jpg",
                "png",
                "webp",
                "mp3",
                "m4a",
                "wav",
            ]) {
                expect(dedupeNormalize(`Hodu (Silver).${ext}`)).toBe(
                    "hodu silver",
                )
            }
        })

        it("is case-insensitive", () => {
            expect(dedupeNormalize("Dodi Li.PDF")).toBe(dedupeNormalize("Dodi Li"))
        })

        it("strips only the TRAILING extension, never mid-name", () => {
            // `.pdf` here is not trailing — the row is a different chart.
            expect(dedupeNormalize("Adon Olam.pdf (scan 2)")).toBe(
                "adon olampdf scan 2",
            )
        })

        it("does NOT strip .txt / .doc / .docx (absent from the pinned set)", () => {
            // Deliberate: 11 live rows carry a `.doc`/`.docx` name over genuinely
            // PDF bytes, so widening the set is a naming question for the desk,
            // not packaging. Pinned so a future widening is a conscious act.
            expect(dedupeNormalize("Lyrics.txt")).toBe("lyricstxt")
            expect(dedupeNormalize("Tangled Up In Blue.docx")).toBe(
                "tangled up in bluedocx",
            )
            expect(dedupeNormalize("Friend Of The Devil.doc")).toBe(
                "friend of the devildoc",
            )
        })

        it("leaves an extension-less name untouched", () => {
            expect(dedupeNormalize("Achot ketana")).toBe("achot ketana")
            expect(dedupeNormalize("Oseh shalom (camp)")).toBe("oseh shalom camp")
        })

        it("still normalizes a name that is ONLY an extension to a safe key", () => {
            // `.pdf` -> "" -> the caller's empty-key guard excludes it from
            // grouping, which is the safe outcome (never collapse these).
            expect(dedupeNormalize(".pdf")).toBe("")
        })
    })
})
