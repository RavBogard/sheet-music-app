import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// searchLibrary probes chart-byte health; Storage is not what this golden is
// about, so the probe reads healthy (same mock as the other search suites).
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi.fn().mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn(),
}))

import { getSong, listLibrary, searchLibrary } from "@/lib/mcp/tools/library"
import { searchChartText } from "@/lib/mcp/tools/chart-text-search"
import { P5_FIXTURE_INDEX, P5_FIXTURE_SONGS, seedP5Library } from "./p5-fixture"

/**
 * Multi-tenant phase 5 — GOLDEN capture of what CRC and BL library reads
 * return BEFORE shared collections. Committed and passing on unchanged code
 * (9e0c6fac); every later phase-5 commit must keep it byte-identical with
 * shared collections off (includeShared false / every row visible only to its
 * owner). The only permitted difference is the new `ownerOrgId` field, which
 * `strip()` removes before comparing.
 */
const ADMIN = "p5-golden-admin"
const ORGS = ["crc", "brotherslazaroff"] as const

/** Drop fields phase 5 adds to the wire (ownerOrgId); nothing else. */
function strip(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(strip)
    if (v && typeof v === "object") {
        const out: Record<string, unknown> = {}
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
            if (k === "ownerOrgId") continue
            out[k] = strip(x)
        }
        return out
    }
    return v
}

describe("P5 golden — CRC/BL library reads before shared collections (emulator)", () => {
    let app: App
    const capture: Record<string, unknown> = {}

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-golden" })
        const db = getFirestore(app)
        await seedP5Library(db, { admin: ADMIN })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    it("captures list_library, search_library, get_song and search_chart_text per tenant", async () => {
        for (const org of ORGS) {
            const list = async (args: Parameters<typeof listLibrary>[1]) => strip(await listLibrary(ADMIN, args, org))
            capture[`${org}.list_library.default`] = await list({ limit: 200 })
            for (const c of ["core", "supplemental", "nava", "uploads"] as const) {
                capture[`${org}.list_library.${c}`] = await list({ collection: c, limit: 200 })
            }
            capture[`${org}.list_library.audit`] = await list({ limit: 200, includeNonCharts: true, includeNonChartHealthy: true })

            const search = async (args: Parameters<typeof searchLibrary>[1]) =>
                strip(await searchLibrary(ADMIN, args, org))
            capture[`${org}.search_library.empty`] = await search({ query: "", limit: 50 })
            capture[`${org}.search_library.adon`] = await search({ query: "adon" })
            capture[`${org}.search_library.lecha`] = await search({ query: "lecha" })
            capture[`${org}.search_library.nava`] = await search({ query: "", collection: "nava", limit: 50 })
            capture[`${org}.search_library.orphaned`] = await search({ query: "", includeOrphaned: true, includeNonCharts: true, limit: 50 })

            const songs: Record<string, unknown> = {}
            for (const id of Object.keys(P5_FIXTURE_SONGS)) songs[id] = strip(await getSong(ADMIN, { id }, org))
            capture[`${org}.get_song`] = songs

            capture[`${org}.search_chart_text.metadata`] = strip(
                await searchChartText(ADMIN, { query: "Libi", scope: "metadata" }, org),
            )
            capture[`${org}.search_chart_text.chords`] = strip(
                await searchChartText(ADMIN, { query: "Am7", scope: "chords" }, org),
            )
        }
        expect(Object.keys(P5_FIXTURE_INDEX).length).toBeGreaterThan(10)
        await expect(JSON.stringify(capture, null, 2)).toMatchFileSnapshot("./__goldens__/p5-library-reads.json")
    })
})
