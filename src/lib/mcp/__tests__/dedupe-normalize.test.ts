import { describe, expect, it } from "vitest"

import { dedupeNormalize } from "../tools/library"

/**
 * C10I2-001 (cowork cycle-10 Instance-2, HIGH) — `dedupeNormalize` is the
 * exact-grouping key for `dedupe_library`. Pre-fix it stripped to ASCII
 * (`[^a-z0-9 ]`), erasing every Hebrew/Arabic/CJK letter, so two distinct
 * native-script titles sharing a Latin substring collapsed to the same key
 * and one was falsely marked `status: "duplicate"`.
 *
 * These lock the post-fix contract: Unicode letters/numbers survive
 * (`\p{L}\p{N}`), accent-folding and the all-Latin catalog behavior are
 * unchanged, and emoji/punctuation-only titles still normalize to "" so the
 * caller's empty-key guard excludes them from grouping.
 */
describe("dedupeNormalize — Unicode script preservation (C10I2-001)", () => {
    it("keeps distinct Hebrew titles distinct (the reproduced collision)", () => {
        // Pre-fix BOTH collapsed to "c10" → false duplicate group.
        expect(dedupeNormalize("c10 אדון עולם")).not.toBe(
            dedupeNormalize("c10 אבינו מלכנו"),
        )
        expect(dedupeNormalize("c10 אדון עולם")).toBe("c10 אדון עולם")
    })

    it("keeps distinct Arabic titles distinct (pre-fix both erased to '')", () => {
        expect(dedupeNormalize("أمزينج جريس")).not.toBe(
            dedupeNormalize("أغنية أخرى"),
        )
        expect(dedupeNormalize("أمزينج جريس")).not.toBe("")
    })

    it("still folds accents — Café and Cafe dedupe (NFKD + combining strip)", () => {
        expect(dedupeNormalize("Café")).toBe("cafe")
        expect(dedupeNormalize("Café")).toBe(dedupeNormalize("Cafe"))
    })

    it("leaves the all-Latin catalog key byte-identical", () => {
        // Separator collapse + lowercase preserved exactly as before.
        // L1-W1: the trailing `.pdf` is now STRIPPED (shared
        // STRIPPABLE_EXTENSION_RE) - this fixture asserted `koachpdf` before
        // the wave and is updated deliberately, not incidentally. The
        // separator collapse it exists to pin (`B_Koach` -> `b koach`, and
        // the leading-space variant) is unchanged.
        expect(dedupeNormalize("Ana B_Koach.pdf")).toBe("ana b koach")
        expect(dedupeNormalize(" Ana B_Koach.pdf")).toBe("ana b koach")
        expect(dedupeNormalize("Oseh shalom (camp)")).toBe("oseh shalom camp")
    })

    it("normalizes emoji/punctuation-only titles to '' (empty-key guard skips them)", () => {
        expect(dedupeNormalize("🎵🎶")).toBe("")
        expect(dedupeNormalize("!!! ??? ---")).toBe("")
    })

    it("preserves digits across scripts and mixed Latin+native", () => {
        expect(dedupeNormalize("Niggun 2")).toBe("niggun 2")
        expect(dedupeNormalize("שיר 7")).toBe("שיר 7")
    })
})
