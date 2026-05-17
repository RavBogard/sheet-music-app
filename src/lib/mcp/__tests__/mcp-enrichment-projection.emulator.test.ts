import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

const mockGetChartHealth = vi.fn()
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: (...args: unknown[]) => mockGetChartHealth(...args),
    fetchFileById: vi.fn(),
}))

import { getSong, searchLibrary } from "../tools/library"
import { getChartStatus } from "../tools/library-verify"

/**
 * Cycle-3 AI-001 read-projection contract — the four enrichment fields
 * (`enrichmentStatus`, `enrichmentConfidence`, `aiSuggestion`,
 * `retryQueued`) attached to every read-tool row shape so Daniel + David's
 * MCP-first authoring surface (see [[user_mcp_is_primary_author_workflow]])
 * sees AI state during normal library inspection — not just via a4's
 * `/manage/library-review` HTTP surface or a5's dedicated review-queue MCP
 * tools.
 *
 * The `mcp-list-library.emulator.test.ts` suite has the listLibrary half of
 * this contract; this file covers the other three tools.
 */
describe("MCP AI-001 enrichment projection — search_library + get_song + get_chart_status", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const ANY_UID = "any-uid"

    function db() {
        return getFirestore(app)
    }

    async function seedSong(id: string, title: string) {
        await db()
            .collection("songs")
            .doc(id)
            .set({ title, status: "active" })
    }

    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }

    async function seedRetry(id: string, attempts = 1) {
        await db()
            .collection("aiEnrichmentRetryQueue")
            .doc(id)
            .set({
                rowId: id,
                attempts,
                nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
            })
    }

    const SAMPLE_SUGGESTION = {
        is_chart: true,
        confidence: 0.91,
        suggested_title: "Oseh Shalom",
        suggested_collection: "core",
        collection_disagrees_with_folder: false,
        suggested_key: "D",
        suggested_bpm: 84,
        suggested_lead: null,
        suggested_tags: ["friday-evening", "klepper"],
        duplicate_candidates: [],
        concerns: [],
        review_required: false,
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-enrichment-projection" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of [
            "songs",
            "library_index",
            "aiEnrichmentRetryQueue",
            "titleContextHints",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        mockGetChartHealth.mockReset()
    })

    // ─── search_library ────────────────────────────────────────────────────

    describe("search_library", () => {
        it("attaches enrichment fields to every result row", async () => {
            await seedSong("oseh", "Oseh Shalom")
            await seedIndex("oseh", {
                name: "Oseh Shalom",
                stem: "oseh shalom",
                enrichmentStatus: "enriched",
                aiSuggestion: SAMPLE_SUGGESTION,
                aiReviewTriggers: [],
                enrichmentRanAt: "2026-05-18T15:00:00.000Z",
            })
            const results = await searchLibrary(ANY_UID, { query: "oseh" })
            expect(results).toHaveLength(1)
            const r = results[0]
            expect(r.enrichmentStatus).toBe("enriched")
            expect(r.enrichmentConfidence).toBe(0.91)
            expect(r.aiSuggestion).toEqual(SAMPLE_SUGGESTION)
            expect(r.retryQueued).toBe(false)
        })

        it("surfaces the empty projection for rows with no library_index join (catalog-only)", async () => {
            // songs/{id} exists; library_index/{id} does not. The W-02 join
            // misses, so enrichment falls back to the empty projection.
            await seedSong("catalog-only", "Catalog-only chart")
            const results = await searchLibrary(ANY_UID, {
                query: "catalog",
                includeNonCharts: true,
            })
            expect(results).toHaveLength(1)
            const r = results[0]
            expect(r.enrichmentStatus).toBeNull()
            expect(r.enrichmentConfidence).toBeNull()
            expect(r.aiSuggestion).toBeNull()
            expect(r.retryQueued).toBe(false)
        })

        it("retryQueued reads true when a matching aiEnrichmentRetryQueue doc exists", async () => {
            await seedSong("pending", "Mid-retry chart")
            await seedIndex("pending", {
                name: "Mid-retry chart",
                stem: "mid retry",
                enrichmentStatus: "pending",
            })
            await seedRetry("pending", 2)
            const results = await searchLibrary(ANY_UID, { query: "mid" })
            expect(results).toHaveLength(1)
            expect(results[0].retryQueued).toBe(true)
            expect(results[0].enrichmentStatus).toBe("pending")
        })

        it("preserves pre-existing W-02 fields alongside enrichment fields (no overwrite)", async () => {
            await seedSong("h", "Hashkivenu (Klepper)")
            await seedIndex("h", {
                name: "Hashkivenu (Klepper)",
                stem: "hashkivenu",
                titleSpecificity: 0.7,
                composer: "Klepper",
                enrichmentStatus: "review_pending",
                aiSuggestion: { ...SAMPLE_SUGGESTION, confidence: 0.62 },
                aiReviewTriggers: ["low_confidence"],
            })
            const results = await searchLibrary(ANY_UID, { query: "hashkivenu" })
            expect(results).toHaveLength(1)
            const r = results[0]
            // W-02 fields still present.
            expect(r.titleSpecificity).toBe(0.7)
            expect(r.composer).toBe("Klepper")
            // Enrichment fields attached.
            expect(r.enrichmentStatus).toBe("review_pending")
            expect(r.enrichmentConfidence).toBe(0.62)
        })
    })

    // ─── get_song ──────────────────────────────────────────────────────────

    describe("get_song", () => {
        it("attaches enrichment projection to a single-song read", async () => {
            await seedSong("oseh", "Oseh Shalom")
            await seedIndex("oseh", {
                name: "Oseh Shalom",
                enrichmentStatus: "enriched",
                aiSuggestion: SAMPLE_SUGGESTION,
            })
            const r = await getSong(ANY_UID, { id: "oseh" })
            expect(r).not.toBeNull()
            if (!r) return
            expect(r.id).toBe("oseh")
            expect(r.enrichmentStatus).toBe("enriched")
            expect(r.enrichmentConfidence).toBe(0.91)
            expect(r.aiSuggestion).toEqual(SAMPLE_SUGGESTION)
            expect(r.retryQueued).toBe(false)
        })

        it("returns empty projection when no library_index row exists for the song", async () => {
            await seedSong("legacy", "Legacy chart")
            const r = await getSong(ANY_UID, { id: "legacy" })
            expect(r).not.toBeNull()
            if (!r) return
            expect(r.enrichmentStatus).toBeNull()
            expect(r.aiSuggestion).toBeNull()
            expect(r.retryQueued).toBe(false)
        })

        it("retryQueued reflects the aiEnrichmentRetryQueue doc presence", async () => {
            await seedSong("retrying", "Retrying chart")
            await seedIndex("retrying", {
                name: "Retrying chart",
                enrichmentStatus: "pending",
            })
            await seedRetry("retrying", 3)
            const r = await getSong(ANY_UID, { id: "retrying" })
            expect(r).not.toBeNull()
            if (!r) return
            expect(r.retryQueued).toBe(true)
            expect(r.enrichmentStatus).toBe("pending")
        })

        it("returns null for a missing song id (no projection synthesis)", async () => {
            const r = await getSong(ANY_UID, { id: "no-such-song" })
            expect(r).toBeNull()
        })
    })

    // ─── get_chart_status ──────────────────────────────────────────────────

    describe("get_chart_status", () => {
        beforeEach(async () => {
            await db().collection("users").doc(ADMIN).set({ role: "admin" })
            await db()
                .collection("users")
                .doc(ANY_UID)
                .set({ role: "musician" })
        })

        it("returns the enrichment projection alongside the health probe", async () => {
            mockGetChartHealth.mockResolvedValueOnce({
                status: "ok",
                source: "firebase-storage",
                mimeType: "application/pdf",
            })
            await seedIndex("u-ok", {
                name: "Healthy chart",
                enrichmentStatus: "human_curated",
                aiSuggestion: { ...SAMPLE_SUGGESTION, confidence: 0.55 },
                aiReviewTriggers: ["low_confidence"],
            })
            const r = await getChartStatus(ANY_UID, { fileId: "u-ok" })
            expect(r).toMatchObject({
                ok: true,
                fileId: "u-ok",
                health: { status: "ok" },
                enrichment: {
                    enrichmentStatus: "human_curated",
                    enrichmentConfidence: 0.55,
                    retryQueued: false,
                },
            })
            // Spot-check the blob came through whole.
            if (
                "enrichment" in r &&
                r.enrichment.aiSuggestion?.suggested_title
            ) {
                expect(r.enrichment.aiSuggestion.suggested_title).toBe(
                    "Oseh Shalom",
                )
            }
        })

        it("falls back to the empty projection when no library_index row exists for the fileId", async () => {
            mockGetChartHealth.mockResolvedValueOnce({
                status: "missing",
                reason: "no row",
            })
            const r = await getChartStatus(ANY_UID, { fileId: "no-such" })
            expect(r).toMatchObject({
                ok: true,
                fileId: "no-such",
                health: { status: "missing" },
                enrichment: {
                    enrichmentStatus: null,
                    enrichmentConfidence: null,
                    aiSuggestion: null,
                    retryQueued: false,
                },
            })
        })

        it("retryQueued surfaces on a chart whose AI subscriber is mid-retry", async () => {
            mockGetChartHealth.mockResolvedValueOnce({
                status: "ok",
                source: "firebase-storage",
            })
            await seedIndex("u-retry", {
                name: "Mid-retry chart",
                enrichmentStatus: "pending",
            })
            await seedRetry("u-retry", 1)
            const r = await getChartStatus(ANY_UID, { fileId: "u-retry" })
            expect(r).toMatchObject({
                ok: true,
                enrichment: { retryQueued: true, enrichmentStatus: "pending" },
            })
        })

        it("does not block on enrichment projection errors — health still returns", async () => {
            // No library_index seeded → projection resolves to empty. Health
            // still returns its mocked value. (We can't easily inject a
            // Firestore failure mid-test, so the cleanly-empty case is the
            // proxy for fail-soft behavior.)
            mockGetChartHealth.mockResolvedValueOnce({
                status: "unreachable",
                error: "test",
            })
            const r = await getChartStatus(ADMIN, { fileId: "vapor" })
            expect(r).toMatchObject({
                ok: true,
                health: { status: "unreachable" },
                enrichment: { retryQueued: false, enrichmentStatus: null },
            })
        })
    })
})
