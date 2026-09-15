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
import machzor from "../../../data/books/crc-machzor-2008.json"

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
    it("covers the four confirmed books, and the machzor per service", () => {
        expect(liturgyLookupBooks().sort()).toEqual([
            "crc-friday",
            "crc-machzor-2008",
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
        // "Sanctuary" used to be the standing example: ruled a setting of
        // Adonai S'fatai, which no confirmed row named. Daniel's binding
        // rulings of 2026-09-15 supplied the moment — the booklet prints it
        // under the setting's own name — so the list is empty now, and an
        // entry appearing in it again means a spelling of his will not bind.
        expect(unresolvedSettings()).toEqual([])
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
        // `shirei-tshuvah` is a released FEED volume with no confirmed-rows
        // file and no pagemap, so it has no table of this kind at all.
        expect(matchLiturgyTitle("shirei-tshuvah", "Bar'chu")).toEqual({
            clear: null,
            plausible: [],
        })
    })

    it("resolves a machzor name inside its own service and nowhere else", () => {
        // The reason five of this volume's six services went unmapped: the
        // 2008 machzor prints Bar'chu four times. Scoped, each service has
        // exactly one, and the answer is never a guess between them.
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Bar'chu", "crc-rh-morning").clear
                ?.entry.folio,
        ).toBe(45)
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Bar'chu", "crc-kol-nidre").clear
                ?.entry.folio,
        ).toBe(100)
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Bar'chu", "crc-yk-morning").clear
                ?.entry.folio,
        ).toBe(136)
        // Unscoped keeps the answer this book gave for its whole life.
        expect(matchLiturgyTitle("crc-machzor-2008", "Bar'chu").clear?.entry.folio).toBe(45)
        // A service the volume does not print has no table, not a fallback.
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Bar'chu", "crc-nonesuch").clear,
        ).toBeNull()
    })

    it("carries the unit id a machzor page was captured from", () => {
        const m = matchLiturgyTitle("crc-machzor-2008", "Kol Nidre", "crc-kol-nidre")
        expect(m.clear?.entry.folio).toBe(98)
        expect(m.clear?.entry.unitId).toBe("erev-yk.kol-nidre@crc-kol-nidre")
    })

    // R5-a and R5-d, ruled by Daniel on 2026-09-15 against the printed book.
    // Both are recorded in `scripts/emit-machzor-book.mjs` as RULINGS and reach
    // the data by regeneration, never by hand; these assertions are what says
    // the ruling survived the next regeneration.
    it("puts Un'taneh Tokef on p.147, where the book prints it (R5-a)", () => {
        // The capture files p.148's unit under this name — 148 is B'rosh
        // Hashanah. David typed 147 and the ruling agrees with him.
        const m = matchLiturgyTitle("crc-machzor-2008", "Un'taneh Tokef", "crc-yk-morning")
        expect(m.clear?.entry.folio).toBe(147)
        expect(m.clear?.entry.unitId).toBe("amidah.untaneh-tokef@crc-yk-morning")
    })

    it("puts Rosh Hashanah morning's Un'taneh Tokef on p.56, not 57 (R6-a)", () => {
        // The identical misfiling one service earlier: p.56 prints the title
        // bar "K'dushat Hayom" over U'nitaneh tokef, and p.57 prints B'rosh
        // Hashanah under no title at all. The curated names were verified
        // against the pages and so moved with them.
        const m = matchLiturgyTitle("crc-machzor-2008", "Un'taneh Tokef", "crc-rh-morning")
        expect(m.clear?.entry.folio).toBe(56)
        expect(m.clear?.entry.unitId).toBe("amidah.untaneh-tokef@crc-rh-morning")

        // The variant spelling has to follow it. Nothing mechanical moves this
        // one — "unetaneh" does not fold to "untaneh" — so if the ruling's
        // `also` list is ever dropped, it silently points at the empty page.
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Unetaneh Tokef", "crc-rh-morning").clear?.entry
                .folio,
        ).toBe(56)

        // And the title actually printed on 56 still finds 56.
        expect(
            matchLiturgyTitle("crc-machzor-2008", "K'dushat Hayom", "crc-rh-morning").clear?.entry
                .folio,
        ).toBe(56)
    })

    it("gives B'rosh Hashanah its own page in both services (R5-a, R6-a)", () => {
        // It was never its own unit before; it was the second half of whatever
        // Un'taneh Tokef was wearing. Both books now have it.
        const rh = matchLiturgyTitle("crc-machzor-2008", "B'rosh Hashanah", "crc-rh-morning")
        expect(rh.clear?.entry.folio).toBe(57)
        expect(rh.clear?.entry.unitId).toBe("amidah.brosh-hashanah@crc-rh-morning")

        const yk = matchLiturgyTitle("crc-machzor-2008", "B'rosh Hashanah", "crc-yk-morning")
        expect(yk.clear?.entry.folio).toBe(148)
        expect(yk.clear?.entry.unitId).toBe("amidah.brosh-hashanah@crc-yk-morning")
    })

    it("has retired K'dushat Hayom as a unit of its own in both services", () => {
        // The retirement is the permanent half of R5-a and R6-a. The NAME must
        // still resolve — it is printed on both pages — but no entry may carry
        // the retired unit id, or a row bound to it would look bound and join
        // to nothing.
        const ids = machzor.entries.map((e) => e.unitId)
        expect(ids).not.toContain("amidah.kdushat-hayom@crc-rh-morning")
        expect(ids).not.toContain("amidah.kdushat-hayom@crc-yk-morning")
        expect(
            matchLiturgyTitle("crc-machzor-2008", "K'dushat Hayom", "crc-yk-morning").clear?.entry
                .folio,
        ).toBe(147)
    })

    it("resolves Kol Nidre's Shehecheyanu to the first of the two (R5-d)", () => {
        // The volume really does print it at 97 and 99, and the feed gives both
        // units the same short name. Before the ruling this was two exact hits
        // and a refusal — correct, but it has an answer.
        const m = matchLiturgyTitle("crc-machzor-2008", "Shehecheyanu", "crc-kol-nidre")
        expect(m.clear?.entry.folio).toBe(97)
        expect(m.clear?.entry.unitId).toBe("erev-yk.erev-maariv-shehecheyanu@crc-kol-nidre")
        // The second one is still reachable, by its own full name.
        expect(
            matchLiturgyTitle("crc-machzor-2008", "Erev Maariv Shehecheyanu 2", "crc-kol-nidre")
                .clear?.entry.folio,
        ).toBe(99)
    })

    it("refuses a compound title whose halves name two different moments", () => {
        const m = matchLiturgyTitle("crc-saturday", "Adon Olam / Ein Keloheinu")
        expect(m.clear).toBeNull()
        expect(m.plausible.map((p) => p.entry.label)).toEqual(
            expect.arrayContaining(["Adon Olam", "Ein Keloheinu"]),
        )
    })

    it("sees through a chart file name to the moment", () => {
        // `.live` rows are very often named after the chart file. The
        // extension is packaging and the clarifier names an arrangement;
        // neither changes which page the congregation turns to.
        for (const [title, folio] of [
            ["Shema (major).pdf", 15],
            ["Barchu (walkdown)", 10],
            ["Mourner's Kaddish.musicxml", 41],
            ["Eitz Chayim - Weisenberg", undefined],
        ] as const) {
            const m = matchLiturgyTitle("crc-friday", title)
            if (folio === undefined) {
                expect(m.clear?.entry.folio, title).toBeUndefined()
            } else {
                expect(m.clear?.entry.folio, title).toBe(folio)
            }
        }
    })

    it("still refuses a file name that names two moments", () => {
        // It used to come back with Mi Chamocha among the candidates for
        // Daniel to judge. He judged it, on 2026-09-15, and said leave it
        // unbound — so the candidate is gone too. Offering it again would be
        // re-asking a question he has answered.
        const m = matchLiturgyTitle("crc-friday", "Mi Chamocha Ana B'Koach.pdf")
        expect(m.clear).toBeNull()
        expect(m.plausible).toEqual([])
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

describe("a near match has to be explainable word by word", () => {
    // The 2008 machzor prints the Torah reading on p.163 and the haftarah on
    // p.171. As strings, "Torah Reading" and "Haftorah Reading" are 81%
    // identical — over the clear line — so the matcher bound one to the other's
    // page. Levenshtein over a whole phrase cannot tell a misspelling from a
    // different word; taking the phrase apart can.
    it("refuses Torah for Haftorah, at eight pages' distance", () => {
        const m = matchLiturgyTitle("crc-machzor-2008", "Torah Reading", "crc-yk-morning")
        expect(m.clear?.entry.folio).not.toBe(171)
        // The volume prints two Torah readings and the row names neither, so
        // "nothing, here are the candidates" is the right answer.
        expect(m.plausible.map((p) => p.entry.folio).sort()).toEqual([163, 165])
    })

    it("still forgives a real misspelling", () => {
        expect(matchLiturgyTitle("crc-friday", "Barechu").clear?.entry.label).toBe("Bar’chu")
    })

    it("forgives one letter in a short Hebrew word", () => {
        // "Esa Einai" for "Esah Einai" — one h, and a flat percentage would
        // have called 75% of a four-letter word a different word.
        const m = matchLiturgyTitle("crc-machzor-2008", "Esa Einai", "crc-yizkor")
        expect(m.clear?.entry.folio).toBe(180)
    })

    it("treats the same words in another order as the same name", () => {
        // The feed calls it "Haftarah Blessing Before"; its own short name is
        // "Blessing Before the Haftarah Reading"; David writes "Blessing
        // Before Haftorah". Word order carries no meaning in a prayer's name.
        const m = matchLiturgyTitle(
            "crc-machzor-2008",
            "Blessing Before Haftorah",
            "crc-yk-morning",
        )
        expect(m.clear?.entry.folio).toBe(170)
        expect(m.clear?.how).toBe("permuted")
        expect(m.clear?.score).toBe(95)
    })

    it("does not call a single word a permutation of itself", () => {
        expect(matchLiturgyTitle("crc-friday", "Bar'chu").clear?.how).toBe("exact")
    })
})
