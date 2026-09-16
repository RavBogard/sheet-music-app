import { describe, it, expect } from "vitest"
import { liturgyLookup, liturgyLookupScopes } from "../lookup"
import { matchLiturgyTitle } from "../match"
import { foldLiturgyName } from "../fold"

/**
 * R11-a — CASE AND APOSTROPHE ARE FOLDED BEFORE OWNERSHIP IS DECIDED.
 *
 * The occasion is "Prayer for Peace", which the Saturday booklet prints on two
 * pages: as a name for Oseh Shalom (p.82) and as a name for Prayer for Shalom
 * (p.90), spelled with a capital F on one and a lower-case f on the other.
 * Daniel ruled 2026-09-16 that a lookup meeting that spelling answers
 * PLAUSIBLE — two candidates, the author picks — and never `clear`.
 *
 * Compared byte for byte, the two spellings are two different names and each
 * one binds cleanly to its own page: a silent wrong page, twice. Folded, they
 * are one name wanted by two entries, and the ambiguity rule in `match` drops
 * both to plausible. So the fold is not a convenience here; it is what makes
 * the ruling reachable at all.
 *
 * WHAT THIS DOES NOT ASSERT. That the spelling is plausible in EVERY book.
 * `crc-friday` and `crc-rh-morning` print only one of the two moments, so
 * there is nothing there to be ambiguous about and the name binds clear at
 * 100. Refusing a correct bind because another book prints two would be a
 * different ruling, and Daniel has not made it.
 */
describe("R11-a: the lookup folds case and apostrophes before deciding ownership", () => {
    const SATURDAY_SPELLINGS = ["Prayer for Peace", "Prayer For Peace", "PRAYER FOR PEACE"]

    it.each(SATURDAY_SPELLINGS)(
        "'%s' answers plausible with two candidates in crc-saturday, never clear",
        (spelling) => {
            const r = matchLiturgyTitle("crc-saturday", spelling, null)
            expect(r.clear).toBeNull()
            expect(r.plausible).toHaveLength(2)
            expect(r.plausible.map((m) => m.entry.folio).sort((a, b) => Number(a) - Number(b))).toEqual([82, 90])
            for (const m of r.plausible) expect(m.score).toBe(100)
        },
    )

    it("every spelling of it reaches the same two candidates", () => {
        const shape = (s: string) =>
            matchLiturgyTitle("crc-saturday", s, null).plausible.map((m) => `${m.entry.label}@${m.entry.folio}`)
        const first = shape(SATURDAY_SPELLINGS[0])
        for (const s of SATURDAY_SPELLINGS.slice(1)) expect(shape(s)).toEqual(first)
    })

    it("apostrophe variants of one name are one name", () => {
        const shape = (s: string) => {
            const r = matchLiturgyTitle("crc-friday", s, null)
            return r.clear ? `${r.clear.entry.label}@${r.clear.entry.folio}` : "none"
        }
        expect(shape("Bar'chu")).toBe(shape("Bar’chu"))
        expect(shape("Bar'chu")).toBe(shape("Barchu"))
        expect(shape("Bar'chu")).not.toBe("none")
    })

    it("no entry in any table claims a folded spelling twice", () => {
        for (const { book, service } of liturgyLookupScopes()) {
            for (const e of liturgyLookup(book, service)) {
                const folded = e.aliases.map(foldLiturgyName)
                expect(new Set(folded).size, `${book}${service ? "|" + service : ""} ${e.label}`).toBe(
                    folded.length,
                )
            }
        }
    })

    it("a folded spelling two entries want on different pages never binds clear", () => {
        for (const { book, service } of liturgyLookupScopes()) {
            const table = liturgyLookup(book, service)
            const owners = new Map<string, Set<number | undefined>>()
            for (const e of table) {
                for (const a of e.aliases) {
                    const f = foldLiturgyName(a)
                    if (!owners.has(f)) owners.set(f, new Set())
                    owners.get(f)?.add(e.folio)
                }
            }
            for (const [folded, pages] of owners) {
                if (pages.size < 2) continue
                const r = matchLiturgyTitle(book, folded, service)
                expect(r.clear, `${book}${service ? "|" + service : ""} "${folded}"`).toBeNull()
            }
        }
    })
})
