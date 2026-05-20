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

/**
 * Cycle-9-fixes Lane F2 — C9I2-001: dead-byte rows must not silently surface
 * as clean/bindable in search_library, and add_track_to_setlist must refuse
 * binding a chart whose bytes are dead (the Lechu-Goldman class) unless forced.
 *
 * Storage/Drive aren't in the firestore+auth emulator, so the byte-health
 * probe (getChartHealth) is mocked per-fileId; the catalog rows + setlist
 * writes are real Firestore.
 */
const mockGetChartHealth = vi.fn()
vi.mock("@/lib/file-fetcher", () => ({
    getChartHealth: (...args: unknown[]) => mockGetChartHealth(...args),
    fetchFileById: vi.fn(),
}))

import { searchLibrary } from "../tools/library"
import { addTrackToSetlist } from "../tools/setlist-write"

const OK = { status: "ok" as const, source: "firebase-storage" as const }
const MISSING = {
    status: "missing" as const,
    reason: "Not in Storage; Drive 404",
}
const SHORTCUT = {
    status: "shortcut_unresolved" as const,
    reason: "Drive metadata mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId.",
    mimeType: "application/vnd.google-apps.shortcut",
    error: "shortcut",
}
const NEEDS_SYNC = {
    status: "needs_storage_sync" as const,
    reason: "drive_only",
    mimeType: "application/pdf",
}

describe("Cycle-9 F2 — catalog dead-byte guard (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
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
        app = getApps()[0] ?? initializeApp({ projectId: "demo-cycle9-catalog" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["songs", "library_index", "setlists", "tracks", "users"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", displayName: "Daniel" })
        mockGetChartHealth.mockReset()
    })

    // ─── search_library ──────────────────────────────────────────────────

    it("search hides a dead-byte (missing) row by default; healthy row stays clean", async () => {
        await seedSong("chart-ok", "Lechu Neranena")
        await seedIndex("chart-ok", { name: "Lechu Neranena.pdf", mimeType: "application/pdf" })
        await seedSong("chart-dead", "Lechu Goldman")
        await seedIndex("chart-dead", { name: "Lechu Goldman.pdf", mimeType: "application/pdf" })

        mockGetChartHealth.mockImplementation(async (fileId: string) =>
            fileId === "chart-ok" ? OK : MISSING,
        )

        const r = await searchLibrary(ANY_UID, { query: "Lechu" })
        expect(r.map((row) => row.id)).toEqual(["chart-ok"])
        // Healthy row carries no chartHealth annotation (lean wire shape).
        expect(r[0].chartHealth).toBeUndefined()
    })

    it("includeUnbindable surfaces the dead row flagged bindable:false", async () => {
        await seedSong("chart-dead", "Lechu Goldman")
        await seedIndex("chart-dead", { name: "Lechu Goldman.pdf", mimeType: "application/pdf" })

        mockGetChartHealth.mockResolvedValue(MISSING)

        const r = await searchLibrary(ANY_UID, {
            query: "Lechu",
            includeUnbindable: true,
        })
        expect(r.map((row) => row.id)).toEqual(["chart-dead"])
        expect(r[0].chartHealth).toMatchObject({
            status: "missing",
            bindable: false,
        })
        expect(r[0].chartHealth?.reason).toBeTruthy()
    })

    it("a pdf-labeled row whose bytes resolve to a shortcut is unbindable (flagged via includeUnbindable)", async () => {
        // A library_index row whose stored mime is application/pdf (so it
        // passes the non-chart-artifact filter) but whose bytes resolve to an
        // unembeddable Drive shortcut at probe time. (Rows whose stored mime
        // is itself application/vnd.google-apps.shortcut are already hidden
        // upstream by isNonChartArtifactShape, before the health probe.)
        await seedSong("chart-shortcut", "Tu Bishvat")
        await seedIndex("chart-shortcut", {
            name: "Tu Bishvat.pdf",
            mimeType: "application/pdf",
        })

        mockGetChartHealth.mockResolvedValue(SHORTCUT)

        const hidden = await searchLibrary(ANY_UID, { query: "Tu Bishvat" })
        expect(hidden).toEqual([])

        const shown = await searchLibrary(ANY_UID, {
            query: "Tu Bishvat",
            includeUnbindable: true,
        })
        expect(shown.map((r) => r.id)).toEqual(["chart-shortcut"])
        expect(shown[0].chartHealth).toMatchObject({
            status: "shortcut_unresolved",
            bindable: false,
        })
    })

    it("needs_storage_sync row stays bindable but flagged (serves via Drive fallback)", async () => {
        await seedSong("chart-sync", "Oseh Shalom")
        await seedIndex("chart-sync", { name: "Oseh Shalom.pdf", mimeType: "application/pdf" })

        mockGetChartHealth.mockResolvedValue(NEEDS_SYNC)

        const r = await searchLibrary(ANY_UID, { query: "Oseh" })
        expect(r.map((row) => row.id)).toEqual(["chart-sync"])
        expect(r[0].chartHealth).toMatchObject({
            status: "needs_storage_sync",
            bindable: true,
        })
    })

    it("passes the W-02 library_index mimeType as the health-probe hint", async () => {
        await seedSong("chart-x", "Oseh Shalom")
        await seedIndex("chart-x", {
            name: "Oseh Shalom.pdf",
            mimeType: "application/pdf",
        })
        mockGetChartHealth.mockResolvedValue(OK)

        await searchLibrary(ANY_UID, { query: "Oseh" })
        expect(mockGetChartHealth).toHaveBeenCalledWith("chart-x", "application/pdf")
    })

    // ─── add_track_to_setlist ────────────────────────────────────────────

    async function seedSetlist(id: string) {
        await db().collection("setlists").doc(id).set({ name: "Friday", ownerId: ADMIN })
    }

    it("refuses binding a missing-byte chart with chart_unbindable", async () => {
        await seedSetlist("set1")
        await seedSong("chart-dead", "Lechu Goldman")
        await seedIndex("chart-dead", { name: "Lechu Goldman.pdf", mimeType: "application/pdf" })
        mockGetChartHealth.mockResolvedValue(MISSING)

        const r = await addTrackToSetlist(ADMIN, {
            setlistId: "set1",
            songId: "chart-dead",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "chart_unbindable" },
            chartStatus: "missing",
        })
        // No track was written.
        const tracks = await db()
            .collection("tracks")
            .where("setlistId", "==", "set1")
            .get()
        expect(tracks.empty).toBe(true)
    })

    it("refuses binding a shortcut chart with chart_unbindable", async () => {
        await seedSetlist("set1")
        await seedSong("chart-shortcut", "Tu Bishvat")
        await seedIndex("chart-shortcut", {
            name: "Tu Bishvat.pdf",
            mimeType: "application/vnd.google-apps.shortcut",
        })
        mockGetChartHealth.mockResolvedValue(SHORTCUT)

        const r = await addTrackToSetlist(ADMIN, {
            setlistId: "set1",
            songId: "chart-shortcut",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "chart_unbindable" },
            chartStatus: "shortcut_unresolved",
        })
    })

    it("force:true binds a dead-byte chart anyway", async () => {
        await seedSetlist("set1")
        await seedSong("chart-dead", "Lechu Goldman")
        await seedIndex("chart-dead", { name: "Lechu Goldman.pdf", mimeType: "application/pdf" })
        mockGetChartHealth.mockResolvedValue(MISSING)

        const r = await addTrackToSetlist(ADMIN, {
            setlistId: "set1",
            songId: "chart-dead",
            force: true,
        })
        expect("ok" in r && r.ok).toBe(true)
        const tracks = await db()
            .collection("tracks")
            .where("setlistId", "==", "set1")
            .get()
        expect(tracks.size).toBe(1)
        expect(tracks.docs[0].data().fileId).toBe("chart-dead")
    })

    it("binds a healthy chart normally (and reads library_index mime as the probe hint)", async () => {
        await seedSetlist("set1")
        await seedSong("chart-ok", "Oseh Shalom")
        await seedIndex("chart-ok", { name: "Oseh Shalom.pdf", mimeType: "application/pdf" })
        mockGetChartHealth.mockResolvedValue(OK)

        const r = await addTrackToSetlist(ADMIN, {
            setlistId: "set1",
            songId: "chart-ok",
        })
        expect("ok" in r && r.ok).toBe(true)
        expect(mockGetChartHealth).toHaveBeenCalledWith("chart-ok", "application/pdf")
    })

    it("needs_storage_sync chart binds without force (still serves)", async () => {
        await seedSetlist("set1")
        await seedSong("chart-sync", "Hashkivenu")
        await seedIndex("chart-sync", { name: "Hashkivenu.pdf", mimeType: "application/pdf" })
        mockGetChartHealth.mockResolvedValue(NEEDS_SYNC)

        const r = await addTrackToSetlist(ADMIN, {
            setlistId: "set1",
            songId: "chart-sync",
        })
        expect("ok" in r && r.ok).toBe(true)
    })
})
