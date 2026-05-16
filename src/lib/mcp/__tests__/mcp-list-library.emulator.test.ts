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

import { listLibrary, LIST_LIBRARY_DEFAULT_LIMIT } from "../tools/library"

/**
 * MCP list_library against the Firebase emulator.
 *
 * Covers:
 *  - Empty library returns rows=[] with total=0
 *  - All-collections listing returns every entry, alphabetical by name
 *  - Collection filter narrows correctly
 *  - Pagination (offset + limit) returns the right slice and `total` reflects
 *    the filtered population, not the slice
 *  - limit defaults to 50, caps at 200
 *  - mimeType / collection / fileSize / uploadedAt / key / bpm fields surface
 *  - status defaults to 'active' when omitted on the source doc
 *  - any uid may list (no role gate)
 */
describe("MCP list_library (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const ANY_UID = "any-uid"

    function db() {
        return getFirestore(app)
    }

    async function seedIndex(
        fileId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        await db().collection("library_index").doc(fileId).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-list-library" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection("library_index").get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("empty library returns rows=[] and total=0", async () => {
        const r = await listLibrary(ANY_UID, {})
        expect(r).toEqual({
            rows: [],
            total: 0,
            offset: 0,
            limit: LIST_LIBRARY_DEFAULT_LIMIT,
        })
    })

    it("lists every entry across collections, sorted alphabetically by name", async () => {
        await seedIndex("u3", { name: "Zion's Walls", collection: "core", mimeType: "application/pdf" })
        await seedIndex("u1", { name: "Adon Olam", collection: "core", mimeType: "application/pdf" })
        await seedIndex("u2", { name: "Mi Chamocha", collection: "supplemental", mimeType: "application/pdf" })

        const r = await listLibrary(ADMIN, {})
        expect("rows" in r).toBe(true)
        if (!("rows" in r)) return

        expect(r.total).toBe(3)
        expect(r.rows.map((x) => x.name)).toEqual([
            "Adon Olam",
            "Mi Chamocha",
            "Zion's Walls",
        ])
    })

    it("collection filter narrows results", async () => {
        await seedIndex("c1", { name: "A core chart", collection: "core" })
        await seedIndex("c2", { name: "Another core", collection: "core" })
        await seedIndex("s1", { name: "Supplemental song", collection: "supplemental" })
        await seedIndex("u1", { name: "User upload", collection: "uploads" })

        const r = await listLibrary(ANY_UID, { collection: "core" })
        if (!("rows" in r)) throw new Error("expected rows result")
        expect(r.total).toBe(2)
        expect(r.rows.map((x) => x.name).sort()).toEqual([
            "A core chart",
            "Another core",
        ])
    })

    it("collection: 'core' includes rows with collection: null (CF2-D-1)", async () => {
        // The 101 historical CRC charts have collection: null rather than
        // "core" in library_index. The /library UI's CRC Charts tab treats
        // "core" as everything that is NOT supplemental or uploads, so those
        // rows show up there. MCP must match that semantic so authors can
        // actually enumerate the core catalog.
        await seedIndex("legacy1", { name: "Legacy chart A" }) // no collection field
        await seedIndex("legacy2", { name: "Legacy chart B", collection: null })
        await seedIndex("c1", { name: "Modern core chart", collection: "core" })
        await seedIndex("s1", { name: "Supplemental song", collection: "supplemental" })
        await seedIndex("u1", { name: "User upload", collection: "uploads" })

        const r = await listLibrary(ANY_UID, { collection: "core" })
        if (!("rows" in r)) throw new Error("expected rows result")
        expect(r.total).toBe(3)
        expect(r.rows.map((x) => x.name).sort()).toEqual([
            "Legacy chart A",
            "Legacy chart B",
            "Modern core chart",
        ])

        // Strict-collection filters still strict for supplemental + uploads
        const supp = await listLibrary(ANY_UID, { collection: "supplemental" })
        if (!("rows" in supp)) throw new Error("expected rows result")
        expect(supp.total).toBe(1)

        const ups = await listLibrary(ANY_UID, { collection: "uploads" })
        if (!("rows" in ups)) throw new Error("expected rows result")
        expect(ups.total).toBe(1)
    })

    it("paginates with offset + limit, total reflects the filtered population", async () => {
        // Seed 7 supplemental + 3 core entries
        for (let i = 0; i < 7; i++) {
            await seedIndex(`s${i}`, {
                name: `Supp ${String.fromCharCode(65 + i)}`,
                collection: "supplemental",
            })
        }
        await seedIndex("c1", { name: "Core 1", collection: "core" })
        await seedIndex("c2", { name: "Core 2", collection: "core" })
        await seedIndex("c3", { name: "Core 3", collection: "core" })

        const page1 = await listLibrary(ANY_UID, {
            collection: "supplemental",
            limit: 3,
        })
        if (!("rows" in page1)) throw new Error("expected rows result")
        expect(page1.total).toBe(7) // filtered population, not slice
        expect(page1.rows.map((x) => x.name)).toEqual([
            "Supp A",
            "Supp B",
            "Supp C",
        ])

        const page2 = await listLibrary(ANY_UID, {
            collection: "supplemental",
            limit: 3,
            offset: 3,
        })
        if (!("rows" in page2)) throw new Error("expected rows result")
        expect(page2.rows.map((x) => x.name)).toEqual([
            "Supp D",
            "Supp E",
            "Supp F",
        ])

        const tail = await listLibrary(ANY_UID, {
            collection: "supplemental",
            limit: 3,
            offset: 6,
        })
        if (!("rows" in tail)) throw new Error("expected rows result")
        expect(tail.rows.map((x) => x.name)).toEqual(["Supp G"])
    })

    it("clamps limit at 200 even when the caller passes a larger value (CF2-D-2)", async () => {
        await seedIndex("a", { name: "Only chart", collection: "core" })
        // listLibrary clamps silently — the MCP tool wrapper no longer
        // hard-rejects via Zod (CF2-D-2), so a prompt-only caller that
        // passes `limit: 999` gets a usable response instead of -32602.
        const r = await listLibrary(ANY_UID, { limit: 999 })
        if (!("rows" in r)) throw new Error("expected rows result")
        expect(r.limit).toBe(200)
    })

    it("default browse hides folders, audio, dotfiles, Workspace + Office types, octet-stream (NOTE-4 + V4-NOTE-1)", async () => {
        // v3 NOTE-4 caught folders/audio/dotfiles; v4-NOTE-1 expanded the
        // negative set to also cover Google Workspace (Docs, Sheets,
        // Shortcuts), Office xlsx/docx, and application/octet-stream.
        // 2026-05-16 cowork report saw 16 Workspace/Office rows leaking
        // into list_library({collection: "core"}) — V4-NOTE-1 closes that
        // by expanding the predicate AND applying it to collection queries.
        await seedIndex("chart1", {
            name: "Adon Olam",
            mimeType: "application/pdf",
            collection: "core",
        })
        await seedIndex("folder1", {
            name: "1. Erev Rosh",
            mimeType: "application/vnd.google-apps.folder",
            collection: "core",
        })
        await seedIndex("audio1", {
            name: "3 Songs Office Hours.mp3",
            mimeType: "audio/mpeg",
        })
        await seedIndex("dotfile1", {
            name: ".DS_Store",
            mimeType: null,
        })
        await seedIndex("gdoc1", {
            name: "Kol Nidre 2025 Service Flow",
            mimeType: "application/vnd.google-apps.document",
            collection: "core",
        })
        await seedIndex("gsheet1", {
            name: "Setlist Spreadsheet",
            mimeType: "application/vnd.google-apps.spreadsheet",
            collection: "core",
        })
        await seedIndex("xlsx1", {
            name: "Roster.xlsx",
            mimeType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            collection: "core",
        })
        await seedIndex("docx1", {
            name: "Notes.docx",
            mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            collection: "core",
        })
        await seedIndex("octet1", {
            name: "Mystery Blob",
            mimeType: "application/octet-stream",
            collection: "core",
        })
        await seedIndex("shortcut1", {
            name: "Lechu Goldman shortcut",
            mimeType: "application/vnd.google-apps.shortcut",
            collection: "core",
        })

        const def = await listLibrary(ANY_UID, {})
        if (!("rows" in def)) throw new Error("expected rows result")
        expect(def.total).toBe(1)
        expect(def.rows.map((x) => x.name)).toEqual(["Adon Olam"])

        // V4-NOTE-1 specific: the chart filter also applies to
        // collection-filtered queries. Pre-fix, list_library({collection:"core"})
        // surfaced 16 non-charts (Workspace docs, xlsx, octet-stream).
        const core = await listLibrary(ANY_UID, { collection: "core" })
        if (!("rows" in core)) throw new Error("expected rows result")
        expect(core.total).toBe(1)
        expect(core.rows.map((x) => x.name)).toEqual(["Adon Olam"])

        // Opt-in escape hatch surfaces every row for audit cases.
        const raw = await listLibrary(ANY_UID, { includeNonCharts: true })
        if (!("rows" in raw)) throw new Error("expected rows result")
        expect(raw.total).toBe(10)
    })

    it("surfaces mimeType / fileSize / uploadedAt / key / bpm fields", async () => {
        await seedIndex("u1", {
            name: "Hinei Ma Tov",
            collection: "core",
            mimeType: "application/pdf",
            fileSize: 12345,
            uploadedAt: "2026-05-15T18:30:00.000Z",
            uploadedBy: "rabbi-daniel",
            key: "G",
            bpm: 96,
            tags: ["israeli", "shabbat"],
            status: "active",
        })

        const r = await listLibrary(ADMIN, {})
        if (!("rows" in r)) throw new Error("expected rows result")
        expect(r.rows[0]).toEqual({
            fileId: "u1",
            name: "Hinei Ma Tov",
            collection: "core",
            mimeType: "application/pdf",
            fileSize: 12345,
            uploadedAt: "2026-05-15T18:30:00.000Z",
            uploadedBy: "rabbi-daniel",
            key: "G",
            bpm: 96,
            tags: ["israeli", "shabbat"],
            status: "active",
        })
    })

    it("defaults status to 'active' when omitted on the source doc", async () => {
        await seedIndex("u1", { name: "No-status chart", collection: "core" })
        const r = await listLibrary(ANY_UID, {})
        if (!("rows" in r)) throw new Error("expected rows result")
        expect(r.rows[0].status).toBe("active")
    })

    it("any uid may list — no role gate", async () => {
        await seedIndex("u1", { name: "Chart", collection: "core" })
        for (const caller of [ADMIN, ANY_UID, "guest", ""]) {
            const r = await listLibrary(caller, {})
            expect("rows" in r).toBe(true)
        }
    })

    describe("W-02 trust-calibration fields", () => {
        it("surfaces stem + titleSpecificity + bondCorrectionHistory on each row", async () => {
            await seedIndex("u1", {
                name: "Hashkivenu (Klepper)",
                collection: "core",
                stem: "hashkivenu",
                titleSpecificity: 0.6,
                bondCorrectionHistory: {
                    correctedTo: 4,
                    correctedAwayFrom: 1,
                    lastCorrectionAt: "2026-05-15T00:00:00Z",
                },
                composer: "Klepper",
                lastUsedInSetlist: {
                    setlistId: "set-123",
                    eventDate: "2026-05-09",
                },
            })

            const r = await listLibrary(ANY_UID, {})
            if (!("rows" in r)) throw new Error("expected rows result")
            const row = r.rows[0]
            expect(row.stem).toBe("hashkivenu")
            expect(row.titleSpecificity).toBe(0.6)
            expect(row.composer).toBe("Klepper")
            expect(row.bondCorrectionHistory).toEqual({
                correctedTo: 4,
                correctedAwayFrom: 1,
                lastCorrectionAt: "2026-05-15T00:00:00Z",
            })
            expect(row.lastUsedInSetlist).toEqual({
                setlistId: "set-123",
                eventDate: "2026-05-09",
            })
        })

        it("computes siblingsInCatalog per stem (orphans excluded from count, but still surfaced as rows)", async () => {
            // listLibrary's orphan policy: still RETURN orphaned rows (operators
            // need to see them for hygiene), but EXCLUDE them from the
            // siblingsInCatalog count (since orphans don't have files).
            // search_library is the one that hides orphans by default — L-001.
            await seedIndex("u1", { name: "Hashkivenu (Klepper)", stem: "hashkivenu", status: "active" })
            await seedIndex("u2", { name: "Hashkivenu (Sulzer)", stem: "hashkivenu", status: "active" })
            await seedIndex("u3", { name: "Hashkivenu (Old)", stem: "hashkivenu", status: "orphaned" })
            await seedIndex("u4", { name: "Hava Nagilah", stem: "hava nagilah", status: "active" })

            const r = await listLibrary(ANY_UID, {})
            if (!("rows" in r)) throw new Error("expected rows result")
            const byId = Object.fromEntries(r.rows.map((row) => [row.fileId, row]))
            expect(byId.u1.siblingsInCatalog).toBe(2) // u1 + u2 active
            expect(byId.u2.siblingsInCatalog).toBe(2)
            expect(byId.u4.siblingsInCatalog).toBe(1)
            // u3 surfaced but with status orphaned — its siblings count is
            // intentionally omitted (set neither active-2 nor stand-alone-1).
            expect(byId.u3).toBeDefined()
            expect(byId.u3.status).toBe("orphaned")
        })

        it("rows without W-02 fields surface as undefined (back-compat with old uploads)", async () => {
            await seedIndex("legacy", { name: "Pre-W-02 Chart", collection: "core" })
            const r = await listLibrary(ANY_UID, {})
            if (!("rows" in r)) throw new Error("expected rows result")
            const row = r.rows[0]
            expect(row.stem).toBeUndefined()
            expect(row.titleSpecificity).toBeUndefined()
            expect(row.bondCorrectionHistory).toBeUndefined()
            // Non-W-02 contract still holds — status defaulted to "active".
            expect(row.status).toBe("active")
        })
    })
})
