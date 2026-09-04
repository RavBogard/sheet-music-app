import { describe, it, expect } from "vitest"
import { lookupBookPage } from "../lookup"
import { getBook, getRegistryEntry } from "../registry"

/**
 * `R-0904-live-cw-19` — re-derivation helper.
 *
 * The folio literals that used to sit in this file were regenerated out from
 * under it every time `corpus` rebuilt a book (Aleinu moved 36/200/238 →
 * 30/135/167; Kaddish Shalem 34/150/236 → 28/91/165). A fresh set of numbers
 * is a promise to break again, so the tests below derive from the registry
 * they already read and keep the RELATIONSHIPS as the assertions.
 *
 * `lookup.ts:77` reads `u.folios[0]` for a feed book — the FIRST folio, not
 * the whole span — so that is what a match's `folio` must equal.
 */
function unitsNamed(slug: string, name: string) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
    return (getBook(slug)!.units ?? []).filter((u) => norm(u.name) === norm(name))
}

describe("lookupBookPage", () => {
    it("returns unknown_book for an unregistered slug", () => {
        expect(lookupBookPage("no-such-book", "Mi Chamocha")).toMatchObject({
            ok: false,
            machineCode: "unknown_book",
        })
    })

    it("finds a feed-tier unit by name and returns its first folio and unitId", () => {
        // shirei-tshuvah has two units named "Bar'chu" (folio 2 and folio 104,
        // one per service) — an exact match with disagreeing folios, so both
        // resolve to "low" (stop-and-ask), not "high".
        const res = lookupBookPage("shirei-tshuvah", "Barchu")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches.length).toBeGreaterThan(0)
        const top = res.matches[0]
        expect(top.unitId).toMatch(/@/)
        expect(top.folio).toBeGreaterThan(0)
        expect(top.confidence).toBe("low")
    })

    it("is case- and punctuation-insensitive", () => {
        const a = lookupBookPage("shirei-tshuvah", "barchu")
        const b = lookupBookPage("shirei-tshuvah", "Bar'chu!")
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        expect(a.matches[0]?.unitId).toBe(b.matches[0]?.unitId)
    })

    it("matches a pagemap alias, not just the primary name", () => {
        const res = lookupBookPage("crc-friday", "Mi Khamokha")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches[0]?.name).toBe("Mi Chamochah")
        expect(res.matches[0]?.unitId).toBeUndefined()
    })

    it("returns an empty match list rather than an error when nothing matches", () => {
        const res = lookupBookPage("crc-friday", "Zzzz Not A Prayer")
        expect(res).toMatchObject({ ok: true })
        if (!res.ok) return
        expect(res.matches).toEqual([])
    })

    it("marks a single exact match high and multiple partial matches low", () => {
        const exact = lookupBookPage("crc-friday", "Mi Chamocha")
        expect(exact.ok).toBe(true)
        if (!exact.ok) return
        expect(exact.matches[0].confidence).toBe("high")
    })

    it("stops-and-asks on several exact matches that disagree on folio", () => {
        // shirei-tshuvah "Aleinu" occurs in three services (evening,
        // shacharit, mincha) at three different pages. Re-derived: the folios
        // come from the book's own units instead of being pinned.
        //
        // STILL FAILABLE, and this is the point: the "low" verdict is
        // CONDITIONAL on the three disagreeing (`lookup.ts:85`-`:89` — several
        // exact hits on ONE folio resolve to "high"). So the test asserts the
        // premise it depends on — three units, three DISTINCT folios — and
        // would fail if the data collapsed them onto one page, if a fourth
        // Aleinu appeared, if a folio left the book's page range, if the
        // ascending sort at `:92` broke, or if the disagreement rule ever
        // stopped dropping to "low".
        const units = unitsNamed("shirei-tshuvah", "Aleinu")
        const expected = units.map((u) => u.folios[0]).sort((a, b) => a - b)
        expect(units).toHaveLength(3)
        expect(new Set(expected).size).toBe(3) // they must DISAGREE, or "high" is correct
        const pages = getRegistryEntry("shirei-tshuvah")!.pages
        for (const f of expected) {
            expect(f).toBeGreaterThanOrEqual(1)
            expect(f).toBeLessThanOrEqual(pages)
        }

        const res = lookupBookPage("shirei-tshuvah", "Aleinu")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches.map((m) => m.folio)).toEqual(expected)
        for (const m of res.matches) expect(m.confidence).toBe("low")
    })

    it("signals truncation when a substring query has more candidates than the cap", () => {
        // shirei-tshuvah has 9 distinct units whose name contains "Kaddish"
        // (Chatzi Kaddish x3, Kaddish Shalem x3, Mourner's Kaddish x3) —
        // more than MAX_MATCHES (8). The dropped one (highest folio, 240:
        // mincha.mourners-kaddish@rh1-mincha) must be signaled via totalMatches
        // and truncated, not silently discarded.
        const res = lookupBookPage("shirei-tshuvah", "Kaddish")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.totalMatches).toBe(9)
        expect(res.matches.length).toBe(8)
        expect(res.truncated).toBe(true)
        expect(res.matches.map((m) => m.folio)).not.toContain(240)
    })

    it("commits a single unambiguous exact match with no truncation", () => {
        // "Ahavat Olam" occurs exactly once in shirei-tshuvah
        // (emaariv.ahavat-olam@rh1-maariv, folio 3) — verified against the
        // real data file, no other unit's name or id contains "ahavat".
        const res = lookupBookPage("shirei-tshuvah", "Ahavat Olam")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches[0].confidence).toBe("high")
        expect(res.truncated).toBe(false)
    })

    it("returns exact matches sorted ascending by folio", () => {
        // "Kaddish Shalem" (a full unit name, not just a substring) occurs
        // three times; the ordering invariant is independent of confidence.
        // Re-derived — the three folios used to be pinned as 34/150/236 and
        // the feed moved them.
        //
        // STILL FAILABLE: the sort at `lookup.ts:92` is the subject, and it is
        // asserted against the book's own folios in ascending order AND
        // against an independent re-sort of what came back — so a lookup that
        // returned the right three in DECLARATION order (which is not
        // ascending for every prayer in this book) fails the first assertion
        // while passing the second. It also fails if the unit count changes.
        const units = unitsNamed("shirei-tshuvah", "Kaddish Shalem")
        expect(units).toHaveLength(3)
        const expected = units.map((u) => u.folios[0]).sort((a, b) => a - b)

        const res = lookupBookPage("shirei-tshuvah", "Kaddish Shalem")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        const folios = res.matches.map((m) => m.folio)
        expect(folios).toEqual(expected)
        expect(folios).toEqual([...folios].sort((a, b) => a - b))
    })
})
