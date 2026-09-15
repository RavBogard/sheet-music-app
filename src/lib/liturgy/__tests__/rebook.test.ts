import { describe, it, expect } from "vitest"
import { rebookLiturgyRef, rebookRows } from "../rebook"

/**
 * A-W4' — what happens to the pages when the service changes book.
 *
 * The whole point is what this refuses to do. It never blanks a page and never
 * invents one: a row it cannot resolve keeps the number it had and is marked
 * stale, because "this page is about the other book" is honest and a plausible
 * wrong number on a lectern sheet is not.
 */

describe("rebookLiturgyRef", () => {
    it("follows the same unit id into the other book", () => {
        // The nine shared `@shabbat-maariv` ids in the Shabbat-morning draft
        // are intentional sharing (RULINGS 2026-09-15), and this is the case
        // they exist for.
        const out = rebookLiturgyRef(
            { book: "shabbat-maariv", unitId: "amidah.avot-vimahot@shabbat-maariv", folio: 35 },
            "shabbat-shacharit",
            "Avot v'Imahot",
        )
        expect(out.status).toBe("resolved")
        if (out.status !== "resolved") return
        expect(out.how).toBe("unit-id")
        expect(out.ref.unitId).toBe("amidah.avot-vimahot@shabbat-maariv")
        expect(out.ref.book).toBe("shabbat-shacharit")
    })

    it("follows the MOMENT when the unit id is book-local", () => {
        // Mi Chamocha is a different unit in each book. Only moments.json
        // knows they are the same prayer — this is what Part E was for.
        const out = rebookLiturgyRef(
            { book: "shabbat-maariv", unitId: "shma.mi-chamocha@shabbat-maariv", folio: 29 },
            "shirei-tshuvah",
            "Mi Chamocha",
        )
        expect(out.status).toBe("resolved")
        if (out.status !== "resolved") return
        expect(out.how).toBe("moment")
        expect(out.ref.book).toBe("shirei-tshuvah")
        expect(out.ref.folio).not.toBe(29)
    })

    it("falls back to the row's own name for a book with no unit ids", () => {
        // A legacy booklet is a pagemap: no unit ids at all, so identity has
        // to come from what the row is called.
        const out = rebookLiturgyRef(
            { book: "shabbat-maariv", unitId: "shma.barchu@shabbat-maariv", folio: 22 },
            "crc-friday",
            "Bar'chu",
        )
        expect(out.status).toBe("resolved")
        if (out.status !== "resolved") return
        expect(out.how).toBe("title")
        expect(out.ref).toEqual({ book: "crc-friday", folio: 10 })
    })

    it("keeps the old page, never blanks it, when nothing resolves", () => {
        const before = { book: "crc-friday", folio: 31 }
        const out = rebookLiturgyRef(before, "crc-saturday", "Zog Nit Keynmol")
        expect(out.status).toBe("stale")
        expect(out.ref).toEqual(before)
    })

    it("never resolves on a merely plausible name match", () => {
        // "Shalom" is three different pages in crc-friday. A book switch is
        // exactly the moment a confident guess would go unnoticed.
        const out = rebookLiturgyRef(
            { book: "crc-saturday", folio: 79 },
            "crc-friday",
            "Shalom",
        )
        expect(out.status).toBe("stale")
        expect(out.ref).toEqual({ book: "crc-saturday", folio: 79 })
    })

    it("is a no-op when the book has not actually changed", () => {
        const ref = { book: "crc-friday", folio: 10 }
        const out = rebookLiturgyRef(ref, "crc-friday", "Bar'chu")
        expect(out.status).toBe("resolved")
        if (out.status === "resolved") expect(out.ref).toBe(ref)
    })
})

describe("rebookRows", () => {
    const rows = [
        { id: "a", title: "Bar'chu", liturgyRef: { book: "shabbat-maariv", unitId: "shma.barchu@shabbat-maariv", folio: 22 } },
        { id: "b", title: "Mi Chamocha", liturgyRef: { book: "shabbat-maariv", unitId: "shma.mi-chamocha@shabbat-maariv", folio: 29 } },
        { id: "c", title: "Zog Nit Keynmol", liturgyRef: { book: "shabbat-maariv", folio: 40 } },
        { id: "d", title: "Gather Us In", liturgyRef: null },
        { id: "e", title: "A header", liturgyRef: undefined },
    ]

    it("moves what it can and reports what it cannot, touching nothing else", () => {
        const out = rebookRows(rows, "crc-friday")
        expect(out.resolved.map((r) => r.rowId).sort()).toEqual(["a", "b"])
        expect(out.unresolved.map((r) => r.rowId)).toEqual(["c"])
        // Rows with no page at all are not in the plan in any form.
        expect(out.writes.map((w) => w.rowId).sort()).toEqual(["a", "b", "c"])
    })

    it("marks exactly the unresolved rows stale, and only those", () => {
        const out = rebookRows(rows, "crc-friday")
        const stale = out.writes.filter((w) => w.stale)
        expect(stale.map((w) => w.rowId)).toEqual(["c"])
        // And its page survives untouched.
        expect(stale[0].ref).toEqual({ book: "shabbat-maariv", folio: 40 })
    })

    it("reports the page it came from and the page it went to", () => {
        const out = rebookRows(rows, "crc-friday")
        const barchu = out.resolved.find((r) => r.rowId === "a")
        expect(barchu).toMatchObject({ from: 22, to: 10, how: "title" })
    })

    it("writes nothing at all when the book did not change", () => {
        const out = rebookRows(rows, "shabbat-maariv")
        expect(out.resolved).toEqual([])
        expect(out.unresolved).toEqual([])
        expect(out.writes).toEqual([])
    })
})
