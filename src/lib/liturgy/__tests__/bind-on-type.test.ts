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

    it("carries the companion feed's unit when it prints on the same page", () => {
        // The legacy booklets are pagemaps with no units, but the legacy feed
        // numbers its units by the same printed pages. The draft id the
        // matcher reports is swapped for that feed's unit — never a draft id,
        // which the registry would refuse along with the page.
        const auto = autoBindLiturgyRef("crc-friday", "Bar'chu", "song")
        expect(auto.ref).toEqual({
            book: "crc-friday",
            unitId: "shma.barchu@legacy-shabbat-evening",
            folio: 10,
        })
        expect(auto.momentId).toBe("barchu")
    })

    it("keeps the page alone when no companion unit prints on it", () => {
        // Friday's Mi Chamocha is p.18; the moments artifact has no
        // legacy-evening unit for that moment, so nothing is guessed.
        const ref = autoBindLiturgyRef("crc-friday", "Mi Chamocha", "song").ref
        expect(ref).toEqual({ book: "crc-friday", folio: 18 })
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
        expect(autoBindLiturgyRef("shirei-tshuvah", "Mi Chamocha", "song").ref).toBeUndefined()
    })

    it("binds a machzor row against its own service, never another's", () => {
        // Without the service the four Bar'chus of this one printed volume are
        // one ambiguous name. `templateType` is what makes each service's
        // Bar'chu the only one there is.
        const kn = autoBindLiturgyRef("crc-machzor-2008", "Bar'chu", "prayer", "kol-nidre")
        expect(kn.ref).toEqual({
            book: "crc-machzor-2008",
            unitId: "emaariv.barchu@crc-kol-nidre",
            folio: 100,
        })
        expect(kn.momentId).toBe("barchu")

        const alt = autoBindLiturgyRef("crc-machzor-2008", "Bar'chu", "prayer", "kol-nidre-alt")
        expect(alt.ref?.folio).toBe(100)

        const yk = autoBindLiturgyRef("crc-machzor-2008", "Bar'chu", "prayer", "yom-kippur-morning")
        expect(yk.ref?.folio).toBe(136)

        const neilah = autoBindLiturgyRef("crc-machzor-2008", "Bar'chu", "prayer", "neilah")
        expect(neilah.ref).toBeUndefined()
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

    it("swaps a draft unit id for the companion unit on the same page", () => {
        expect(
            writableLiturgyRef("crc-friday", 10, "shma.barchu@shabbat-maariv"),
        ).toEqual({
            book: "crc-friday",
            unitId: "shma.barchu@legacy-shabbat-evening",
            folio: 10,
        })
    })

    it("keeps the page when the companion unit is on a different page", () => {
        // Bar'chu is Friday p.10. A row that says p.11 keeps p.11 and gets no
        // id: an id may never carry a row to another page.
        expect(
            writableLiturgyRef("crc-friday", 11, "shma.barchu@shabbat-maariv"),
        ).toEqual({ book: "crc-friday", folio: 11 })
        expect(
            writableLiturgyRef("crc-friday", 11, "shma.barchu@legacy-shabbat-evening"),
        ).toEqual({ book: "crc-friday", folio: 11 })
    })

    it("keeps the page when the unit id is no book's to hold", () => {
        expect(
            writableLiturgyRef("crc-saturday", 51, "shma.barchu@shabbat-maariv"),
        ).toEqual({ book: "crc-saturday", folio: 51 })
    })
})
