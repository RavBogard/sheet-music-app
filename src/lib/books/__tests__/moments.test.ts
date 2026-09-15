import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Part E — the moment accessors.
 *
 * `src/data/books/moments.json` is POPULATED as of 2026-09-15 (R2-b dropped
 * the draft press pin, `sync:books` accepted the rebuilt `dist-app/`, and 136
 * moments landed). It used to ship empty, because the artifact is gitignored
 * in the producing repo and only exists after a build there.
 *
 * Both states are still tested, and the empty one is not vestigial: the
 * artifact can go missing again the next time the producing repo is rebuilt
 * from scratch, and no caller may lose a page number over it. Both halves are
 * driven by mocking the data module, so neither depends on what happens to be
 * checked in today.
 */

const EMPTY = { schemaVersion: 1, builtAt: null, sources: [], moments: [] }

const FIXTURE = {
    schemaVersion: 1,
    builtAt: "2026-09-14T15:00:00Z",
    sources: [
        { book: "shabbat-maariv", gitSha: "6f61874-LICENSED", pinValue: "6f61874-LICENSED" },
        { book: "shirei-tshuvah", gitSha: "21417d9-LICENSED", pinValue: "21417d9-LICENSED" },
    ],
    moments: [
        {
            id: "mi-chamocha",
            display: { en: "Mi Chamocha" },
            kind: "prayer",
            aliases: [],
            occurrences: [
                {
                    book: "shabbat-maariv",
                    unitId: "shma.mi-chamocha@shabbat-maariv",
                    folios: [28, 29],
                },
                {
                    book: "shirei-tshuvah",
                    unitId: "shma.mi-chamocha@shirei-tshuvah",
                    folios: [61],
                },
            ],
        },
        {
            id: "barchu",
            display: { en: "Bar’chu" },
            kind: "prayer",
            aliases: [],
            occurrences: [
                { book: "shabbat-maariv", unitId: "shma.barchu@shabbat-maariv", folios: [21, 22] },
            ],
        },
    ],
}

describe("moments — an empty or absent artifact", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.doMock("@/data/books/moments.json", () => ({ default: EMPTY }))
    })

    it("answers null / [] for everything, and says it is not loaded", async () => {
        const m = await import("../moments")
        expect(m.momentsLoaded()).toBe(false)
        expect(m.listMoments()).toEqual([])
        expect(m.momentForUnit("shma.mi-chamocha@shabbat-maariv")).toBeNull()
        expect(m.momentIdForUnit("shma.mi-chamocha@shabbat-maariv")).toBeNull()
        expect(m.getMoment("mi-chamocha")).toBeNull()
        expect(m.occurrencesForMoment("mi-chamocha")).toEqual([])
    })

    it("lookup_book_page still resolves pages with no moments data", async () => {
        // The moment layer is additive. A missing artifact must never cost a
        // page number — that is what prints on the rabbi's sheet.
        const { lookupBookPage } = await import("../lookup")
        const res = lookupBookPage("shabbat-maariv", "Mi Chamocha")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        // The page itself is NOT pinned here. `shabbat-maariv` is an alpha
        // draft whose folios move on every rebuild — that is exactly why
        // Ruling 8 forbids publishing them. What must hold is that a page
        // comes back at all, and that no moment id is invented.
        expect(typeof res.matches[0].folio).toBe("number")
        expect(res.matches[0].momentId).toBeUndefined()
    })
})

describe("moments — the artifact this repo actually ships", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.doUnmock("@/data/books/moments.json")
    })

    it("is loaded, and maps a real unit id onto its shared moment", async () => {
        const m = await import("../moments")
        expect(m.momentsLoaded()).toBe(true)
        expect(m.listMoments().length).toBeGreaterThan(0)
        const moment = m.momentForUnit("shma.mi-chamocha@shabbat-maariv")
        expect(moment).not.toBeNull()
        // The point of a moment: the same prayer, found in another book.
        const books = (moment?.occurrences ?? []).map((o) => o.book)
        expect(books).toContain("shirei-tshuvah")
    })
})

describe("moments — with an artifact synced in", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.doMock("@/data/books/moments.json", () => ({ default: FIXTURE }))
    })

    it("momentForUnit maps a book-local unit id onto the shared moment", async () => {
        const m = await import("../moments")
        expect(m.momentsLoaded()).toBe(true)
        expect(m.momentForUnit("shma.mi-chamocha@shabbat-maariv")?.id).toBe("mi-chamocha")
        expect(m.momentIdForUnit("shma.barchu@shabbat-maariv")).toBe("barchu")
    })

    it("returns null for an unknown or absent unit id rather than guessing", async () => {
        const m = await import("../moments")
        expect(m.momentForUnit("nothing.at-all@nowhere")).toBeNull()
        expect(m.momentForUnit(undefined)).toBeNull()
        expect(m.momentForUnit(null)).toBeNull()
    })

    it("round-trips Mi Chamocha across shabbat-maariv and shirei-tshuvah", async () => {
        // The join the whole layer exists for: a row that read p.28 in the
        // Friday-night volume finds its page in the machzor without anyone
        // re-typing a folio.
        const m = await import("../moments")
        const momentId = m.momentIdForUnit("shma.mi-chamocha@shabbat-maariv")
        expect(momentId).toBe("mi-chamocha")

        const inMachzor = m.occurrencesForMoment(momentId, "shirei-tshuvah")
        expect(inMachzor).toHaveLength(1)
        expect(inMachzor[0].folios[0]).toBe(61)
        expect(inMachzor[0].unitId).toBe("shma.mi-chamocha@shirei-tshuvah")

        // …and back the other way.
        const back = m.occurrencesForMoment(
            m.momentIdForUnit(inMachzor[0].unitId),
            "shabbat-maariv",
        )
        expect(back[0].folios[0]).toBe(28)
    })

    it("occurrencesForMoment returns [] for a book that does not print it", async () => {
        const m = await import("../moments")
        // An empty array means "leave the row alone and report it" — never
        // "clear the page".
        expect(m.occurrencesForMoment("barchu", "shirei-tshuvah")).toEqual([])
        expect(m.occurrencesForMoment("not-a-moment", "shabbat-maariv")).toEqual([])
    })

    it("unnarrowed, it returns every book that prints the moment", async () => {
        const m = await import("../moments")
        expect(m.occurrencesForMoment("mi-chamocha").map((o) => o.book)).toEqual([
            "shabbat-maariv",
            "shirei-tshuvah",
        ])
    })

    it("lookup_book_page carries momentId on a feed-tier match", async () => {
        const { lookupBookPage } = await import("../lookup")
        const res = lookupBookPage("shabbat-maariv", "Mi Chamocha")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches[0].momentId).toBe("mi-chamocha")
    })

    it("pagemap-tier matches carry no momentId — those books have no unit ids", async () => {
        const { lookupBookPage } = await import("../lookup")
        const res = lookupBookPage("crc-friday", "Mi Chamochah")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches.length).toBeGreaterThan(0)
        expect(res.matches[0].momentId).toBeUndefined()
    })
})
