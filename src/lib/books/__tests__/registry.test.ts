import { describe, it, expect } from "vitest"
import { listBooks, getBook, validateLiturgyRef, bookFolioFloor } from "../registry"

describe("book registry", () => {
    it("lists every registered book with slug, title, tier and page count", () => {
        const books = listBooks()
        expect(books.length).toBeGreaterThanOrEqual(1)
        for (const b of books) {
            expect(typeof b.slug).toBe("string")
            expect(b.slug.length).toBeGreaterThan(0)
            expect(typeof b.title).toBe("string")
            expect(["feed", "pagemap"]).toContain(b.tier)
            expect(b.pages).toBeGreaterThan(0)
        }
    })

    it("returns a book file by slug and undefined for an unknown slug", () => {
        const slug = listBooks()[0].slug
        expect(getBook(slug)?.slug).toBe(slug)
        expect(getBook("no-such-book")).toBeUndefined()
    })

    it("accepts a liturgyRef whose folio is inside the book's page range", () => {
        const book = listBooks()[0]
        expect(
            validateLiturgyRef({ book: book.slug, folio: bookFolioFloor(book.slug) }),
        ).toEqual({ ok: true })
    })

    it("rejects an unknown book slug with machine code unknown_book", () => {
        const res = validateLiturgyRef({ book: "no-such-book", folio: 1 })
        expect(res.ok).toBe(false)
        expect(res).toMatchObject({ machineCode: "unknown_book" })
    })

    it("rejects a folio outside the book's page range", () => {
        const book = listBooks()[0]
        const res = validateLiturgyRef({ book: book.slug, folio: book.pages + 500 })
        expect(res.ok).toBe(false)
        expect(res).toMatchObject({ machineCode: "folio_out_of_range" })
    })

    it("rejects a folio below 1", () => {
        const book = listBooks()[0]
        expect(validateLiturgyRef({ book: book.slug, folio: 0 })).toMatchObject({
            ok: false,
            machineCode: "folio_out_of_range",
        })
    })

    it("rejects a non-integer folio", () => {
        expect(validateLiturgyRef({ book: "crc-friday", folio: 4.5 })).toMatchObject({
            ok: false,
            machineCode: "folio_out_of_range",
        })
    })

    it("rejects a unitId that does not exist in a feed-tier book", () => {
        const feed = listBooks().find((b) => b.tier === "feed")
        if (!feed) return // no feed books registered yet (Task 2 adds them)
        const res = validateLiturgyRef({
            book: feed.slug,
            // A folio the book genuinely reaches — the range check runs first,
            // and this book's pages start at bookFolioFloor(), not necessarily 1.
            unitId: "nope.not-a-unit@nowhere",
            folio: bookFolioFloor(feed.slug),
        })
        expect(res).toMatchObject({ ok: false, machineCode: "unknown_unit_id" })
    })
})

/**
 * The floor used to be a hardcoded 1, which made crc-friday's whole folio range
 * (3–47) a subset of crc-saturday's accepted range. The two books share 132
 * normalized name/alias keys at different pages, so a Friday page written under
 * `book: 'crc-saturday'` validated silently and printed on the lectern sheet.
 *
 * The accept side matters as much as the reject side: erring restrictive here
 * would block real authoring, so every folio the books' own data actually
 * reaches is asserted valid, not a sample.
 */
describe("folio floor is derived from each book's own data", () => {
    it("derives the floor from pagemap entries and feed unit folios", () => {
        expect(bookFolioFloor("crc-friday")).toBe(3)
        expect(bookFolioFloor("crc-saturday")).toBe(50)
        expect(bookFolioFloor("shirei-tshuvah")).toBe(1)
    })

    it("falls back to 1 for a slug with no book data", () => {
        expect(bookFolioFloor("no-such-book")).toBe(1)
    })

    it("REJECTS a Friday-range folio written under crc-saturday", () => {
        // hareini: Friday 3 / Saturday 50. barchu: Friday 10 / Saturday 59.
        for (const folio of [3, 10, 25, 47, 49]) {
            expect(validateLiturgyRef({ book: "crc-saturday", folio })).toMatchObject({
                ok: false,
                machineCode: "folio_out_of_range",
            })
        }
    })

    it("names the ACCEPTED range in the rejection message, not '1–pages'", () => {
        const res = validateLiturgyRef({ book: "crc-saturday", folio: 10 })
        expect(res.ok).toBe(false)
        const message = (res as { message: string }).message
        expect(message).toContain("50–102")
        expect(message).not.toContain("1–102")
    })

    it("still rejects a folio past the end of each book", () => {
        for (const b of listBooks()) {
            expect(
                validateLiturgyRef({ book: b.slug, folio: b.pages + 1 }),
            ).toMatchObject({ ok: false, machineCode: "folio_out_of_range" })
        }
    })

    it("ACCEPTS every folio the books' own data reaches", () => {
        for (const b of listBooks()) {
            const file = getBook(b.slug)!
            const folios = new Set<number>()
            for (const e of file.entries ?? []) folios.add(e.page)
            for (const u of file.units ?? []) for (const f of u.folios) folios.add(f)
            expect(folios.size).toBeGreaterThan(0)
            for (const folio of folios) {
                expect({
                    book: b.slug,
                    folio,
                    result: validateLiturgyRef({ book: b.slug, folio }),
                }).toEqual({ book: b.slug, folio, result: { ok: true } })
            }
        }
    })

    it("ACCEPTS the full floor..pages span of each book", () => {
        for (const b of listBooks()) {
            const floor = bookFolioFloor(b.slug)
            for (let folio = floor; folio <= b.pages; folio++) {
                expect(validateLiturgyRef({ book: b.slug, folio })).toEqual({ ok: true })
            }
        }
    })
})

describe("feed-tier book snapshots", () => {
    const FEED_SLUGS = ["shabbat-maariv", "shabbat-shacharit", "shirei-tshuvah"]

    it.each(FEED_SLUGS)("%s is registered as a feed-tier book", (slug) => {
        const entry = listBooks().find((b) => b.slug === slug)
        expect(entry).toBeDefined()
        expect(entry?.tier).toBe("feed")
        expect(entry?.pages).toBeGreaterThan(0)
    })

    it.each(FEED_SLUGS)("%s snapshot has units with ids, names and folios", (slug) => {
        const book = getBook(slug)
        expect(book).toBeDefined()
        expect(book!.units!.length).toBeGreaterThan(0)
        for (const u of book!.units!) {
            expect(u.id).toMatch(/@/) // AR-3 ids always carry an @occasion-service suffix
            expect(typeof u.name).toBe("string")
            expect(Array.isArray(u.folios)).toBe(true)
            expect(u.folios.length).toBeGreaterThan(0)
            for (const f of u.folios) expect(Number.isInteger(f)).toBe(true)
        }
    })

    it("every unit folio is within its book's declared page count", () => {
        for (const slug of FEED_SLUGS) {
            const entry = listBooks().find((b) => b.slug === slug)!
            for (const u of getBook(slug)!.units!) {
                for (const f of u.folios) {
                    expect(f).toBeGreaterThanOrEqual(1)
                    expect(f).toBeLessThanOrEqual(entry.pages)
                }
            }
        }
    })

    it("validates a real unitId from the machzor", () => {
        const book = getBook("shirei-tshuvah")!
        const unit = book.units![0]
        expect(validateLiturgyRef({
            book: "shirei-tshuvah",
            unitId: unit.id,
            folio: unit.folios[0],
        })).toEqual({ ok: true })
    })
})
