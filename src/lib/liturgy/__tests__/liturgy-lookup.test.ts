import { describe, it, expect } from "vitest"
import {
    foldLiturgyName,
    liturgyLookup,
    liturgyLookupBooks,
    unresolvedSettings,
} from "../lookup"
import {
    CLEAR_SCORE,
    PLAUSIBLE_SCORE,
    matchLiturgyTitle,
} from "../match"

/**
 * A-W3' — the liturgy lookup table and its matcher.
 *
 * The thing under test is a page number that will print on a lectern sheet, so
 * the cases that matter most here are the ones where the table REFUSES to
 * answer: the false friends the 2026-09-15 sitting caught by hand, the
 * near-homonyms one letter apart, and the ties that a confident-sounding guess
 * would resolve the wrong way.
 */

describe("foldLiturgyName", () => {
    it("folds every apostrophe the congregation writes", () => {
        const forms = ["Bar’chu", "Bar'chu", "Barchu", "BARCHU", "Bar`chu"]
        expect(new Set(forms.map(foldLiturgyName)).size).toBe(1)
    })

    it("keeps distinct names distinct", () => {
        expect(foldLiturgyName("Kedushah")).not.toBe(foldLiturgyName("K'dushat HaYom"))
    })
})

describe("the lookup table", () => {
    it("covers the four confirmed books", () => {
        expect(liturgyLookupBooks().sort()).toEqual([
            "crc-friday",
            "crc-saturday",
            "shabbat-maariv",
            "shabbat-shacharit",
        ])
    })

    it("carries unit-id identity on a LEGACY book, from the paired draft", () => {
        // Ruling 8: the booklet governs the page, the draft feed governs
        // identity. A crc-friday entry must have both.
        const barchu = liturgyLookup("crc-friday").find(
            (e) => e.label === "Bar’chu",
        )
        expect(barchu?.folio).toBe(10)
        expect(barchu?.unitId).toBe("shma.barchu@shabbat-maariv")
    })

    it("keeps a moment the booklet does not print, page-less", () => {
        const kaddishShalem = liturgyLookup("crc-friday").find(
            (e) => e.label === "Kaddish Shalem",
        )
        expect(kaddishShalem).toBeDefined()
        expect(kaddishShalem?.folio).toBeUndefined()
    })

    it("folds the booklet's own name in as an alias, not a correction", () => {
        // The sitting recorded that crc-friday prints "Kriyat Sh'ma" where
        // Daniel writes "The Sh'ma". Both must resolve to p.15.
        const shma = liturgyLookup("crc-friday").find((e) => e.label === "The Sh’ma")
        expect(shma?.aliases.map(foldLiturgyName)).toContain(foldLiturgyName("Kriyat Sh'ma"))
        expect(shma?.folio).toBe(15)
    })

    it("binds a named setting to the moment it sets, never as its own row", () => {
        const vahavta = liturgyLookup("crc-friday").find(
            (e) => e.label === "V’ahavta & Tzitzit",
        )
        expect(vahavta?.aliases.map(foldLiturgyName)).toContain(
            foldLiturgyName("Thou Shalt Love"),
        )
        const aleinu = liturgyLookup("crc-friday").find((e) => e.label === "Aleinu")
        expect(aleinu?.aliases.map(foldLiturgyName)).toContain(
            foldLiturgyName("Bayom Hahu"),
        )
    })

    it("keeps a booklet entry no confirmed row claimed, as identity only", () => {
        const hatikvah = liturgyLookup("crc-friday").find(
            (e) => e.label === "Hatikvah",
        )
        expect(hatikvah?.source).toBe("pagemap")
        expect(hatikvah?.folio).toBe(37)
    })

    it("reports a setting whose target it could not resolve", () => {
        // Not an assertion that the list is empty — it is not. "Sanctuary" is
        // ruled a setting of Adonai S'fatai, which no confirmed row names, and
        // saying so out loud is the point of the function.
        const labels = unresolvedSettings().map((s) => s.label)
        expect(labels).toContain("Sanctuary")
    })
})

describe("matchLiturgyTitle — what it binds", () => {
    it("binds an exact spelling, however it is punctuated", () => {
        for (const title of ["Bar'chu", "Bar’chu", "barchu", "Call to Prayer"]) {
            const m = matchLiturgyTitle("crc-friday", title)
            expect(m.clear?.entry.folio, title).toBe(10)
        }
    })

    it("binds a near spelling", () => {
        const m = matchLiturgyTitle("crc-friday", "Hashkiveinu")
        expect(m.clear?.entry.label).toBe("Hashkivenu")
        expect(m.clear!.score).toBeGreaterThanOrEqual(CLEAR_SCORE)
    })

    it("resolves the same moment to a DIFFERENT page in a different book", () => {
        expect(matchLiturgyTitle("crc-friday", "Mi Chamocha").clear?.entry.folio).toBe(18)
        expect(matchLiturgyTitle("crc-saturday", "Mi Chamocha").clear?.entry.folio).toBe(68)
    })
})

describe("matchLiturgyTitle — what it refuses", () => {
    it("refuses the false friends the sitting caught by hand", () => {
        // "Nishmat Kol Chai" and the Torah-procession Sh'ma were both matched
        // to Kriyat Sh'ma by an earlier pass, and both were wrong.
        const nishmat = matchLiturgyTitle("crc-saturday", "Nishmat")
        expect(nishmat.clear).toBeNull()

        // Two entries spelled Sh'ma on two different pages: p.63 in the Sh'ma
        // block, p.83 in the Torah procession. Neither may win silently.
        const shma = matchLiturgyTitle("crc-saturday", "Sh'ma")
        expect(shma.clear).toBeNull()
        expect(shma.plausible.map((p) => p.entry.folio)).toEqual(
            expect.arrayContaining([63, 83]),
        )
    })

    it("never lets a word-run alone reach the clear band", () => {
        const m = matchLiturgyTitle("crc-friday", "Mi Shebeirach")
        // It is contained in "Mi Shebeirach — Healing" and that is real
        // evidence, but a containment hit is shown, never written.
        const hit = m.clear ?? m.plausible[0]
        expect(hit?.entry.label).toBe("Mi Shebeirach — Healing")
    })

    it("refuses a short near-homonym, which is a different moment", () => {
        // `shem` is one edit from `Shema`, which is four fifths of the string
        // and clears the 80 line on arithmetic alone. It is not the Sh'ma.
        expect(matchLiturgyTitle("crc-friday", "shem").clear).toBeNull()
        expect(matchLiturgyTitle("crc-friday", "a").clear).toBeNull()
        expect(matchLiturgyTitle("crc-friday", "   ").plausible).toEqual([])
    })

    it("returns nothing for a book with no table, rather than a default", () => {
        expect(matchLiturgyTitle("crc-machzor-2008", "Bar'chu")).toEqual({
            clear: null,
            plausible: [],
        })
    })

    it("refuses a compound title whose halves name two different moments", () => {
        const m = matchLiturgyTitle("crc-saturday", "Adon Olam / Ein Keloheinu")
        expect(m.clear).toBeNull()
        expect(m.plausible.map((p) => p.entry.label)).toEqual(
            expect.arrayContaining(["Adon Olam", "Ein Keloheinu"]),
        )
    })

    it("binds a compound title whose halves agree", () => {
        const m = matchLiturgyTitle("crc-friday", "Aleinu / Adoration")
        expect(m.clear?.entry.label).toBe("Aleinu")
    })

    it("keeps every plausible score inside its band", () => {
        const m = matchLiturgyTitle("crc-saturday", "Sh'ma")
        for (const p of m.plausible) {
            expect(p.score).toBeGreaterThanOrEqual(PLAUSIBLE_SCORE)
        }
    })
})
