import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { searchLibrary } from "../tools/library"

/**
 * Cycle-1 F-007 + F-024 — search_library default-hides non-chart artifacts.
 *
 * Pre-fix, agent searches surfaced `.mp3`, `.xlsx`, `.DS_Store`, Drive
 * folders, etc. alongside real charts because the in-app library tabs
 * filtered those out client-side and `searchLibrary` didn't. This suite
 * pins the joined library_index classification check so agent results
 * stay chart-only by default and the `includeNonCharts: true` escape
 * hatch still surfaces the raw set for audits.
 */
describe("MCP search_library — F-007 / F-024 non-chart filter (emulator)", () => {
    let app: App
    const ANY_UID = "any-uid"

    function db() {
        return getFirestore(app)
    }

    async function seedSong(
        id: string,
        title: string,
        extra: Record<string, unknown> = {},
    ) {
        await db()
            .collection("songs")
            .doc(id)
            .set({ title, status: "active", ...extra })
    }

    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-search-filter" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["songs", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    it("default hides audio / spreadsheets / Workspace docs / octet-stream / dotfiles", async () => {
        // Real chart (passes filter).
        await seedSong("chart1", "Oseh Shalom")
        await seedIndex("chart1", {
            name: "Oseh Shalom.pdf",
            mimeType: "application/pdf",
        })

        // Same-stem audio dub remix (F-007 case).
        await seedSong("audio1", "Oseh Shalom (Dub Remix).mp3")
        await seedIndex("audio1", {
            name: "Oseh Shalom (Dub Remix).mp3",
            mimeType: "audio/mpeg",
        })

        // xlsx (F-024).
        await seedSong("xlsx1", "Kabbalat Shabbat.xlsx")
        await seedIndex("xlsx1", {
            name: "Kabbalat Shabbat.xlsx",
            mimeType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })

        // docx.
        await seedSong("docx1", "Shabbat Notes.docx")
        await seedIndex("docx1", {
            name: "Shabbat Notes.docx",
            mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })

        // Google Workspace native (folder / doc / sheet).
        await seedSong("folder1", "Erev Service")
        await seedIndex("folder1", {
            name: "Erev Service",
            mimeType: "application/vnd.google-apps.folder",
        })
        await seedSong("gdoc1", "Service Flow")
        await seedIndex("gdoc1", {
            name: "Service Flow",
            mimeType: "application/vnd.google-apps.document",
        })

        // .DS_Store leak.
        await seedSong("dot1", ".DS_Store")
        await seedIndex("dot1", { name: ".DS_Store", mimeType: null })

        // Octet-stream mystery binary.
        await seedSong("octet1", "Mystery Blob")
        await seedIndex("octet1", {
            name: "Mystery Blob",
            mimeType: "application/octet-stream",
        })

        // Empty query — pre-fix would surface everything.
        const def = await searchLibrary(ANY_UID, { query: "" })
        expect(def.map((r) => r.id).sort()).toEqual(["chart1"])

        // Targeted F-007 query.
        const oseh = await searchLibrary(ANY_UID, { query: "Oseh" })
        expect(oseh.map((r) => r.id)).toEqual(["chart1"])

        // Targeted F-024 query (Kabbalat — xlsx must NOT surface).
        const kab = await searchLibrary(ANY_UID, { query: "Kab" })
        expect(kab.map((r) => r.id)).toEqual([])
    })

    it("includeNonCharts: true surfaces the raw set (audit escape hatch)", async () => {
        await seedSong("chart1", "Oseh Shalom")
        await seedIndex("chart1", {
            name: "Oseh Shalom.pdf",
            mimeType: "application/pdf",
        })
        await seedSong("audio1", "Oseh Shalom (Dub Remix).mp3")
        await seedIndex("audio1", {
            name: "Oseh Shalom (Dub Remix).mp3",
            mimeType: "audio/mpeg",
        })

        const raw = await searchLibrary(ANY_UID, {
            query: "Oseh",
            includeNonCharts: true,
        })
        expect(raw.map((r) => r.id).sort()).toEqual(["audio1", "chart1"])
    })

    it("filename-extension backstop catches songs/* rows missing a library_index mime", async () => {
        // Some legacy Drive-sync rows wrote the songs/ doc but no
        // library_index entry (or with mimeType cleared). The
        // isNonChartArtifactShape extension-fallback should still hide
        // .mp3 / .xlsx based on the filename alone.
        await seedSong("legacy-audio", "Ma Tovu Background.mp3")
        // No library_index seed → no W-02 join.

        await seedSong("legacy-chart", "Ma Tovu.pdf")
        await seedIndex("legacy-chart", {
            name: "Ma Tovu.pdf",
            mimeType: "application/pdf",
        })

        const r = await searchLibrary(ANY_UID, { query: "Ma Tovu" })
        expect(r.map((row) => row.id)).toEqual(["legacy-chart"])
    })

    it("songs with no library_index entry and chart-y names still surface", async () => {
        // Back-compat: catalog-only rows (no library_index mirror) for
        // real charts must NOT be filtered out. The fallback path checks
        // SongRecord.fileName / title — a .pdf passes the predicate.
        await seedSong("catalog-only", "Floating Song.pdf")
        await seedSong("just-title", "Bare Title") // no extension at all

        const r = await searchLibrary(ANY_UID, { query: "" })
        expect(r.map((row) => row.id).sort()).toEqual([
            "catalog-only",
            "just-title",
        ])
    })

    it("hides status:'duplicate' rows always (post-F-019 dedupe)", async () => {
        // F-019 dedupe marks losing rows with status:'duplicate' so the
        // search surface doesn't show them. No escape hatch — operators
        // audit dupes via list_library or the dedupe report.
        await seedSong("keep", "Hashkivenu")
        await seedIndex("keep", {
            name: "Hashkivenu.pdf",
            mimeType: "application/pdf",
        })
        await seedSong("dupe", "Hashkivenu", { status: "duplicate" })
        await seedIndex("dupe", {
            name: "Hashkivenu.pdf",
            mimeType: "application/pdf",
            status: "duplicate",
        })

        const r = await searchLibrary(ANY_UID, { query: "Hashkivenu" })
        expect(r.map((row) => row.id)).toEqual(["keep"])

        // No includeDuplicates escape hatch — even includeNonCharts
        // doesn't surface duplicates (it gates mime/name, not status).
        const escape = await searchLibrary(ANY_UID, {
            query: "Hashkivenu",
            includeNonCharts: true,
        })
        expect(escape.map((row) => row.id)).toEqual(["keep"])
    })

    it("does not leak internal join fields (mimeType, name) to the wire", async () => {
        // The W-02 join carries mimeType + name internally for the filter
        // step, but those must be stripped before returning so the
        // SongRecord wire contract holds.
        await seedSong("chart1", "Oseh Shalom")
        await seedIndex("chart1", {
            name: "Oseh Shalom.pdf",
            mimeType: "application/pdf",
            stem: "oseh shalom",
        })

        const r = await searchLibrary(ANY_UID, { query: "Oseh" })
        expect(r).toHaveLength(1)
        const row = r[0]
        // SongRecord-shape fields ARE present.
        expect(row.title).toBe("Oseh Shalom")
        expect(row.stem).toBe("oseh shalom") // W-02 spread preserved
        // Join-only classification fields ARE stripped.
        expect((row as unknown as Record<string, unknown>).mimeType).toBeUndefined()
        expect((row as unknown as Record<string, unknown>).name).toBeUndefined()
    })
})
