import { describe, expect, it } from "vitest"

import {
    DEDUPE_STRIPPABLE_EXTENSION_RE,
    dedupeNormalize,
} from "../tools/library"
import { STRIPPABLE_EXTENSION_RE } from "@/lib/mcp/title-specificity"

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
        it("covers every CHART token", () => {
            for (const ext of [
                "pdf",
                "musicxml",
                "xml",
                "mxl",
                "jpg",
                "png",
                "webp",
            ]) {
                expect(dedupeNormalize(`Hodu (Silver).${ext}`)).toBe(
                    "hodu silver",
                )
            }
        })

        it("does NOT strip audio — a recording is not a duplicate of a chart", () => {
            // The fail branch this pins is one W1 briefly shipped: with audio
            // in the set, `Adon Olam.mp3` and `Adon Olam` shared a key, the
            // canonical picker kept the RECORDING (earliest uploadedAt, not a
            // Google-Apps mime) and two real charts would have been marked
            // `duplicate` on a force-run. Live-measured: 5 mixed groups, 3 of
            // them audio-wins. With audio excluded: 0.
            for (const ext of ["mp3", "m4a", "wav"]) {
                expect(dedupeNormalize(`Adon Olam.${ext}`)).not.toBe(
                    dedupeNormalize("Adon Olam"),
                )
            }
            expect(dedupeNormalize("Adon Olam.mp3")).toBe("adon olammp3")
        })

        it("keeps the four real audio/chart pairs apart", () => {
            for (const [audio, chart] of [
                ["Adon Olam.mp3", "Adon Olam"],
                ["Mizmor Shiru L'adonai .mp3", "Mizmor Shiru Ladonai.pdf"],
                ["Sim Shalom.mp3", "Sim_shalom.pdf"],
                ["Veshamru .mp3", "Veshamru.pdf"],
            ]) {
                expect(dedupeNormalize(audio)).not.toBe(dedupeNormalize(chart))
            }
        })

        it("is exactly the shared pinned set MINUS the audio tokens", () => {
            // Pins the divergence so a token added to the shared set cannot
            // quietly change what dedupe treats as packaging.
            const tokens = (re: RegExp) => {
                const m = /\(([^)]+)\)/.exec(re.source)
                if (!m) throw new Error(`unexpected shape: ${re.source}`)
                return m[1].split("|").sort()
            }
            const shared = tokens(STRIPPABLE_EXTENSION_RE)
            const dedupe = tokens(DEDUPE_STRIPPABLE_EXTENSION_RE)
            const audio = ["m4a", "mp3", "wav"]
            expect(shared.filter((t) => !audio.includes(t))).toEqual(dedupe)
            expect(shared.filter((t) => !dedupe.includes(t))).toEqual(audio)
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
