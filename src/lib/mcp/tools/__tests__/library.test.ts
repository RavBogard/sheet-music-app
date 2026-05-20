import { describe, it, expect, vi, beforeEach } from "vitest"

const mockGetAllSongs = vi.fn()
const mockGetSongById = vi.fn()

vi.mock("@/lib/mcp/server-songs", () => ({
    getAllSongs: () => mockGetAllSongs(),
    getSongById: (id: string) => mockGetSongById(id),
}))

// C9I2-001: searchLibrary now probes per-row chart-byte health. This is a
// unit test (no emulator/Storage), so mock the probe to healthy — these tests
// assert title/key/bpm filtering + ranking, not byte health. Healthy rows
// carry no chartHealth annotation and are never filtered, so assertions hold.
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi
        .fn()
        .mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import { searchLibrary, getSong } from "../library"

const songs = [
    { id: "s1", title: "Lecha Dodi", key: "G", bpm: 72, status: "active" },
    { id: "s2", title: "Hashkiveinu", key: "Am", bpm: 60 },
    { id: "s3", title: "Mi Chamocha", key: "G", bpm: 96 },
    { id: "s4", title: "Old Lecha Setting", key: "D", bpm: 70, status: "archived" },
    { id: "s5", title: "Shalom Rav", key: "C" }, // no bpm
    // L-003 normalization fixtures. Keys deliberately set to values not used
    // by existing key-filter assertions (s1=G, s2=Am, s3=G, s5=C) so the new
    // fixtures don't perturb other tests' result counts.
    { id: "s6", title: "Shalom_rav", key: "F" },
    { id: "s7", title: "shalom-rav (camp)", key: "F" },
    { id: "s8", title: "Shabbát Shalom", key: "Em" },
    // L-001 orphan-filter fixture.
    { id: "s9", title: "Ghost Chart", key: "B", status: "orphaned" },
]

describe("searchLibrary", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetAllSongs.mockResolvedValue(songs)
    })

    it("substring-matches the title, case-insensitive, and excludes archived", async () => {
        const r = await searchLibrary("u", { query: "lecha" })
        expect(r.map((s) => s.id)).toEqual(["s1"]) // s4 "Old Lecha Setting" is archived
    })

    it("excludes archived songs even with an empty query", async () => {
        const r = await searchLibrary("u", { query: "" })
        expect(r.find((s) => s.id === "s4")).toBeUndefined()
        // 9 total - 1 archived (s4) - 1 orphaned (s9, hidden by default)
        expect(r).toHaveLength(7)
    })

    it("excludes orphaned by default; includeOrphaned: true surfaces them (L-001)", async () => {
        const dflt = await searchLibrary("u", { query: "ghost" })
        expect(dflt).toEqual([])

        const opt = await searchLibrary("u", {
            query: "ghost",
            includeOrphaned: true,
        })
        expect(opt.map((s) => s.id)).toEqual(["s9"])

        // Archived still hidden even with includeOrphaned (different status).
        const noArchived = await searchLibrary("u", {
            query: "old lecha",
            includeOrphaned: true,
        })
        expect(noArchived).toEqual([])
    })

    it("filters by exact key, case-insensitive", async () => {
        const r = await searchLibrary("u", { query: "", key: "g" })
        expect(r.map((s) => s.id).sort()).toEqual(["s1", "s3"])
    })

    it("filters by BPM range; songs without a BPM are excluded when a bound is set", async () => {
        const r = await searchLibrary("u", { query: "", bpmMax: 80 })
        expect(r.map((s) => s.id).sort()).toEqual(["s1", "s2"]) // s5 has no bpm
    })

    it("applies the result limit", async () => {
        const r = await searchLibrary("u", { query: "", limit: 2 })
        expect(r).toHaveLength(2)
    })

    // Cycle-1 F-007 + F-024: cowork ran "Oseh Shalom" and got `Oseh Shalom (Dub Remix).mp3`
    // back; an empty query led with `.DS_Store`; "Kab" surfaced `Kabbalat Shabbat.xlsx`.
    // Hide all of those by default — match list_library's stance — but stay
    // opt-in surfaceable via `includeNonCharts: true` for library-hygiene audits.
    it("hides non-chart artifacts by default (audio/spreadsheet/dotfile); includeNonCharts surfaces them (F-007/F-024)", async () => {
        mockGetAllSongs.mockResolvedValue([
            { id: "ds", title: ".DS_Store", fileName: ".DS_Store", status: "active" },
            {
                id: "mp3",
                title: "Oseh Shalom (Dub Remix).mp3",
                fileName: "Oseh Shalom (Dub Remix).mp3",
                status: "active",
            },
            {
                id: "xlsx",
                title: "Kabbalat Shabbat.xlsx",
                fileName: "Kabbalat Shabbat.xlsx",
                status: "active",
            },
            {
                id: "ok",
                title: "Oseh Shalom",
                fileName: "Oseh Shalom.pdf",
                status: "active",
            },
        ])

        const dflt = await searchLibrary("u", { query: "" })
        expect(dflt.map((s) => s.id).sort()).toEqual(["ok"])

        const surfaced = await searchLibrary("u", {
            query: "",
            includeNonCharts: true,
        })
        expect(surfaced.map((s) => s.id).sort()).toEqual([
            "ds",
            "mp3",
            "ok",
            "xlsx",
        ])

        // Targeted query still finds the real chart, never the .mp3.
        const oseh = await searchLibrary("u", { query: "Oseh Shalom" })
        expect(oseh.map((s) => s.id)).toEqual(["ok"])
    })

    it("normalizes underscore/case/hyphen/diacritic variants (L-003)", async () => {
        // 2026-05-16 punch-list L-003: query "Shalom Rav" used to return only
        // exact-substring matches; underscore/hyphen variants in the catalog
        // were unreachable from agent search. Both index and query now
        // normalize: lowercase + diacritic-fold + collapse [_\s-]+ to space.
        const r = await searchLibrary("u", { query: "Shalom Rav" })
        const ids = r.map((s) => s.id).sort()
        expect(ids).toEqual(["s5", "s6", "s7"])

        // Hyphenated query also matches.
        const r2 = await searchLibrary("u", { query: "shalom-rav" })
        expect(r2.map((s) => s.id).sort()).toEqual(["s5", "s6", "s7"])

        // Diacritic fold: query "Shabbat Shalom" matches `Shabb`at Sha-LOM`.
        const r3 = await searchLibrary("u", { query: "Shabbat Shalom" })
        expect(r3.map((s) => s.id)).toContain("s8")
    })

    // Lane D (Bug 3, setlist-fixes wave 2026-05-20): the live Shavuot-Yizkor
    // session reported "Eitz chayim Weisberg" → 0 results. The match used to be
    // a single contiguous substring of the whole query; now every whitespace
    // token must appear (in any order, anywhere) in the normalized title.
    describe("per-token AND-match (Lane D / Bug 3)", () => {
        const tokSongs = [
            {
                id: "ec",
                title: "Eitz chayim - Weisenberg",
                key: "D",
                status: "active",
            },
            { id: "ld", title: "Lecha Dodi", key: "G", status: "active" },
            { id: "ms", title: "Mi Chamocha", key: "G", status: "active" },
        ]
        beforeEach(() => mockGetAllSongs.mockResolvedValue(tokSongs))

        it("matches non-contiguous tokens in any order (composer-first query)", async () => {
            const r = await searchLibrary("u", {
                query: "weisenberg eitz chayim",
            })
            expect(r.map((s) => s.id)).toEqual(["ec"])
        })

        it("matches when an interior word is dropped", async () => {
            const r = await searchLibrary("u", { query: "eitz weisenberg" })
            expect(r.map((s) => s.id)).toEqual(["ec"])
        })

        it("still misses a typo'd token — Levenshtein is deliberately deferred", async () => {
            const r = await searchLibrary("u", {
                query: "eitz chayim weisberg",
            })
            expect(r).toEqual([])
        })

        it("does not match when ANY token is absent from the title", async () => {
            // both single words exist as titles, but no single row has both.
            const r = await searchLibrary("u", { query: "lecha chamocha" })
            expect(r).toEqual([])
        })

        it("single-token query behaves exactly like the old .includes test", async () => {
            const r = await searchLibrary("u", { query: "chayim" })
            expect(r.map((s) => s.id)).toEqual(["ec"])
        })

        it("empty query still returns all (active) rows", async () => {
            const r = await searchLibrary("u", { query: "" })
            expect(r.map((s) => s.id).sort()).toEqual(["ec", "ld", "ms"])
        })

        it("hyphen/underscore between tokens is collapsed before splitting", async () => {
            // "eitz-chayim weisenberg" normalizes to "eitz chayim weisenberg".
            const r = await searchLibrary("u", {
                query: "eitz-chayim weisenberg",
            })
            expect(r.map((s) => s.id)).toEqual(["ec"])
        })
    })
})

describe("getSong", () => {
    beforeEach(() => vi.clearAllMocks())

    it("passes the id through to getSongById", async () => {
        mockGetSongById.mockResolvedValue({ id: "s1", title: "Lecha Dodi" })
        const r = await getSong("u", { id: "s1" })
        expect(mockGetSongById).toHaveBeenCalledWith("s1")
        // Cycle-3 AI-001: getSong now spreads the enrichment projection on
        // top of the song record. Without a Firestore emulator on this unit
        // test path, loadEnrichmentProjection's caller-side catch degrades
        // to the empty projection so the wire shape stays consistent.
        expect(r).toMatchObject({ id: "s1", title: "Lecha Dodi" })
        expect(r).toMatchObject({
            enrichmentStatus: null,
            enrichmentConfidence: null,
            aiSuggestion: null,
            retryQueued: false,
        })
    })

    it("returns null for a missing song", async () => {
        mockGetSongById.mockResolvedValue(null)
        expect(await getSong("u", { id: "nope" })).toBeNull()
    })
})
