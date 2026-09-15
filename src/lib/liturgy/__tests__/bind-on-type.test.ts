import { describe, it, expect } from "vitest"
import { autoBindLiturgyRef, writableLiturgyRef } from "../bind-on-type"

/**
 * Bind on type (round 3, item 5).
 *
 * The behaviour being pinned is mostly about RESTRAINT. What it binds is the
 * matcher's business and is tested to death next door; what matters here is
 * everything it declines to do while someone is in the middle of typing.
 */

describe("autoBindLiturgyRef", () => {
    it("binds a confirmed spelling to its page", () => {
        expect(autoBindLiturgyRef("crc-friday", "Mi Chamocha", "song").ref).toEqual({
            book: "crc-friday",
            folio: 18,
        })
    })

    it("binds the same name to a different page in a different book", () => {
        expect(autoBindLiturgyRef("crc-saturday", "Mi Chamocha", "song").ref?.folio).toBe(68)
    })

    it("does not carry a unit id the book does not define", () => {
        // The legacy booklets are pagemaps with no units. The identity is real
        // and is still reported by the matcher; the REF keeps the page alone,
        // or the registry would refuse the whole thing and the row would end
        // up with no page at all.
        const ref = autoBindLiturgyRef("crc-friday", "Bar'chu", "song").ref
        expect(ref).toEqual({ book: "crc-friday", folio: 10 })
        expect(ref).not.toHaveProperty("unitId")
    })

    it("binds nothing for a row type that cannot name a moment", () => {
        for (const type of ["header", "section", "note"]) {
            expect(autoBindLiturgyRef("crc-friday", "Mi Chamocha", type).ref, type).toBeUndefined()
        }
    })

    it("binds nothing without a book, a title, or a lookup table", () => {
        expect(autoBindLiturgyRef(null, "Mi Chamocha", "song").ref).toBeUndefined()
        expect(autoBindLiturgyRef("crc-friday", "   ", "song").ref).toBeUndefined()
        expect(autoBindLiturgyRef("crc-machzor-2008", "Mi Chamocha", "song").ref).toBeUndefined()
    })

    it("reports candidates and writes nothing when the name is ambiguous", () => {
        // Saturday prints a Sh'ma in the Sh'ma and its blessings at p.63 and
        // another in the Torah procession at p.83. Both are exact; that is
        // ambiguity, not confidence, and the row waits for a human.
        const out = autoBindLiturgyRef("crc-saturday", "Sh'ma", "song")
        expect(out.ref).toBeUndefined()
        const pages = out.suggestions.map((s) => s.folio)
        expect(pages).toContain(63)
        expect(pages).toContain(83)
    })

    it("says nothing at all for a title that names nothing", () => {
        const out = autoBindLiturgyRef("crc-friday", "Wagon Wheel", "song")
        expect(out.ref).toBeUndefined()
        expect(out.suggestions).toEqual([])
    })

    it("stays silent on a moment the booklet does not print", () => {
        // A clear identity with no page is not a failure and not a question —
        // the row is correctly identified and correctly page-less.
        const out = autoBindLiturgyRef("crc-saturday", "K'dushat HaYom", "prayer")
        expect(out.ref).toBeUndefined()
    })

    it("honours a spelling Daniel ruled unbound", () => {
        expect(
            autoBindLiturgyRef("crc-friday", "Od Yavo Shalom Aleinu", "song"),
        ).toEqual({ suggestions: [] })
    })
})

describe("writableLiturgyRef", () => {
    it("refuses a page the book does not have", () => {
        expect(writableLiturgyRef("crc-friday", 9999)).toBeNull()
        expect(writableLiturgyRef("crc-friday", null)).toBeNull()
        expect(writableLiturgyRef("no-such-book", 10)).toBeNull()
    })

    it("keeps the page when the unit id is not the book's to hold", () => {
        expect(
            writableLiturgyRef("crc-friday", 10, "shma.barchu@shabbat-maariv"),
        ).toEqual({ book: "crc-friday", folio: 10 })
    })
})
