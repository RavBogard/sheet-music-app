import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

// Chart-byte health and bytes are not what this suite is about: health reads
// healthy, and a download gets a small PDF-shaped buffer.
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: vi.fn().mockResolvedValue({ status: "ok", source: "firebase-storage" }),
    fetchFileById: vi.fn().mockResolvedValue({
        buffer: Buffer.from("%PDF-1.4 p5"),
        contentType: "application/pdf",
        source: "firebase-storage",
    }),
}))
// Rate limiting is module-global state; same mock as the other write suites.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))
// delete_chart's Storage cleanup is best-effort and not under test here.
vi.mock("@/lib/library/safely-delete-library-object", () => ({
    safelyDeleteLibraryObject: vi.fn().mockResolvedValue(undefined),
}))

import { getSong, listLibrary, searchLibrary } from "@/lib/mcp/tools/library"
import { searchChartText } from "@/lib/mcp/tools/chart-text-search"
import { getChartStatus } from "@/lib/mcp/tools/library-verify"
import { updateSong } from "@/lib/mcp/tools/song-metadata"
import { markChartStatus } from "@/lib/mcp/tools/mark-chart-status"
import { editEnrichment } from "@/lib/mcp/tools/library-review"
import { deleteChart } from "@/lib/mcp/tools/library-upload"
import { downloadChart } from "@/lib/mcp/tools/library-download"
import { tenantDisplayName } from "@/lib/library/visibility-server"
import { seedP5Library } from "@/lib/library/__tests__/p5-fixture"

/**
 * Multi-tenant phase 5 — MCP reads are VISIBLE, writes are OWNS.
 *
 * Starts from the golden fixture, then restamps rows to simulate sharing:
 *  - c-nava-1 / c-nava-2 move to the `nava-tehila` tenant and are ASSIGNED to
 *    crc (visibleToOrgs + libraryOrgs) — in CRC's default library.
 *  - b-up-1 (BL) is SHARED with crc but not assigned (visibleToOrgs only) —
 *    opt-in for CRC. Stamped on library_index ONLY, so the songs twin lacks
 *    the stamp: reads must still admit it through the index row.
 * b-core-1 (BL) is not shared with anyone.
 */
const ADMIN = "p5-vis-admin"
const CRC = "crc"
const BL = "brotherslazaroff"
const NAVA = "nava-tehila"

function code(r: unknown): string | undefined {
    const e = r as { ok?: boolean; error?: { machine_code?: string } }
    return e && e.ok === false && e.error ? e.error.machine_code : undefined
}
function message(r: unknown): string | undefined {
    return (r as { error?: { message?: string } }).error?.message
}
const ids = (rows: Array<{ id?: string; fileId?: string }>) => rows.map((r) => r.id ?? r.fileId ?? "").sort()

async function restamp(db: Firestore) {
    const nava = {
        orgId: NAVA,
        visibleToOrgs: [NAVA, CRC],
        libraryOrgs: [NAVA, CRC],
        collectionId: `${NAVA}__nava`,
    }
    for (const id of ["c-nava-1", "c-nava-2"]) {
        await db.collection("library_index").doc(id).update(nava)
        await db.collection("songs").doc(id).update(nava)
    }
    await db.collection("library_index").doc("b-up-1").update({
        visibleToOrgs: [BL, CRC],
        libraryOrgs: [BL],
        collectionId: `${BL}__uploads`,
    })
    await db.collection("orgs").doc(NAVA).set({ name: "Nava Tehila" })
}

describe("P5 shared visibility — MCP reads VISIBLE, writes OWNS (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-shared-vis" })
        await seedP5Library(db(), { admin: ADMIN })
        await restamp(db())
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    // ─── reads ──────────────────────────────────────────────────────────

    it("search_library: default = own + assigned; includeShared adds shared; ownerOrgId correct", async () => {
        const def = await searchLibrary(ADMIN, { query: "", limit: 50 }, CRC)
        expect(ids(def)).toContain("c-nava-1")
        expect(ids(def)).toContain("c-nava-2")
        expect(ids(def)).toContain("c-core-1")
        expect(ids(def)).not.toContain("b-up-1")
        expect(def.find((r) => r.id === "c-nava-1")?.ownerOrgId).toBe(NAVA)
        expect(def.find((r) => r.id === "c-core-1")?.ownerOrgId).toBe(CRC)
        for (const r of def) expect(r.ownerOrgId).toBeTruthy()

        const shared = await searchLibrary(ADMIN, { query: "", limit: 50, includeShared: true }, CRC)
        expect(ids(shared)).toEqual([...ids(def), "b-up-1"].sort())
        expect(shared.find((r) => r.id === "b-up-1")?.ownerOrgId).toBe(BL)
        // join-only fields never reach the wire
        expect(Object.keys(shared.find((r) => r.id === "b-up-1") ?? {})).not.toContain("visibility")
        expect(ids(shared)).not.toContain("b-core-1")
    })

    it("search_library: collectionId filter (stamped and derived ids)", async () => {
        const nava = await searchLibrary(ADMIN, { query: "", limit: 50, collectionId: `${NAVA}__nava` }, CRC)
        expect(ids(nava)).toEqual(["c-nava-1", "c-nava-2"])
        const core = await searchLibrary(ADMIN, { query: "", limit: 50, collectionId: "crc__core" }, CRC)
        expect(ids(core)).toEqual(["c-core-1", "c-core-2"])
        const blUploads = await searchLibrary(
            ADMIN,
            { query: "", limit: 50, includeShared: true, collectionId: `${BL}__uploads` },
            CRC,
        )
        expect(ids(blUploads)).toEqual(["b-up-1"])
    })

    it("list_library: default = own + assigned; includeShared; collectionId; ownerOrgId", async () => {
        const def = await listLibrary(ADMIN, { limit: 200 }, CRC)
        if ("ok" in def) throw new Error("list_library failed")
        expect(ids(def.rows)).toContain("c-nava-1")
        expect(ids(def.rows)).not.toContain("b-up-1")
        expect(def.rows.find((r) => r.fileId === "c-nava-1")?.ownerOrgId).toBe(NAVA)
        expect(def.rows.find((r) => r.fileId === "c-core-1")?.ownerOrgId).toBe(CRC)

        const shared = await listLibrary(ADMIN, { limit: 200, includeShared: true }, CRC)
        if ("ok" in shared) throw new Error("list_library failed")
        expect(ids(shared.rows)).toEqual([...ids(def.rows), "b-up-1"].sort())
        expect(shared.total).toBe(def.total + 1)
        expect(shared.rows.find((r) => r.fileId === "b-up-1")?.ownerOrgId).toBe(BL)

        const nava = await listLibrary(ADMIN, { limit: 200, collectionId: `${NAVA}__nava` }, CRC)
        if ("ok" in nava) throw new Error("list_library failed")
        expect(ids(nava.rows)).toEqual(["c-nava-1", "c-nava-2"])
    })

    it("BL sees none of the crc / nava rows, with or without includeShared", async () => {
        const s = await searchLibrary(ADMIN, { query: "", limit: 50, includeShared: true }, BL)
        expect(ids(s).every((id) => id.startsWith("b-"))).toBe(true)
        expect(ids(s)).toContain("b-up-1")
        const l = await listLibrary(ADMIN, { limit: 200, includeShared: true, includeNonChartHealthy: true }, BL)
        if ("ok" in l) throw new Error("list_library failed")
        expect(ids(l.rows).every((id) => id.startsWith("b-"))).toBe(true)
        expect(await getSong(ADMIN, { id: "c-nava-1" }, BL)).toBeNull()
        const chords = await searchChartText(ADMIN, { query: "Am7", scope: "chords" }, BL)
        if (!("results" in chords)) throw new Error("search_chart_text failed")
        expect(chords.results.map((m) => m.chartId)).toEqual(["b-up-1"])
    })

    it("get_song: a shared row is visible (via the index stamp) with ownerOrgId; an unshared one is not", async () => {
        const s = await getSong(ADMIN, { id: "b-up-1" }, CRC)
        expect(s?.id).toBe("b-up-1")
        expect(s?.ownerOrgId).toBe(BL)
        expect((await getSong(ADMIN, { id: "c-nava-1" }, CRC))?.ownerOrgId).toBe(NAVA)
        expect(await getSong(ADMIN, { id: "b-core-1" }, CRC)).toBeNull()
    })

    it("search_chart_text sees shared charts", async () => {
        const chords = await searchChartText(ADMIN, { query: "Am7", scope: "chords" }, CRC)
        if (!("results" in chords)) throw new Error("search_chart_text failed")
        const got = chords.results.map((m) => m.chartId).sort()
        expect(got).toEqual(["b-up-1", "c-core-1", "c-nava-1"])
        expect(chords.results.find((m) => m.chartId === "b-up-1")?.ownerOrgId).toBe(BL)
        const meta = await searchChartText(ADMIN, { query: "Libi", scope: "metadata" }, CRC)
        if (!("results" in meta)) throw new Error("search_chart_text failed")
        expect(meta.results.map((m) => m.chartId)).toEqual(["c-nava-1"])
    })

    it("get_chart_status: a shared row reads as present; an unshared one does not", async () => {
        const shared = await getChartStatus(ADMIN, { fileId: "b-up-1" }, CRC)
        expect((shared as { health?: { status?: string } }).health?.status).toBe("ok")
        const hidden = await getChartStatus(ADMIN, { fileId: "b-core-1" }, CRC)
        expect((hidden as { health?: { status?: string } }).health?.status).toBe("bytes_without_index_row")
    })

    it("download_chart: shared row served; unshared row refused as not found", async () => {
        const ok = await downloadChart(ADMIN, { fileId: "b-up-1" }, CRC)
        expect((ok as { ok?: boolean }).ok).toBe(true)
        expect(code(await downloadChart(ADMIN, { fileId: "b-core-1" }, CRC))).toBe("chart_not_found")
    })

    // ─── writes ─────────────────────────────────────────────────────────

    it("writes on a shared row return not_owner with the exact message", async () => {
        const navaName = await tenantDisplayName(NAVA, db())
        expect(navaName).toBe("Nava Tehila")
        const blName = await tenantDisplayName(BL, db())
        const navaMsg = `Niggun Tishrei belongs to ${navaName}; you can use it but not change it.`
        const blMsg = `Lecha Dodi Nigun (Nava) belongs to ${blName}; you can use it but not change it.`

        const upd = await updateSong(ADMIN, { id: "b-up-1", key: "E" }, CRC)
        expect(code(upd)).toBe("not_owner")
        expect(message(upd)).toBe(blMsg)
        expect((upd as { ownerOrgId?: string }).ownerOrgId).toBe(BL)

        const mark = await markChartStatus(ADMIN, { fileId: "c-nava-2", toStatus: "archived", force: true }, CRC)
        expect(code(mark)).toBe("not_owner")
        expect(message(mark)).toBe(navaMsg)

        const edit = await editEnrichment(
            ADMIN,
            { rowId: "c-nava-2", edits: { tags: ["x"] }, dryRun: false, force: true },
            CRC,
        )
        expect(code(edit)).toBe("not_owner")
        expect(message(edit)).toBe(navaMsg)

        const del = await deleteChart(ADMIN, { fileId: "c-nava-2" }, CRC)
        expect(code(del)).toBe("not_owner")
        expect(message(del)).toBe(navaMsg)

        // Nothing changed.
        const row = (await db().collection("library_index").doc("c-nava-2").get()).data()
        expect(row?.status).toBe("active")
        expect(row?.tags).toBeUndefined()
        expect((await db().collection("library_index").doc("b-up-1").get()).data()?.key).toBe("Dm")
    })

    it("writes on a row that is NOT shared keep the old not-found answers", async () => {
        expect(code(await updateSong(ADMIN, { id: "b-core-1", key: "E" }, CRC))).toBe("song_not_found")
        expect(
            code(await markChartStatus(ADMIN, { fileId: "b-core-1", toStatus: "archived", force: true }, CRC)),
        ).toBe("row_not_found")
        expect(code(await deleteChart(ADMIN, { fileId: "b-core-1" }, CRC))).toBe("chart_not_found")
        expect((await db().collection("library_index").doc("b-core-1").get()).exists).toBe(true)
    })

    it("delete_chart: another tenant's UPCOMING use refuses (archive allowed); a PAST use does not", async () => {
        // CRC's upcoming setlist uses BL's shared chart.
        await db().collection("tracks").doc("t-crc-bl").set({
            setlistId: "s-crc-up",
            songId: "b-up-1",
            fileId: "b-up-1",
            title: "Lecha Dodi Nigun (Nava)",
            order: 2,
            type: "song",
            orgId: CRC,
        })
        // Archive is not blocked by another tenant's use.
        const arch = await markChartStatus(ADMIN, { fileId: "b-up-1", toStatus: "archived", force: true }, BL)
        expect(code(arch)).toBeUndefined()
        expect((await db().collection("library_index").doc("b-up-1").get()).data()?.status).toBe("archived")

        const refused = await deleteChart(ADMIN, { fileId: "b-up-1" }, BL)
        expect(code(refused)).toBe("delete_refused_shared_in_use")
        expect(message(refused)).toMatch(/^Lecha Dodi Nigun \(Nava\) is in 1 upcoming setlist of other tenants \(/)
        expect(message(refused)).toContain("CRC upcoming on 2099-01-02")
        expect(message(refused)).toContain("Archive it instead (mark_chart_status toStatus archived)")
        const uses = (refused as unknown as { uses: Array<{ setlistId: string; orgId: string }> }).uses
        expect(uses).toEqual([expect.objectContaining({ setlistId: "s-crc-up", orgId: CRC })])
        expect((await db().collection("library_index").doc("b-up-1").get()).exists).toBe(true)

        // The same use on a PAST setlist does not hold the chart.
        await db().collection("tracks").doc("t-crc-bl").update({ setlistId: "s-crc-past" })
        const deleted = await deleteChart(ADMIN, { fileId: "b-up-1" }, BL)
        expect((deleted as { ok?: boolean }).ok).toBe(true)
        expect((await db().collection("library_index").doc("b-up-1").get()).exists).toBe(false)
    })
})
