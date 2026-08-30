import { describe, it, expect } from "vitest"
import { listBooksTool, lookupBookPageTool } from "../books"

describe("list_books", () => {
    it("returns every registered book with slug, title, tier and pages", () => {
        const res = listBooksTool()
        expect(res.ok).toBe(true)
        expect(res.books.length).toBeGreaterThanOrEqual(5)
        const slugs = res.books.map((b) => b.slug)
        expect(slugs).toContain("crc-friday")
        expect(slugs).toContain("shirei-tshuvah")
        for (const b of res.books) {
            expect(["feed", "pagemap"]).toContain(b.tier)
            expect(b.pages).toBeGreaterThan(0)
        }
    })
})

describe("lookup_book_page", () => {
    it("resolves a prayer to a page in a pagemap book (high confidence, single exact match)", () => {
        // src/data/books/crc-friday.json: {"name":"Mi Chamochah","aliases":[...,"Mi Chamocha",...],"page":18}
        const res = lookupBookPageTool({ book: "crc-friday", query: "Mi Chamocha" })
        expect(res).toMatchObject({ ok: true, book: "crc-friday", query: "Mi Chamocha" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(1)
        expect(res.matches[0].folio).toBe(18)
        expect(res.matches[0].confidence).toBe("high")
        expect(res.totalMatches).toBe(1)
        expect(res.truncated).toBe(false)
    })

    it("returns unitId for a feed-tier book", () => {
        // src/data/books/shirei-tshuvah.json unit id
        // "emaariv.hashkivenu@rh1-maariv", name "Hashkivenu", folios [11,12] —
        // the only unit whose name normalizes to "hashkivenu", so it's an
        // unambiguous exact match.
        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Hashkivenu" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(1)
        expect(res.matches[0].unitId).toMatch(/@/)
        expect(res.matches[0].unitId).toBe("emaariv.hashkivenu@rh1-maariv")
        expect(res.matches[0].folio).toBe(11)
        expect(res.matches[0].confidence).toBe("high")
        expect(res.totalMatches).toBe(1)
        expect(res.truncated).toBe(false)
    })

    it("drops to low confidence in a feed-tier book when the same prayer name recurs at different folios", () => {
        // src/data/books/shirei-tshuvah.json has TWO units named "Bar'chu":
        // "emaariv.barchu@rh1-maariv" (folio 2, evening service) and
        // "shma.barchu@rh-shacharit" (folio 104, morning service) — an exact
        // name match that disagrees on folio, so both drop to 'low'.
        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Barchu" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(2)
        const folios = res.matches.map((m) => m.folio).sort((a, b) => a - b)
        expect(folios).toEqual([2, 104])
        for (const m of res.matches) {
            expect(m.confidence).toBe("low")
            expect(m.unitId).toMatch(/@/)
        }
        expect(res.totalMatches).toBe(2)
        expect(res.truncated).toBe(false)
    })

    it("returns an isError envelope for an unknown book", () => {
        const res = lookupBookPageTool({ book: "no-such-book", query: "x" })
        expect(res).toMatchObject({ ok: false, error: { machine_code: "unknown_book" } })
    })

    it("returns ok with an empty match list when nothing matches", () => {
        const res = lookupBookPageTool({ book: "crc-friday", query: "Zzzz Not A Prayer" })
        expect(res).toMatchObject({ ok: true })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toEqual([])
        expect(res.totalMatches).toBe(0)
        expect(res.truncated).toBe(false)
    })

    it("drops to low confidence when several exact matches land on different folios", () => {
        // src/data/books/crc-saturday.json: the alias "Prayer for Peace" is
        // shared by "Oseh Shalom" (page 82) and "Prayer for Shalom" (page 90) —
        // two exact hits that disagree on folio, so both must drop to 'low'
        // rather than the pre-fix 'medium'.
        const res = lookupBookPageTool({ book: "crc-saturday", query: "Prayer for Peace" })
        expect(res).toMatchObject({ ok: true, book: "crc-saturday" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(2)
        const folios = res.matches.map((m) => m.folio).sort((a, b) => a - b)
        expect(folios).toEqual([82, 90])
        for (const m of res.matches) expect(m.confidence).toBe("low")
        expect(res.totalMatches).toBe(2)
        expect(res.truncated).toBe(false)
    })

    it("surfaces totalMatches and truncated when a substring query overflows MAX_MATCHES", () => {
        // src/data/books/shirei-tshuvah.json has 11 units whose name contains
        // "psalm" (Psalm 27/91/92/93/84/146/147/148/149/150/47) — more than the
        // 8-match cap, so the truncation signal must reach the wire.
        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Psalm" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.totalMatches).toBe(11)
        expect(res.truncated).toBe(true)
        expect(res.matches).toHaveLength(8)
        for (const m of res.matches) expect(m.confidence).toBe("low")
    })
})
