import { describe, it, expect } from "vitest"
import {
    confirmedBindings,
    confirmedBindingBooks,
    confirmedUnbound,
    bindsToName,
} from "../confirmed"
import { confirmedBindingProblems, foldLiturgyName, liturgyLookup } from "../lookup"
import { matchLiturgyTitle } from "../match"

/**
 * Daniel ruled on every spelling on the "Liturgy Bindings" page, 2026-09-15.
 *
 * The property under test is the only one that matters: the page he ruled is
 * the page a row gets. Not "the matcher scores well" — the actual number, for
 * every spelling, in both booklets. These 130 assertions are cheap and they
 * are the difference between a ruling and a wish.
 */

describe("confirmed bindings", () => {
    it("places every confirmed spelling somewhere", () => {
        expect(confirmedBindingProblems()).toEqual([])
    })

    for (const book of confirmedBindingBooks()) {
        describe(book, () => {
            for (const c of confirmedBindings(book)) {
                for (const spelling of c.spellings) {
                    it(`binds ${JSON.stringify(spelling)} to ${c.bindsTo} p.${c.folio}`, () => {
                        const m = matchLiturgyTitle(book, spelling)
                        expect(m.clear, `no clear match for ${spelling}`).toBeTruthy()
                        expect(m.clear?.entry.folio).toBe(c.folio)
                    })
                }
            }

            it("refuses every spelling ruled unbound", () => {
                const unbound = confirmedUnbound(book)
                expect(unbound.size).toBeGreaterThan(0)
                for (const folded of unbound) {
                    const m = matchLiturgyTitle(book, folded)
                    expect(m.clear, `${folded} bound anyway`).toBeNull()
                    expect(m.plausible, `${folded} offered candidates`).toEqual([])
                }
            })
        })
    }
})

describe("the rulings behind the rulings", () => {
    it("reads Adonai S'fatai as the moment and Sanctuary as its setting", () => {
        // The booklets print the Amidah's opening line under the name of the
        // setting CRC sings it to. Daniel: the moment is Adonai S'fatai.
        for (const [book, folio] of [
            ["crc-friday", 23],
            ["crc-saturday", 70],
        ] as const) {
            for (const spelling of ["Adonai S'fatai", "Sanctuary", "Adonai Sifatai"]) {
                const m = matchLiturgyTitle(book, spelling)
                expect(m.clear?.entry.folio, `${book} / ${spelling}`).toBe(folio)
            }
            expect(matchLiturgyTitle(book, "Sanctuary").clear?.entry.label).toBe(
                "Adonai S'fatai",
            )
        }
    })

    it("sends Saturday's Closing Blessing to the CONCLUDING Birkat Kohanim", () => {
        // Not the page-less one inside the Amidah, which is the entry the name
        // used to reach and the reason the ruling was issued.
        const m = matchLiturgyTitle("crc-saturday", "Closing Blessing")
        expect(m.clear?.entry.folio).toBe(100)
    })

    it("leaves Friday's Closing Blessing on the Priestly Blessing it always meant", () => {
        // Daniel ruled Saturday only; Friday prints one closing blessing and
        // the exclusivity rule must not reach across books to touch it.
        expect(matchLiturgyTitle("crc-friday", "Closing Blessing").clear?.entry.folio).toBe(45)
    })

    it("does not re-derive Mi Chamocha from a title he left unbound", () => {
        // `Mi Chamocha Ana B'Koach.pdf` stems to `Mi Chamocha Ana B'Koach`, and
        // a keen matcher would find Mi Chamocha inside it. He said no.
        const m = matchLiturgyTitle("crc-friday", "Mi Chamocha Ana B'Koach.pdf")
        expect(m.clear).toBeNull()
        expect(m.plausible).toEqual([])
        // The plain spelling is untouched by the refusal.
        expect(matchLiturgyTitle("crc-friday", "Mi Chamocha").clear?.entry.folio).toBe(18)
    })

    it("keeps a confirmed spelling out of every other entry in its book", () => {
        const folded = foldLiturgyName("Closing Blessing")
        const carriers = liturgyLookup("crc-saturday").filter((e) =>
            e.aliases.some((a) => foldLiturgyName(a) === folded),
        )
        expect(carriers).toHaveLength(1)
        expect(carriers[0].folio).toBe(100)
    })

    it("binds the two Ma tovu spellings to the two different moments", () => {
        // `Ma tovu / Hinei ma tov` is Mah Tovu p.52; the trad chart of the same
        // pair is Hineh Mah Tov p.53. One character of difference between the
        // spellings, one page of difference between the rulings.
        expect(
            matchLiturgyTitle("crc-saturday", "Ma tovu / Hinei ma tov ").clear?.entry.folio,
        ).toBe(52)
        expect(
            matchLiturgyTitle("crc-saturday", "Ma tovu_Hinei ma tov - trad").clear?.entry
                .folio,
        ).toBe(53)
    })

    it("keeps the confirmation a fact about a NAME, not about a row", () => {
        // Every consumer of the lookup sees it — including the matcher that
        // fires when Daniel types a brand new row with no proposal in sight.
        expect(matchLiturgyTitle("crc-saturday", "hallelujah jam").clear?.entry.folio).toBe(56)
        expect(matchLiturgyTitle("crc-saturday", "HALLELUJAH JAM").clear?.entry.folio).toBe(56)
    })

    it("names the moment, not the gloss", () => {
        expect(bindsToName("Adonai S'fatai (Amidah opening; booklet entry 'Sanctuary')")).toBe(
            "Adonai S'fatai",
        )
        expect(bindsToName("Mi Shebeirach — Healing")).toBe("Mi Shebeirach — Healing")
    })
})
