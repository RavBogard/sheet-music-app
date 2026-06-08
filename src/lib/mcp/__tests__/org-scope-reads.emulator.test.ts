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

import { listSetlists, getSetlist } from "../tools/setlists"
import { searchLibrary, getSong, listLibrary } from "../tools/library"
import { searchChartText } from "../tools/chart-text-search"

/**
 * v11-02-02 — MCP read org-scoping against the Firebase emulator.
 *
 * The leak-class proof: a crc caller reads ONLY crc data; a brotherslazaroff
 * caller reads ONLY BL data; cross-tenant get-by-id is a not-found wall. Covers
 * all 6 read tools over the 5 stamped collections.
 */
describe("MCP read org-scoping (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const CRC = "crc"
    const BL = "brotherslazaroff"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-org-scope-reads" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of [
            "setlists",
            "tracks",
            "songs",
            "library_index",
            "users",
            "aiEnrichmentRetryQueue",
        ]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seed() {
        // Admin user so search_chart_text's role gate passes.
        await db().collection("users").doc(ADMIN).set({ role: "admin" })

        // Setlists — one per tenant.
        await db().collection("setlists").doc("s-crc").set({
            name: "CRC Shabbat",
            orgId: CRC,
            date: "2026-06-05T00:00:00.000Z",
            trackCount: 0,
        })
        await db().collection("setlists").doc("s-bl").set({
            name: "BL Gig",
            orgId: BL,
            date: "2026-06-06T00:00:00.000Z",
            trackCount: 0,
        })

        // Songs — one per tenant, both match query "Oseh".
        await db().collection("songs").doc("g-crc").set({
            title: "Oseh Shalom CRC.pdf",
            orgId: CRC,
            status: "active",
        })
        await db().collection("songs").doc("g-bl").set({
            title: "Oseh Shalom BL.pdf",
            orgId: BL,
            status: "active",
        })

        // library_index — one per tenant, both match query "Adon"; each with a
        // chordData page carrying a tenant-distinct chord symbol.
        await db().collection("library_index").doc("li-crc").set({
            name: "Adon Olam CRC.pdf",
            title: "Adon Olam CRC.pdf",
            orgId: CRC,
            mimeType: "application/pdf",
            status: "active",
        })
        await db().collection("library_index").doc("li-bl").set({
            name: "Adon Olam BL.pdf",
            title: "Adon Olam BL.pdf",
            orgId: BL,
            mimeType: "application/pdf",
            status: "active",
        })
        await db()
            .collection("library_index")
            .doc("li-crc")
            .collection("chordData")
            .doc("page_0")
            .set({ chords: [{ text: "Cmaj7crc" }] })
        await db()
            .collection("library_index")
            .doc("li-bl")
            .collection("chordData")
            .doc("page_0")
            .set({ chords: [{ text: "Cmaj7bl" }] })
    }

    it("AC-1/AC-2: list_setlists returns only the caller's tenant", async () => {
        await seed()
        const crc = (await listSetlists(ADMIN, {}, CRC)) as Array<{ id: string }>
        expect(crc.map((s) => s.id).sort()).toEqual(["s-crc"])
        const bl = (await listSetlists(ADMIN, {}, BL)) as Array<{ id: string }>
        expect(bl.map((s) => s.id).sort()).toEqual(["s-bl"])
    })

    it("AC-3: get_setlist is a cross-tenant not-found wall", async () => {
        await seed()
        // crc caller reads its own.
        expect(await getSetlist(ADMIN, { id: "s-crc" }, CRC)).not.toBeNull()
        // BL caller cannot read the crc setlist.
        expect(await getSetlist(ADMIN, { id: "s-crc" }, BL)).toBeNull()
        // crc caller cannot read the BL setlist.
        expect(await getSetlist(ADMIN, { id: "s-bl" }, CRC)).toBeNull()
    })

    it("AC-1/AC-2: search_library returns only the caller's tenant", async () => {
        await seed()
        const crc = await searchLibrary(ADMIN, { query: "Oseh" }, CRC)
        expect(crc.map((s) => s.id).sort()).toEqual(["g-crc"])
        const bl = await searchLibrary(ADMIN, { query: "Oseh" }, BL)
        expect(bl.map((s) => s.id).sort()).toEqual(["g-bl"])
    })

    it("AC-3: get_song is a cross-tenant not-found wall", async () => {
        await seed()
        expect(await getSong(ADMIN, { id: "g-crc" }, CRC)).not.toBeNull()
        expect(await getSong(ADMIN, { id: "g-crc" }, BL)).toBeNull()
        expect(await getSong(ADMIN, { id: "g-bl" }, CRC)).toBeNull()
    })

    it("AC-1/AC-2: list_library returns only the caller's tenant", async () => {
        await seed()
        const crc = (await listLibrary(ADMIN, {}, CRC)) as { rows: Array<{ fileId: string }> }
        expect(crc.rows.map((r) => r.fileId).sort()).toEqual(["li-crc"])
        const bl = (await listLibrary(ADMIN, {}, BL)) as { rows: Array<{ fileId: string }> }
        expect(bl.rows.map((r) => r.fileId).sort()).toEqual(["li-bl"])
    })

    it("AC-1/AC-2: search_chart_text (metadata) returns only the caller's tenant", async () => {
        await seed()
        const crc = (await searchChartText(ADMIN, { query: "Adon", scope: "metadata" }, CRC)) as {
            results: Array<{ chartId: string }>
        }
        expect(crc.results.map((r) => r.chartId).sort()).toEqual(["li-crc"])
        const bl = (await searchChartText(ADMIN, { query: "Adon", scope: "metadata" }, BL)) as {
            results: Array<{ chartId: string }>
        }
        expect(bl.results.map((r) => r.chartId).sort()).toEqual(["li-bl"])
    })

    it("AC-1/AC-2: search_chart_text (chords) drops cross-tenant parent charts", async () => {
        await seed()
        // "Cmaj7" matches both tenants' chordData; each caller sees only theirs.
        const crc = (await searchChartText(ADMIN, { query: "Cmaj7", scope: "chords" }, CRC)) as {
            results: Array<{ chartId: string }>
        }
        expect(crc.results.map((r) => r.chartId).sort()).toEqual(["li-crc"])
        const bl = (await searchChartText(ADMIN, { query: "Cmaj7", scope: "chords" }, BL)) as {
            results: Array<{ chartId: string }>
        }
        expect(bl.results.map((r) => r.chartId).sort()).toEqual(["li-bl"])
    })
})
