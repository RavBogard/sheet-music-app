import { describe, expect, it } from "vitest"

import { buildReadback, READBACK_VOICE_MAX, type OpenItem, type ReadbackRow } from "../readback"

/**
 * Setlist memory, release 3 — the exceptions-first readback. Pure.
 */

const NOW = new Date("2026-11-01T12:00:00Z")

function song(index: number, label: string, over: Partial<ReadbackRow> = {}): ReadbackRow {
    return {
        index,
        label,
        isSong: true,
        hasChart: true,
        tier: "usual",
        phrase: `the usual ${label} in Dm`,
        keyOnRecord: true,
        ...over,
    }
}

function header(index: number, label: string): ReadbackRow {
    return { index, label, isSong: false, hasChart: false, tier: null, phrase: null, keyOnRecord: false }
}

function item(id: string, text: string, createdAt: string): OpenItem {
    return { id, text, trackId: null, createdAt, createdByName: "Daniel" }
}

const base = {
    profileLabel: "Randy Shabbat morning",
    date: "2026-11-07",
    book: "crc-saturday",
    special: false,
    openItems: [] as OpenItem[],
    now: NOW,
}

describe("buildReadback", () => {

    it("dates a standard by the tenant's day when given a time zone", () => {
        // 02:00Z on Oct 21 is the evening of Oct 20 in Chicago.
        const rows = [song(0, "Oseh Shalom", { tier: "standard", standing: { byName: "David", at: "2026-10-21T02:00:00Z" } })]
        const utc = buildReadback({ ...base, rows })
        const chicago = buildReadback({ ...base, rows, timeZone: "America/Chicago" })
        expect(utc.exceptions[0].text).toContain("since Oct 21")
        expect(chicago.exceptions[0].text).toContain("since Oct 20")
    })
    it("lists open slots, recent standards, promotions and open items, in that order", () => {
        const rows: ReadbackRow[] = [
            header(0, "Shacharit"),
            song(1, "Barchu", { tier: "last_time", phrase: "last time it was Barchu (Walkdown) in Dm", hasChart: false }),
            song(2, "Oseh Shalom", {
                tier: "standard",
                phrase: "your standard Oseh Shalom (Hirsch) in C",
                standing: { byName: "Daniel", at: "2026-10-20T10:00:00Z" },
            }),
            song(3, "Mi Chamocha", {
                tier: "standard",
                phrase: "your standard Mi Chamocha in F",
                standing: { byName: "Daniel", at: "2026-01-01T10:00:00Z" },
                promotion: { fileId: "f-mi", chartName: "Mi Chamocha (Klepper)", key: "G", weeks: 3 },
            }),
            song(4, "Adon Olam", { tier: "new", phrase: "new — which chart?", hasChart: false, keyOnRecord: false }),
        ]
        const r = buildReadback({ ...base, rows, openItems: [item("a", "chart still needed", "2026-10-30T00:00:00Z")] })
        expect(r.exceptions.map((e) => [e.kind, e.index])).toEqual([
            ["open_slot", 1],
            ["recent_standard", 2],
            ["promotion", 3],
            ["open_slot", 4],
            ["open_item", null],
        ])
        expect(r.exceptions.map((e) => e.text)).toEqual([
            "Barchu: last time it was Barchu (Walkdown) in Dm",
            "Oseh Shalom: your standard since Oct 20 (set by Daniel)",
            "Mi Chamocha: third week of Mi Chamocha (Klepper) in G. Make it standard?",
            "Adon Olam: new — which chart?",
            "Open: chart still needed",
        ])
        expect(r.headline).toBe("Randy Shabbat morning, Nov 7, CRC Saturday Siddur.")
        // Every song with a chart was listed, so there is no rest line.
        expect(r.rest).toBe("")
        expect(r.text.endsWith("Open: chart still needed.")).toBe(true)
    })

    it("an old standard (40 days) goes to the rest line", () => {
        const rows = [
            song(0, "Oseh Shalom", {
                tier: "standard",
                phrase: "your standard Oseh Shalom in C",
                standing: { byName: "Daniel", at: new Date(NOW.getTime() - 40 * 86_400_000).toISOString() },
            }),
        ]
        const r = buildReadback({ ...base, rows })
        expect(r.exceptions).toEqual([])
        expect(r.rest).toBe("The one song is your usual Randy Shabbat morning.")
    })

    it("all usual → 'All N songs are your usual …'", () => {
        const rows = [header(0, "Shacharit"), song(1, "Barchu"), song(2, "Oseh Shalom"), song(3, "Adon Olam")]
        const r = buildReadback({ ...base, rows })
        expect(r.exceptions).toEqual([])
        expect(r.rest).toBe("All 3 songs are your usual Randy Shabbat morning.")
        expect(r.text).toBe(`${r.headline} ${r.rest}`)
        expect(r.text).not.toMatch(/exception|none|\[\]/i)
    })

    it("usual with no key counts in the rest line, not as an exception", () => {
        const rows = [
            song(0, "Barchu"),
            song(1, "Oseh Shalom", { phrase: "the usual Oseh Shalom, key not on record", keyOnRecord: false }),
        ]
        const r = buildReadback({ ...base, rows })
        expect(r.exceptions).toEqual([])
        expect(r.rest).toBe("All 2 songs are your usual Randy Shabbat morning (1 with no key on record).")
    })

    it("more than 5 exceptions: voice says the count, the first three, and offers the rest (MCP-20)", () => {
        const rows = Array.from({ length: 7 }, (_, i) =>
            song(i, `Song ${i}`, { tier: "new", phrase: "new — which chart?", hasChart: false, keyOnRecord: false }),
        )
        const r = buildReadback({ ...base, rows })
        expect(r.exceptions).toHaveLength(7)
        expect(READBACK_VOICE_MAX).toBe(5)
        expect(r.text).toContain("Seven open slots. First three:")
        for (let i = 0; i < 3; i++) expect(r.text).toContain(`Song ${i}:`)
        expect(r.text).not.toContain("Song 3:")
        expect(r.text).toContain("Want the rest?")
        expect(r.text).not.toMatch(/on screen|…|show all/)
        expect(r.rest).toBe("")
    })

    it("open items are always said, outside the cap of 5", () => {
        const rows = Array.from({ length: 6 }, (_, i) =>
            song(i, `Song ${i}`, { tier: "new", phrase: "new — which chart?", hasChart: false, keyOnRecord: false }),
        )
        rows.push(song(6, "Adon Olam"))
        const openItems = [item("a", "chart still needed", "2026-10-30T00:00:00Z"), item("b", "swap when it lands", "2026-10-31T00:00:00Z")]
        const r = buildReadback({ ...base, rows, openItems })
        expect(r.exceptions.map((e) => e.kind).slice(-2)).toEqual(["open_item", "open_item"])
        expect(r.text).not.toContain("Song 3:")
        const more = r.text.indexOf("Want the rest?")
        expect(more).toBeGreaterThan(-1)
        expect(r.text.indexOf("Open: chart still needed.")).toBeGreaterThan(more)
        expect(r.text.indexOf("Open: swap when it lands.")).toBeGreaterThan(more)
        expect(r.text.endsWith(r.rest)).toBe(true)
        expect(r.rest).toBe("Everything else is your usual Randy Shabbat morning, 1 song.")
    })

    it("special adds the this-week-only line to the headline", () => {
        const r = buildReadback({ ...base, special: true, rows: [song(0, "Barchu")] })
        expect(r.headline).toBe(
            "Randy Shabbat morning, Nov 7, CRC Saturday Siddur. Marked special: changes are for this week only.",
        )
    })

    it("leaves a missing headline part out with its comma", () => {
        expect(buildReadback({ ...base, book: null, rows: [] }).headline).toBe("Randy Shabbat morning, Nov 7.")
        expect(buildReadback({ ...base, profileLabel: null, book: null, rows: [] }).headline).toBe("Nov 7.")
    })

    it("a usual row whose chart was taken off reads 'no chart yet'; a differing row reads its note", () => {
        const rows = [
            song(0, "Barchu", { hasChart: false, keyOnRecord: false }),
            song(1, "Oseh Shalom", { differs: "Oseh Shalom (Zeira) in Cm this week; usual is Oseh Shalom (Zeira) in Dm" }),
            song(2, "Adon Olam"),
        ]
        const r = buildReadback({ ...base, rows })
        expect(r.exceptions).toEqual([
            { kind: "no_chart", index: 0, text: "Barchu: no chart yet" },
            { kind: "differs", index: 1, text: "Oseh Shalom: Oseh Shalom (Zeira) in Cm this week; usual is Oseh Shalom (Zeira) in Dm" },
        ])
        expect(r.rest).toBe("Everything else is your usual Randy Shabbat morning, 1 song.")
    })

    it("no profile: the setlist name heads the readback", () => {
        expect(buildReadback({ ...base, profileLabel: null, title: "Gig at Off Broadway", book: null, rows: [] }).headline).toBe(
            "Gig at Off Broadway, Nov 7.",
        )
    })

    it("no profile: no tier wording, lists rows with no chart", () => {
        const rows: ReadbackRow[] = [
            header(0, "Set 1"),
            song(1, "Opener", { tier: null, phrase: null }),
            song(2, "Closer", { tier: null, phrase: null, hasChart: false, keyOnRecord: false }),
            song(3, "Encore", { tier: null, phrase: null }),
        ]
        const r = buildReadback({ ...base, profileLabel: null, book: null, rows })
        expect(r.exceptions).toEqual([{ kind: "no_chart", index: 2, text: "Closer: no chart yet" }])
        expect(r.rest).toBe("2 other songs have charts.")
        const plain = buildReadback({ ...base, profileLabel: null, book: null, rows: [rows[1], rows[3]] })
        expect(plain.rest).toBe("All 2 songs have charts.")
        expect(r.text).not.toMatch(/usual|standard|last time/)
    })
})
