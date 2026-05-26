import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * `search_chart_text` (F4 Tier-1 Option A+ — ratified 2026-05-26).
 *
 * Verifies:
 *  (1) Gate matrix — admin + band_leader allowed; musician, member, no-doc
 *      callers REJECTED with `forbidden_role` envelope per
 *      `[[feedback_mcp_validation_shape]]`.
 *  (2) Empty query → `invalid_argument` envelope (no scan attempted).
 *  (3) Metadata scope hits across `title`, `nameLower`, and every
 *      `aiSuggestion.{suggested_title, suggested_lead, suggested_tags,
 *      concerns}` field.
 *  (4) Chord scope hits via `collectionGroup('chordData')` substring
 *      match on `chords[].text` / `originalText`; page number is
 *      promoted from `page_<n>` doc id (0-indexed → 1-indexed).
 *  (5) `all` scope unions both passes; a chart matched in metadata is
 *      NOT double-counted from chord pages.
 *  (6) `limit` truncates results and emits `capped: true`.
 *  (7) `capped: true` also fires when the underlying Firestore scan
 *      hits SCAN_CAP.
 *  (8) `includeSnippets: false` omits the `snippet` field.
 *  (9) Snippet generation handles match-at-position-0 (no leading
 *      ellipsis), match-at-end (no trailing ellipsis), and
 *      match-in-middle (both ellipses).
 *  (10) Thrown Firestore I/O surfaces as `internal_error` envelope, not
 *       an uncaught exception.
 *
 * firebase-admin is mocked structurally so tests run without the
 * emulator. The mock plumbing is loose intentionally — search uses two
 * Firestore surfaces (library_index collection scan + chordData
 * collectionGroup scan + batched library_index getAll), and per-test
 * fixtures decide what each path returns.
 */

// ─── Mock Firestore plumbing ────────────────────────────────────────────────

interface FakeDoc {
    id: string
    exists?: boolean
    data: Record<string, unknown>
    parentId?: string // for chordData docs, the library_index/{fileId} parent
}

interface Fixture {
    userRole: string | undefined
    libraryIndex: FakeDoc[]
    libraryIndexCap?: number // when set, returned snap.size === this value (scan-capped path)
    chordData: FakeDoc[]
    chordDataCap?: number
    /** When true, library_index snapshot read throws. */
    libraryIndexThrows?: boolean
    /** When true, chordData collectionGroup read throws. */
    chordDataThrows?: boolean
}

let fixture: Fixture

function resetFixture(overrides: Partial<Fixture> = {}) {
    fixture = {
        userRole: "admin",
        libraryIndex: [],
        chordData: [],
        ...overrides,
    }
}

function makeSnap(docs: FakeDoc[], capCount?: number) {
    // The tool reads `snap.size` to decide scan-capped. When `capCount` is
    // set, report that size while still returning the supplied docs (we don't
    // actually need SCAN_CAP×1000 entries to exercise the branch).
    const size = capCount ?? docs.length
    return {
        empty: docs.length === 0,
        size,
        docs: docs.map((d) => ({
            id: d.id,
            data: () => d.data,
            ref: {
                parent: {
                    parent: d.parentId
                        ? {
                              id: d.parentId,
                              get: vi.fn(async () => {
                                  // Not used — chord path resolves titles via batched getAll.
                                  return {
                                      exists: true,
                                      id: d.parentId,
                                      data: () => ({ title: d.parentId }),
                                  }
                              }),
                          }
                        : null,
                },
            },
        })),
    }
}

const collectionGetMock = vi.fn(async () => {
    if (fixture.libraryIndexThrows) throw new Error("firestore-down-libindex")
    return makeSnap(fixture.libraryIndex, fixture.libraryIndexCap)
})
const collectionGroupGetMock = vi.fn(async () => {
    if (fixture.chordDataThrows) throw new Error("firestore-down-chord")
    return makeSnap(fixture.chordData, fixture.chordDataCap)
})

const userDocGetMock = vi.fn(async () => ({
    exists: fixture.userRole !== undefined,
    data: () =>
        fixture.userRole !== undefined
            ? { role: fixture.userRole }
            : {},
}))

const getAllMock = vi.fn(async (...refs: Array<{ id: string }>) => {
    return refs.map((r) => {
        const row = fixture.libraryIndex.find((d) => d.id === r.id)
        if (!row) return { exists: false, id: r.id, data: () => ({}) }
        return {
            exists: true,
            id: r.id,
            data: () => row.data,
        }
    })
})

const mockDb = {
    collection: vi.fn((path: string) => {
        if (path === "users") {
            return {
                doc: vi.fn(() => ({ get: userDocGetMock })),
            }
        }
        if (path === "library_index") {
            return {
                doc: vi.fn((id: string) => ({ id })),
                limit: vi.fn(() => ({ get: collectionGetMock })),
            }
        }
        return {
            doc: vi.fn(() => ({})),
            limit: vi.fn(() => ({ get: vi.fn(async () => ({ size: 0, docs: [] })) })),
        }
    }),
    collectionGroup: vi.fn((path: string) => {
        if (path === "chordData") {
            return { limit: vi.fn(() => ({ get: collectionGroupGetMock })) }
        }
        return { limit: vi.fn(() => ({ get: vi.fn(async () => ({ size: 0, docs: [] })) })) }
    }),
    getAll: getAllMock,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => mockDb),
}))

vi.mock("@/lib/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import {
    searchChartText,
    SNIPPET_PADDING,
    type SearchChartTextResult,
} from "../chart-text-search"
import type { RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

function ok(
    r: SearchChartTextResult | RichErrorEnvelope,
): asserts r is SearchChartTextResult {
    if (!(r as { ok?: boolean }).ok) {
        throw new Error(
            `expected ok:true result, got: ${JSON.stringify(r)}`,
        )
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    resetFixture()
})

// ─── (1) Gate matrix ────────────────────────────────────────────────────────

describe("search_chart_text role gate", () => {
    it("allows admin", async () => {
        resetFixture({
            userRole: "admin",
            libraryIndex: [
                { id: "f1", data: { title: "Adon Olam" } },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        ok(r)
        expect(r.results).toHaveLength(1)
    })

    it("allows band_leader", async () => {
        resetFixture({
            userRole: "band_leader",
            libraryIndex: [{ id: "f1", data: { title: "Adon Olam" } }],
        })
        const r = await searchChartText("leader-uid", { query: "Adon" })
        ok(r)
        expect(r.results).toHaveLength(1)
    })

    it("rejects musician with forbidden_role envelope", async () => {
        resetFixture({ userRole: "musician" })
        const r = await searchChartText("mus-uid", { query: "x" })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("forbidden_role")
    })

    it("rejects member (arbitrary other role)", async () => {
        resetFixture({ userRole: "member" })
        const r = await searchChartText("mem-uid", { query: "x" })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("forbidden_role")
    })

    it("rejects caller whose user doc doesn't exist (effectively unauthenticated)", async () => {
        resetFixture({ userRole: undefined })
        const r = await searchChartText("ghost-uid", { query: "x" })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("forbidden_role")
    })
})

// ─── (2) Validation ─────────────────────────────────────────────────────────

describe("search_chart_text input validation", () => {
    it("rejects empty query with invalid_argument envelope", async () => {
        resetFixture()
        const r = await searchChartText("admin-uid", { query: "" })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("invalid_argument")
        // No scan attempted — Firestore mock must never have been hit.
        expect(collectionGetMock).not.toHaveBeenCalled()
        expect(collectionGroupGetMock).not.toHaveBeenCalled()
    })

    it("rejects whitespace-only query", async () => {
        resetFixture()
        const r = await searchChartText("admin-uid", { query: "   \t  " })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("invalid_argument")
    })
})

// ─── (3) Metadata scope ─────────────────────────────────────────────────────

describe("search_chart_text metadata scope", () => {
    it("matches against title and returns one result", async () => {
        resetFixture({
            libraryIndex: [
                { id: "f1", data: { title: "Adon Olam (Janowski)" } },
                { id: "f2", data: { title: "Hashkivenu (Klepper)" } },
                { id: "f3", data: { title: "Mi Chamocha" } },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "Klepper" })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0]).toMatchObject({
            chartId: "f2",
            title: "Hashkivenu (Klepper)",
            field: "title",
        })
        expect(r.results[0].matchPosition).toBeGreaterThan(0)
        expect(r.totalScanned).toBe(3)
        expect(r.capped).toBe(false)
    })

    it("matches against nameLower when title doesn't carry the substring", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: {
                        title: "Shir Hamaalot",
                        nameLower: "shir_hamaalot_frankel.pdf",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "frankel" })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0].field).toBe("nameLower")
    })

    it("matches across every aiSuggestion text field", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f_st",
                    data: {
                        title: "F-st",
                        aiSuggestion: {
                            suggested_title: "Canonical Klepper Alias",
                        },
                    },
                },
                {
                    id: "f_lead",
                    data: {
                        title: "F-lead",
                        aiSuggestion: {
                            suggested_lead: "Rabbi Daniel",
                        },
                    },
                },
                {
                    id: "f_tags",
                    data: {
                        title: "F-tags",
                        aiSuggestion: {
                            suggested_tags: ["friday-evening", "frankel"],
                        },
                    },
                },
                {
                    id: "f_concerns",
                    data: {
                        title: "F-concerns",
                        aiSuggestion: {
                            concerns: [
                                "handwriting illegible",
                                "second page may be a different song",
                            ],
                        },
                    },
                },
            ],
        })

        const ranOne = async (q: string, field: string, id: string) => {
            const r = await searchChartText("admin-uid", { query: q })
            ok(r)
            expect(r.results, `query="${q}"`).toHaveLength(1)
            expect(r.results[0].chartId).toBe(id)
            expect(r.results[0].field).toBe(field)
        }

        await ranOne("Canonical Klepper", "aiSuggestion.suggested_title", "f_st")
        await ranOne("Daniel", "aiSuggestion.suggested_lead", "f_lead")
        await ranOne(
            "friday-evening",
            "aiSuggestion.suggested_tags",
            "f_tags",
        )
        await ranOne(
            "second page",
            "aiSuggestion.concerns",
            "f_concerns",
        )
    })

    it("returns empty results with totalScanned populated when no matches", async () => {
        resetFixture({
            libraryIndex: [
                { id: "f1", data: { title: "Adon Olam" } },
                { id: "f2", data: { title: "Mi Chamocha" } },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "Hineh ma tov" })
        ok(r)
        expect(r.results).toEqual([])
        expect(r.totalScanned).toBe(2)
        expect(r.capped).toBe(false)
    })
})

// ─── (4) Chord scope ────────────────────────────────────────────────────────

describe("search_chart_text chords scope", () => {
    it("matches a chord symbol via collectionGroup and resolves parent title", async () => {
        resetFixture({
            libraryIndex: [
                { id: "fA", data: { title: "Adon Olam (Janowski)" } },
                { id: "fB", data: { title: "Hashkivenu (Klepper)" } },
            ],
            chordData: [
                {
                    id: "page_0",
                    parentId: "fA",
                    data: {
                        chords: [
                            { text: "G", originalText: "G" },
                            { text: "C", originalText: "C" },
                            { text: "Em7", originalText: "Em7" },
                        ],
                    },
                },
                {
                    id: "page_2",
                    parentId: "fB",
                    data: {
                        chords: [
                            { text: "Bm7b5", originalText: "Bm7b5" },
                            { text: "Am7", originalText: "Am7" },
                        ],
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "Bm7b5",
            scope: "chords",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0]).toMatchObject({
            chartId: "fB",
            title: "Hashkivenu (Klepper)",
            field: "chordData",
            page: 3, // page_2 (0-indexed) → 3 (1-indexed)
        })
    })

    it("falls back to fileId when parent library_index doc has no title", async () => {
        resetFixture({
            libraryIndex: [
                { id: "fOrphan", data: { /* no title or name */ } },
            ],
            chordData: [
                {
                    id: "page_0",
                    parentId: "fOrphan",
                    data: { chords: [{ text: "F#m7", originalText: "F#m7" }] },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "F#m7",
            scope: "chords",
        })
        ok(r)
        expect(r.results[0].title).toBe("fOrphan")
    })
})

// ─── (5) `all` scope union (no double-count) ────────────────────────────────

describe("search_chart_text 'all' scope", () => {
    it("unions metadata + chords without double-counting a chart matched in metadata", async () => {
        resetFixture({
            libraryIndex: [
                { id: "fA", data: { title: "Adon Olam" } },
                { id: "fB", data: { title: "Hashkivenu (Klepper)" } },
            ],
            chordData: [
                {
                    id: "page_0",
                    parentId: "fA",
                    // metadata matches "Adon" on fA AND chordData has 'Adon' in
                    // chord text (synthetic — chord text can be arbitrary
                    // strings under the loose schema). The chord scope must
                    // skip fA because metadata already matched.
                    data: { chords: [{ text: "AdonalProgressionTest", originalText: "AdonalProgressionTest" }] },
                },
                {
                    id: "page_0",
                    parentId: "fB",
                    data: { chords: [{ text: "AdonalProgressionTest", originalText: "AdonalProgressionTest" }] },
                },
            ],
        })
        // fB's title doesn't match "Adon"; fA's title does. Chord scope finds
        // both — but fA is deduped, so we expect 2 matches: fA (metadata) +
        // fB (chordData).
        const r = await searchChartText("admin-uid", {
            query: "Adon",
            scope: "all",
        })
        ok(r)
        const ids = new Set(r.results.map((x) => x.chartId))
        expect(ids.has("fA")).toBe(true)
        expect(ids.has("fB")).toBe(true)
        expect(r.results).toHaveLength(2)
        // fA must be the metadata hit (chordData scope is skipped for it).
        expect(
            r.results.find((x) => x.chartId === "fA")?.field,
        ).toBe("title")
        expect(
            r.results.find((x) => x.chartId === "fB")?.field,
        ).toBe("chordData")
    })
})

// ─── (6) Limit truncation → capped:true ────────────────────────────────────

describe("search_chart_text limit truncation", () => {
    it("returns top `limit` matches and sets capped:true when more matches exist", async () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({
            id: `f${i}`,
            data: { title: `Adon Olam variant ${i}` },
        }))
        resetFixture({ libraryIndex: rows })
        const r = await searchChartText("admin-uid", {
            query: "Adon",
            limit: 2,
        })
        ok(r)
        expect(r.results).toHaveLength(2)
        expect(r.capped).toBe(true)
    })
})

// ─── (7) Underlying scan cap → capped:true ─────────────────────────────────

describe("search_chart_text scan cap", () => {
    it("emits capped:true when the underlying library_index scan hits SCAN_CAP", async () => {
        resetFixture({
            libraryIndex: [{ id: "f1", data: { title: "Adon Olam" } }],
            libraryIndexCap: 1000, // SCAN_CAP — pretend the fetched snap was capped
        })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.capped).toBe(true)
        expect(r.totalScanned).toBe(1000)
    })
})

// ─── (8) includeSnippets:false omits snippet field ──────────────────────────

describe("search_chart_text snippet toggle", () => {
    it("omits `snippet` when includeSnippets is false", async () => {
        resetFixture({
            libraryIndex: [{ id: "f1", data: { title: "Adon Olam" } }],
        })
        const r = await searchChartText("admin-uid", {
            query: "Adon",
            includeSnippets: false,
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0].snippet).toBeUndefined()
    })

    it("includes `snippet` by default", async () => {
        resetFixture({
            libraryIndex: [{ id: "f1", data: { title: "Adon Olam" } }],
        })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        ok(r)
        expect(typeof r.results[0].snippet).toBe("string")
    })
})

// ─── (9) Snippet position variants ─────────────────────────────────────────

describe("search_chart_text snippet generation", () => {
    it("match at position 0 — no leading ellipsis", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: { title: "Adon Olam (Janowski) — Friday Evening" },
                },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        ok(r)
        expect(r.results[0].matchPosition).toBe(0)
        expect(r.results[0].snippet).toBeDefined()
        expect(r.results[0].snippet!.startsWith("...")).toBe(false)
    })

    it("match at end — no trailing ellipsis", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: { title: "Friday Evening service: Adon" },
                },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        ok(r)
        const snip = r.results[0].snippet!
        expect(snip.endsWith("...")).toBe(false)
        expect(snip.toLowerCase().includes("adon")).toBe(true)
    })

    it("match in the middle of a long string — both ellipses + bounded width", async () => {
        const long =
            "x".repeat(200) + " NEEDLE " + "y".repeat(200)
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: {
                        title: "Long Concern Title",
                        aiSuggestion: { concerns: [long] },
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", { query: "NEEDLE" })
        ok(r)
        const snip = r.results[0].snippet!
        expect(snip.startsWith("...")).toBe(true)
        expect(snip.endsWith("...")).toBe(true)
        // ±SNIPPET_PADDING around "NEEDLE" + 6 chars of needle + 6 chars of
        // ellipses → bounded.
        expect(snip.length).toBeLessThanOrEqual(
            SNIPPET_PADDING * 2 + "NEEDLE".length + "......".length + 2,
        )
    })
})

// ─── (10) Firestore failure → rich internal_error ──────────────────────────

describe("search_chart_text error handling", () => {
    it("returns internal_error envelope when library_index read throws", async () => {
        resetFixture({ libraryIndexThrows: true })
        const r = await searchChartText("admin-uid", { query: "Adon" })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("internal_error")
    })

    it("returns internal_error envelope when chordData read throws", async () => {
        resetFixture({ chordDataThrows: true })
        const r = await searchChartText("admin-uid", {
            query: "Em7",
            scope: "chords",
        })
        expect(r.ok).toBe(false)
        expect(
            (r as RichErrorEnvelope).error.machine_code,
        ).toBe("internal_error")
    })
})

// ─── (11) Lyrics scope — f4-lyric-search-persistence-mod ───────────────────
//
// Lyrics scope reads `library_index/{id}.searchableText` — the lowercased +
// whitespace-normalized chart body persisted at PCU write time. Tests below
// are PURELY ADDITIVE — the 23 F4-A tests above stay byte-identical.

describe("search_chart_text lyrics scope", () => {
    it("matches against searchableText body", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: {
                        title: "Hineh Ma Tov",
                        // searchableText is stored lowercased at write time.
                        searchableText:
                            "hineh ma tov uma na'im shevet achim gam yachad",
                    },
                },
                {
                    id: "f2",
                    data: {
                        title: "Adon Olam",
                        searchableText: "adon olam asher malach b'terem",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "shevet achim",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0]).toMatchObject({
            chartId: "f1",
            title: "Hineh Ma Tov",
            field: "searchableText",
        })
    })

    it("does NOT match against title/nameLower/aiSuggestion when scope is 'lyrics' only", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: {
                        title: "Hineh Ma Tov", // would match if scope were 'metadata'
                        nameLower: "hineh_ma_tov.pdf",
                        aiSuggestion: { suggested_lead: "Daniel Hineh" },
                        // No searchableText — should NOT match in 'lyrics' scope.
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "Hineh",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toEqual([])
        // Confirm the metadata path didn't smuggle a hit through.
        expect(r.totalScanned).toBe(1)
    })

    it("skips rows missing searchableText cleanly (pre-backfill historical rows)", async () => {
        resetFixture({
            libraryIndex: [
                { id: "f_legacy", data: { title: "Old Chart" /* no searchableText */ } },
                {
                    id: "f_new",
                    data: {
                        title: "New Chart",
                        searchableText: "verse one of the new chart",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "verse one",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0].chartId).toBe("f_new")
        // Both rows still get scanned (the loop visits every doc) — totalScanned
        // counts visits, not matches.
        expect(r.totalScanned).toBe(2)
    })

    it("skips rows with empty-string searchableText cleanly", async () => {
        resetFixture({
            libraryIndex: [
                { id: "f1", data: { title: "Empty Body", searchableText: "" } },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "anything",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toEqual([])
    })

    it("builds a snippet from the searchableText body around the match", async () => {
        const body =
            "intro and a long preamble before the actual NEEDLE we want and then a long tail"
        resetFixture({
            libraryIndex: [
                { id: "f1", data: { title: "Test", searchableText: body } },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "needle",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results[0].snippet).toBeDefined()
        expect(r.results[0].snippet!.toLowerCase()).toContain("needle")
    })

    it("'all' scope returns lyric hit when only searchableText matches", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f_meta",
                    data: { title: "Adon Olam" },
                },
                {
                    id: "f_lyric",
                    data: {
                        title: "Hineh Ma Tov",
                        searchableText:
                            "hineh ma tov uma na'im shevet achim gam yachad",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "shevet achim",
            scope: "all",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0].chartId).toBe("f_lyric")
        expect(r.results[0].field).toBe("searchableText")
    })

    it("'all' scope: metadata field takes priority over searchableText for same chart", async () => {
        // Both title AND searchableText contain "Adon"; the union loop should
        // pick the metadata candidate first (priority order: title > nameLower
        // > aiSug > searchableText). One hit per chart.
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: {
                        title: "Adon Olam",
                        searchableText:
                            "adon olam asher malach b'terem kol y'tsir",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "Adon",
            scope: "all",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.results[0].field).toBe("title")
    })

    it("'all' scope: one chart-per-result; lyric and metadata matches on different charts both appear", async () => {
        resetFixture({
            libraryIndex: [
                { id: "fA", data: { title: "Adon Olam" } },
                {
                    id: "fB",
                    data: {
                        title: "Some Unrelated Title",
                        searchableText: "the second verse mentions adon directly",
                    },
                },
            ],
        })
        const r = await searchChartText("admin-uid", {
            query: "adon",
            scope: "all",
        })
        ok(r)
        const ids = new Set(r.results.map((x) => x.chartId))
        expect(ids.has("fA")).toBe(true)
        expect(ids.has("fB")).toBe(true)
        expect(r.results.find((x) => x.chartId === "fA")?.field).toBe("title")
        expect(r.results.find((x) => x.chartId === "fB")?.field).toBe(
            "searchableText",
        )
    })

    it("'lyrics' scope respects SCAN_CAP → capped:true", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: { title: "x", searchableText: "needle present" },
                },
            ],
            libraryIndexCap: 1000, // SCAN_CAP
        })
        const r = await searchChartText("admin-uid", {
            query: "needle",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(r.capped).toBe(true)
    })

    it("'lyrics' scope: limit truncation → capped:true", async () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({
            id: `f${i}`,
            data: {
                title: `T${i}`,
                searchableText: `searchable body needle ${i}`,
            },
        }))
        resetFixture({ libraryIndex: rows })
        const r = await searchChartText("admin-uid", {
            query: "needle",
            scope: "lyrics",
            limit: 2,
        })
        ok(r)
        expect(r.results).toHaveLength(2)
        expect(r.capped).toBe(true)
    })

    it("'lyrics' scope does NOT run the chordData collectionGroup scan", async () => {
        resetFixture({
            libraryIndex: [
                {
                    id: "f1",
                    data: { title: "x", searchableText: "body" },
                },
            ],
            // Chord scan would throw — but we should never reach it under
            // scope:'lyrics' so the result still succeeds.
            chordDataThrows: true,
        })
        const r = await searchChartText("admin-uid", {
            query: "body",
            scope: "lyrics",
        })
        ok(r)
        expect(r.results).toHaveLength(1)
        expect(collectionGroupGetMock).not.toHaveBeenCalled()
    })
})
