import { describe, it, expect } from "vitest"
import { listBooksTool, lookupBookPageTool } from "../books"
import { getBook, getRegistryEntry } from "@/lib/books/registry"

/**
 * `R-0904-live-cw-19` — re-derivation helpers.
 *
 * The folio and count literals below were pinned against a GENERATED feed and
 * moved under this file every time `corpus` rebuilt a book (Hashkivenu 11 →
 * 12, Bar’chu 2/104 → 3/59, and "Psalm" fell from 11 candidates to 5, which
 * retired that query’s whole premise). The tests now derive from the registry
 * the tool itself reads, and assert the CONTRACT.
 *
 * `lookup.ts:77`: a feed match’s `folio` is the unit’s FIRST folio.
 * `lookup.ts:61`-`:72`: a unit is considered on its `name` AND its `id`.
 */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

function unitsNamed(slug: string, name: string) {
    return (getBook(slug)!.units ?? []).filter((u) => norm(u.name) === norm(name))
}

/** Every unit the substring arm of `lookup.ts:70` would consider for `q`. */
function unitsMatchingSubstring(slug: string, q: string) {
    const nq = norm(q)
    return (getBook(slug)!.units ?? []).filter((u) =>
        [u.name, u.id].map(norm).some((c) => c.includes(nq) || nq.includes(c)),
    )
}

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
        // "Hashkivenu" is the only unit in shirei-tshuvah whose name
        // normalizes to "hashkivenu", so it is an unambiguous exact match.
        // Re-derived: the folio used to be pinned at 11 and the feed moved it.
        //
        // STILL FAILABLE: uniqueness is ASSERTED, not assumed (a second
        // Hashkivenu would make "high" wrong, and this fails at the length
        // check); the AR-3 `@occasion-service` id shape is asserted; the folio
        // must be the unit’s FIRST folio, so returning `folios.at(-1)` fails
        // even though both numbers are real; and it must sit inside the book’s
        // declared page count.
        const units = unitsNamed("shirei-tshuvah", "Hashkivenu")
        expect(units).toHaveLength(1)
        const unit = units[0]
        expect(unit.folios.length).toBeGreaterThan(0)

        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Hashkivenu" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(1)
        expect(res.matches[0].unitId).toMatch(/@/)
        expect(res.matches[0].unitId).toBe(unit.id)
        expect(res.matches[0].folio).toBe(unit.folios[0])
        expect(res.matches[0].folio).toBeLessThanOrEqual(
            getRegistryEntry("shirei-tshuvah")!.pages,
        )
        expect(res.matches[0].confidence).toBe("high")
        expect(res.totalMatches).toBe(1)
        expect(res.truncated).toBe(false)
    })

    it("drops to low confidence in a feed-tier book when the same prayer name recurs at different folios", () => {
        // src/data/books/shirei-tshuvah.json has TWO units named "Bar'chu":
        // "emaariv.barchu@rh1-maariv" (folio 2, evening service) and
        // "shma.barchu@rh-shacharit" (folio 104, morning service) — an exact
        // name match that disagrees on folio, so both drop to 'low'.
        //
        // STILL FAILABLE, and the premise IS the assertion: "low" is
        // CONDITIONAL on the two folios differing (`lookup.ts:85`-`:89` gives
        // "high" when several exact hits share a folio), so distinctness is
        // asserted rather than assumed. Fails if a third Bar’chu appears, if
        // the two ever print on the same page, or if the disagreement rule
        // stops demoting. Re-derived: the pair used to be pinned at 2/104.
        const units = unitsNamed("shirei-tshuvah", "Bar’chu")
        expect(units).toHaveLength(2)
        const expected = units.map((u) => u.folios[0]).sort((a, b) => a - b)
        expect(new Set(expected).size).toBe(2) // they must DISAGREE

        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Barchu" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.matches).toHaveLength(2)
        const folios = res.matches.map((m) => m.folio).sort((a, b) => a - b)
        expect(folios).toEqual(expected)
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
        // THE QUERY CHANGED, not just the number. This test used "Psalm" and
        // asserted 11 candidates; the rebuilt feed carries FIVE units matching
        // "psalm", which is UNDER the 8-match cap — so the test’s whole
        // premise (a query that overflows) had gone, and re-baselining 11 → 5
        // would have left it asserting `truncated: true` about a query that no
        // longer truncates. "Kaddish" is the overflowing query in this book
        // now (Chatzi Kaddish / Kaddish Shalem / Mourner’s Kaddish, three
        // services each).
        //
        // STILL FAILABLE: the overflow is DERIVED and asserted as a premise —
        // if a future feed drops the count to 8 or fewer, this fails loudly
        // instead of passing vacuously. The cap literal 8 is `lookup.ts:24`’s
        // module-private MAX_MATCHES (not exported, so re-deriving it would
        // widen this order’s scope); unlike a folio it is a code constant and
        // does not move when `corpus` regenerates a book.
        const candidates = unitsMatchingSubstring("shirei-tshuvah", "Kaddish")
        expect(candidates.length).toBeGreaterThan(8) // the premise, asserted

        const res = lookupBookPageTool({ book: "shirei-tshuvah", query: "Kaddish" })
        expect(res).toMatchObject({ ok: true, book: "shirei-tshuvah" })
        if (!("matches" in res)) throw new Error("expected matches")
        expect(res.totalMatches).toBe(candidates.length)
        expect(res.truncated).toBe(true)
        expect(res.matches).toHaveLength(8)
        expect(res.matches.length).toBeLessThan(res.totalMatches)
        for (const m of res.matches) expect(m.confidence).toBe("low")
    })
})
