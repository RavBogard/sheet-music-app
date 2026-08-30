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
