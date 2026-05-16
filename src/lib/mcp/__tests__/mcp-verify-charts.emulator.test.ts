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

import {
    getChartStatus,
    verifySetlistCharts,
} from "../tools/library-verify"

/**
 * MCP chart-verification tools against the Firebase emulator.
 *
 * Covers the contract from the 2026-05-16 Bar Mitzvah session punch-list:
 *  A-001 — agent can probe chart renderability without downloading bytes
 *  B-002 — silent broken bonds become visible
 *  L-001 — orphaned library rows surface via per-row health
 */
describe("MCP chart-health tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "alex-musician"

    function db() {
        return getFirestore(app)
    }

    async function seedTrack(
        id: string,
        setlistId: string,
        order: number,
        fields: Record<string, unknown>,
    ): Promise<void> {
        await db()
            .collection("tracks")
            .doc(id)
            .set({ setlistId, order, ...fields })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-verify-charts" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks", "users"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", displayName: "Daniel" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ role: "musician", displayName: "Alex" })
        mockGetChartHealth.mockReset()
    })

    it("get_chart_status returns the health envelope for any caller", async () => {
        mockGetChartHealth.mockResolvedValueOnce({
            status: "ok",
            source: "firebase-storage",
            mimeType: "application/pdf",
        })
        const r = await getChartStatus(MUSICIAN, { fileId: "song-oseh" })
        expect(r).toMatchObject({
            ok: true,
            fileId: "song-oseh",
            health: { status: "ok" },
        })
    })

    it("get_chart_status surfaces missing reason", async () => {
        mockGetChartHealth.mockResolvedValueOnce({
            status: "missing",
            reason: "Drive: file not found",
        })
        const r = await getChartStatus(ADMIN, { fileId: "ghost" })
        expect(r).toMatchObject({
            ok: true,
            fileId: "ghost",
            health: { status: "missing", reason: "Drive: file not found" },
        })
    })

    it("get_chart_status rejects empty fileId", async () => {
        const r = await getChartStatus(ADMIN, { fileId: "  " })
        expect(r).toEqual({ error: "fileId is required" })
    })

    it("verify_setlist_charts returns per-row health + aggregate counts", async () => {
        const id = "set-verify-1"
        await db().collection("setlists").doc(id).set({
            name: "Verify Test",
            ownerId: ADMIN,
        })
        await seedTrack("t1", id, 0, {
            title: "Oseh Shalom",
            songId: "song-oseh",
            fileId: "song-oseh",
            type: "song",
        })
        await seedTrack("t2", id, 1, {
            title: "Broken Hashkivenu",
            songId: "song-broken",
            fileId: "song-broken",
            type: "song",
        })
        await seedTrack("t3", id, 2, {
            title: "Kabbalat Shabbat",
            type: "header",
        })

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "song-oseh"
                ? { status: "ok", source: "firebase-storage" }
                : {
                      status: "missing",
                      reason: "library_index row points at a deleted Drive file",
                  },
        )

        const r = await verifySetlistCharts(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.trackCount).toBe(3)
        expect(r.bondedCount).toBe(2)
        expect(r.okCount).toBe(1)
        expect(r.missingCount).toBe(1)
        expect(r.unreachableCount).toBe(0)

        const byTrack = new Map(r.rows.map((row) => [row.trackId, row]))
        expect(byTrack.get("t1")?.health.status).toBe("ok")
        expect(byTrack.get("t2")?.health.status).toBe("missing")
        // Header row is unbonded — surfaced as a distinct status so the
        // agent can tell "no chart bound" from "chart missing".
        expect(byTrack.get("t3")?.health.status).toBe("unbonded")
    })

    it("verify_setlist_charts returns Setlist not found for ghost id", async () => {
        const r = await verifySetlistCharts(ADMIN, { setlistId: "ghost" })
        expect(r).toEqual({ error: "Setlist not found" })
    })

    it("verify_setlist_charts rejects empty setlistId", async () => {
        const r = await verifySetlistCharts(ADMIN, { setlistId: "" })
        expect(r).toEqual({ error: "setlistId is required" })
    })

    it("markOrphaned: true persists status:'orphaned' on missing rows (L-001)", async () => {
        const id = "set-verify-mark"
        await db().collection("setlists").doc(id).set({
            name: "Mark Test",
            ownerId: ADMIN,
        })
        await seedTrack("ta", id, 0, {
            title: "Healthy",
            songId: "song-healthy",
            fileId: "song-healthy",
            type: "song",
        })
        await seedTrack("tb", id, 1, {
            title: "Definitively Missing",
            songId: "song-missing",
            fileId: "song-missing",
            type: "song",
        })
        await seedTrack("tc", id, 2, {
            title: "Just Slow",
            songId: "song-flaky",
            fileId: "song-flaky",
            type: "song",
        })
        // Seed catalog rows so we can verify the persisted status flip.
        await db().collection("library_index").doc("song-healthy").set({
            name: "Healthy",
            status: "active",
        })
        await db().collection("library_index").doc("song-missing").set({
            name: "Definitively Missing",
            status: "active",
        })
        await db().collection("library_index").doc("song-flaky").set({
            name: "Just Slow",
            status: "active",
        })
        await db().collection("songs").doc("song-missing").set({
            title: "Definitively Missing",
            status: "active",
        })

        mockGetChartHealth.mockImplementation(async (fileId: string) => {
            if (fileId === "song-healthy") {
                return { status: "ok", source: "firebase-storage" }
            }
            if (fileId === "song-missing") {
                return { status: "missing", reason: "Drive: file not found" }
            }
            return { status: "unreachable", error: "ETIMEDOUT" }
        })

        const r = await verifySetlistCharts(ADMIN, {
            setlistId: id,
            markOrphaned: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.missingCount).toBe(1)
        expect(r.unreachableCount).toBe(1)
        // Only the definitively-missing row got marked — `unreachable` rows
        // (transient blips) are deliberately spared.
        expect(r.orphanedMarked).toBe(1)

        const idxMissing = (
            await db().collection("library_index").doc("song-missing").get()
        ).data()!
        expect(idxMissing.status).toBe("orphaned")
        const songMissing = (
            await db().collection("songs").doc("song-missing").get()
        ).data()!
        expect(songMissing.status).toBe("orphaned")

        // Healthy and flaky rows untouched.
        const idxHealthy = (
            await db().collection("library_index").doc("song-healthy").get()
        ).data()!
        expect(idxHealthy.status).toBe("active")
        const idxFlaky = (
            await db().collection("library_index").doc("song-flaky").get()
        ).data()!
        expect(idxFlaky.status).toBe("active")
    })

    it("markOrphaned defaults to false — missing rows surface in the report but stay 'active' in the catalog", async () => {
        const id = "set-verify-no-mark"
        await db().collection("setlists").doc(id).set({
            name: "No Mark Test",
            ownerId: ADMIN,
        })
        await seedTrack("tx", id, 0, {
            title: "Missing But Spared",
            songId: "song-spare",
            fileId: "song-spare",
            type: "song",
        })
        await db().collection("library_index").doc("song-spare").set({
            name: "Missing But Spared",
            status: "active",
        })

        mockGetChartHealth.mockResolvedValue({
            status: "missing",
            reason: "Drive: file not found",
        })

        const r = await verifySetlistCharts(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.missingCount).toBe(1)
        expect(r.orphanedMarked).toBe(0)

        const idx = (
            await db().collection("library_index").doc("song-spare").get()
        ).data()!
        expect(idx.status).toBe("active")
    })

    it("phantom bonds: fileId with no library_index row counted separately, never written (F-04)", async () => {
        // 2026-05-16 bugstomp F-04: a track bonded to a fileId that has
        // NO library_index row at all (a "phantom bond" — usually from a
        // typo or stale songId) used to (a) get a blank {status:"orphaned"}
        // doc created via batch.set + merge, polluting the catalog with
        // empty stub rows, AND (b) inflate orphanedMarked to match
        // missingCount — so operators believed they'd cleaned up rows
        // that weren't there. Both behaviors removed; phantomBonds now
        // counts these distinctly and no write happens.
        const id = "set-verify-phantom"
        await db().collection("setlists").doc(id).set({
            name: "Phantom Test",
            ownerId: ADMIN,
        })
        // Real catalog row + matching missing health → orphanedMarked.
        await seedTrack("treal", id, 0, {
            title: "Real Orphan",
            songId: "song-real-orphan",
            fileId: "song-real-orphan",
            type: "song",
        })
        await db().collection("library_index").doc("song-real-orphan").set({
            name: "Real Orphan",
            status: "active",
        })
        // Phantom bond: no library_index row for this fileId.
        await seedTrack("tphantom", id, 1, {
            title: "Phantom Bond",
            songId: "phantom-songid-xyz",
            fileId: "phantom-songid-xyz",
            type: "song",
        })

        mockGetChartHealth.mockResolvedValue({
            status: "missing",
            reason: "library_index row points at a deleted Drive file",
        })

        const r = await verifySetlistCharts(ADMIN, {
            setlistId: id,
            markOrphaned: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.missingCount).toBe(2)
        // Only the row with a real catalog entry was flipped — the phantom
        // is counted separately.
        expect(r.orphanedMarked).toBe(1)
        expect(r.phantomBonds).toBe(1)

        // Real catalog row was flipped.
        const real = (
            await db().collection("library_index").doc("song-real-orphan").get()
        ).data()!
        expect(real.status).toBe("orphaned")

        // No stub library_index row was created for the phantom — the
        // pollution path is closed.
        const phantom = await db()
            .collection("library_index")
            .doc("phantom-songid-xyz")
            .get()
        expect(phantom.exists).toBe(false)

        // No stub songs row either.
        const phantomSong = await db()
            .collection("songs")
            .doc("phantom-songid-xyz")
            .get()
        expect(phantomSong.exists).toBe(false)
    })

    it("phantomBonds reports even without markOrphaned — visibility for hygiene triage (F-04)", async () => {
        // phantomBonds is observability data, not a write — so it surfaces
        // regardless of markOrphaned. Operators auditing a setlist need to
        // see phantom bonds independent of whether they're ready to commit
        // to writes.
        const id = "set-verify-phantom-noop"
        await db().collection("setlists").doc(id).set({
            name: "Phantom Read",
            ownerId: ADMIN,
        })
        await seedTrack("tp", id, 0, {
            title: "Phantom Read",
            songId: "another-phantom-id",
            fileId: "another-phantom-id",
            type: "song",
        })

        mockGetChartHealth.mockResolvedValue({
            status: "missing",
            reason: "Drive: file not found",
        })

        const r = await verifySetlistCharts(ADMIN, { setlistId: id })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.missingCount).toBe(1)
        expect(r.orphanedMarked).toBe(0)
        expect(r.phantomBonds).toBe(1)

        const phantom = await db()
            .collection("library_index")
            .doc("another-phantom-id")
            .get()
        expect(phantom.exists).toBe(false)
    })
})
