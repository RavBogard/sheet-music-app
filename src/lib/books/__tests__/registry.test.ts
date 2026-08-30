import { describe, it, expect } from "vitest"
import { listBooks, getBook, validateLiturgyRef } from "../registry"

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
        expect(validateLiturgyRef({ book: book.slug, folio: 1 })).toEqual({ ok: true })
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

    it("rejects a unitId that does not exist in a feed-tier book", () => {
        const feed = listBooks().find((b) => b.tier === "feed")
        if (!feed) return // no feed books registered yet (Task 2 adds them)
        const res = validateLiturgyRef({
            book: feed.slug,
            unitId: "nope.not-a-unit@nowhere",
            folio: 1,
        })
        expect(res).toMatchObject({ ok: false, machineCode: "unknown_unit_id" })
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
