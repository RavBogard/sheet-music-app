import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

vi.mock("@/lib/org/access", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/org/access")>()
    return {
        ...actual,
        readTenantRole: async (db: FirebaseFirestore.Firestore, uid: string, org: string) =>
            uid === `${org}-lead` ? "band_leader" : actual.readTenantRole(db, uid, org),
    }
})
vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null) }))

import { applyRecordingTemposTool, type ApplyRecordingTemposResult } from "../tools/recording-tempos"
import { updateSong } from "../tools/song-metadata"
import { mirrorLegacyRoles } from "@/test-stubs/mirror-legacy-roles"
import { applyOps, checkRowFields } from "@/lib/setlist-ops"
import { copyableRow } from "@/lib/setlist-ops/create"
import { saveSongDefaults } from "@/lib/library/catalog-mirror"

/**
 * apply_recording_tempos against the emulator: a real run fills empty bpm
 * fields through the setlist-ops maintenance helper (setlist + row versions
 * bump) and applySongMetadata (both catalog docs, with the marker), leaves a
 * typed bpm and another tenant's rows alone, updates its own earlier fill
 * when a more confident take arrives, and a person's update_song clears the
 * marker so the value is never touched again.
 */
describe("apply_recording_tempos (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const get = async (col: string, id: string) => (await db().collection(col).doc(id).get()).data()!
    const T0 = Timestamp.fromMillis(1_000)
    const tempo = (bpm: number, confidence: number) => ({ bpm, alt: bpm / 2, confidence, confident: confidence >= 0.5, method: "m" })

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-recording-tempos" })
        const d = db()
        await d.collection("setlists").doc("rt-sl").set({ id: "rt-sl", orgId: "crc", name: "Shabbat", version: 3, updatedAt: T0 })
        await d.collection("setlists").doc("rt-bl").set({ id: "rt-bl", orgId: "brotherslazaroff", name: "Gig", version: 7, updatedAt: T0 })
        const row = (id: string, setlistId: string, orgId: string, extra: Record<string, unknown> = {}) =>
            d.collection("tracks").doc(id).set({ id, setlistId, orgId, order: 0, type: "song", songId: "rt-song", version: 1, updatedAt: T0, ...extra })
        await row("rt-empty", "rt-sl", "crc")
        await row("rt-typed", "rt-sl", "crc", { bpm: 120 })
        await row("rt-blrow", "rt-bl", "brotherslazaroff")
        await d.collection("songs").doc("rt-song").set({ title: "Lecha Dodi", orgId: "crc", defaults: { key: "Dm" } })
        await d.collection("library_index").doc("rt-song").set({ name: "Lecha Dodi", orgId: "crc", status: "active" })
        await d.collection("recordings").doc("rt-rec1").set({ orgId: "crc", songId: "rt-song", title: "t", storagePath: "recordings/rt-rec1.mp3", createdBy: "ingest", createdAt: "2026-01-01", tempo: tempo(92.3, 0.6) })
        await d.collection("users").doc("rt-admin").set({ role: "admin", email: "a@x.org" })
        await mirrorLegacyRoles(d, { migrate: true })
    })
    afterAll(async () => {
        if (app) await deleteApp(app)
    })

    it("fills empty fields through the maintenance helper and the songs write path; typed and other-tenant rows untouched", async () => {
        const plan = (await applyRecordingTemposTool("crc-lead", {}, "crc")) as ApplyRecordingTemposResult
        expect(plan.dryRun).toBe(true)
        expect((await get("tracks", "rt-empty")).bpm).toBeUndefined()

        const r = (await applyRecordingTemposTool("crc-lead", { dryRun: false, force: true }, "crc")) as ApplyRecordingTemposResult
        expect(r).toMatchObject({ applied: true, written: { songs: 1, rows: 1, setlists: 1 } })

        expect(await get("tracks", "rt-empty")).toMatchObject({ bpm: 92, bpmSource: "recording", bpmSourceRecordingId: "rt-rec1", bpmSourceValue: 92, version: 2 })
        expect(await get("setlists", "rt-sl")).toMatchObject({ version: 4 })
        expect(await get("tracks", "rt-typed")).toMatchObject({ bpm: 120, version: 1 })
        expect((await get("tracks", "rt-typed")).bpmSource).toBeUndefined()
        expect(await get("tracks", "rt-blrow")).toMatchObject({ version: 1 })
        expect((await get("tracks", "rt-blrow")).bpm).toBeUndefined()
        expect(await get("setlists", "rt-bl")).toMatchObject({ version: 7 })
        expect((await get("songs", "rt-song")).defaults).toMatchObject({ key: "Dm", bpm: 92, bpmSource: "recording", bpmSourceRecordingId: "rt-rec1" })
        expect(await get("library_index", "rt-song")).toMatchObject({ bpm: 92, bpmSource: "recording", bpmSourceValue: 92 })
    })

    it("a more confident take updates its own fill; a second run with nothing new writes nothing", async () => {
        await db().collection("recordings").doc("rt-rec2").set({ orgId: "crc", songId: "rt-song", title: "t", storagePath: "recordings/rt-rec2.mp3", createdBy: "ingest", createdAt: "2026-02-01", tempo: tempo(95.8, 0.9) })
        const r = (await applyRecordingTemposTool("crc-lead", { dryRun: false, force: true }, "crc")) as ApplyRecordingTemposResult
        expect(r.written).toEqual({ songs: 1, rows: 1, setlists: 1 })
        expect(await get("tracks", "rt-empty")).toMatchObject({ bpm: 96, bpmSourceRecordingId: "rt-rec2", version: 3 })
        expect(await get("library_index", "rt-song")).toMatchObject({ bpm: 96, bpmSourceRecordingId: "rt-rec2" })
        expect(await get("tracks", "rt-typed")).toMatchObject({ bpm: 120, version: 1 })

        const again = (await applyRecordingTemposTool("crc-lead", { dryRun: false, force: true }, "crc")) as ApplyRecordingTemposResult
        expect(again.written).toEqual({ songs: 0, rows: 0, setlists: 0 })
        expect(await get("setlists", "rt-sl")).toMatchObject({ version: 5 })
    })

    it("a person's update_song clears the marker, and the value is never overwritten afterwards", async () => {
        const res = await updateSong("rt-admin", { id: "rt-song", bpm: 100 }, "crc")
        expect(res).toMatchObject({ ok: true })
        const idx = await get("library_index", "rt-song")
        expect(idx.bpm).toBe(100)
        expect(idx.bpmSource).toBeUndefined()
        expect((await get("songs", "rt-song")).defaults.bpmSource).toBeUndefined()
        await db().collection("recordings").doc("rt-rec3").set({ orgId: "crc", songId: "rt-song", title: "t", storagePath: "recordings/rt-rec3.mp3", createdBy: "ingest", createdAt: "2026-03-01", tempo: tempo(110, 0.99) })
        await applyRecordingTemposTool("crc-lead", { dryRun: false, force: true }, "crc")
        expect((await get("library_index", "rt-song")).bpm).toBe(100)
    })

    it("a person's bpm write clears the row marker even when the number is the same; clients cannot send the marker; copies keep it", async () => {
        const auto = await get("tracks", "rt-empty")
        // The earlier run (rec3, the most confident take) updated this auto-filled row to 110.
        expect(auto).toMatchObject({ bpm: 110, bpmSource: "recording", bpmSourceRecordingId: "rt-rec3" })
        // A server-side copy (clone / duplicate) keeps the marker.
        expect(copyableRow(auto)).toMatchObject({ bpm: 110, bpmSource: "recording", bpmSourceRecordingId: "rt-rec3", bpmSourceValue: 110 })
        // A client may not write the marker.
        expect(checkRowFields({ bpmSource: "recording" }, "set").ok).toBe(false)

        await db().collection("memberships").doc("crc__rt-editor").set({ uid: "rt-editor", tenantId: "crc", role: "band_leader" })
        const r = await applyOps(db(), "rt-editor", "rt-sl", {
            clientBatchId: `rt-${Date.now()}`,
            baseVersion: 0,
            ops: [{ kind: "editRow", rowId: "rt-empty", set: { bpm: 110 }, base: { bpm: 110 } }],
        })
        expect(r).toMatchObject({ ok: true })
        const after = await get("tracks", "rt-empty")
        expect(after.bpm).toBe(110)
        expect(after.bpmSource).toBeUndefined()
        expect(after.bpmSourceRecordingId).toBeUndefined()
        expect(after.bpmSourceValue).toBeUndefined()
        // Now it is the person's: a more confident take leaves it alone.
        await db().collection("recordings").doc("rt-rec4").set({ orgId: "crc", songId: "rt-song", title: "t", storagePath: "recordings/rt-rec4.mp3", createdBy: "ingest", createdAt: "2026-04-01", tempo: tempo(80, 1) })
        await applyRecordingTemposTool("crc-lead", { dryRun: false, force: true }, "crc")
        expect((await get("tracks", "rt-empty")).bpm).toBe(110)
        expect((await get("tracks", "rt-empty")).bpmSource).toBeUndefined()
    })

    it("the browser's sticky bpm (POST /api/songs/defaults) clears the songs marker too", async () => {
        await db().collection("songs").doc("rt-sticky").set({ title: "S", orgId: "crc", defaults: { bpm: 90, bpmSource: "recording", bpmSourceRecordingId: "r", bpmSourceValue: 90 } })
        const r = await saveSongDefaults(db(), "crc", { songId: "rt-sticky", setlistId: null, patch: { bpm: 90 } })
        expect(r.ok).toBe(true)
        const d = (await get("songs", "rt-sticky")).defaults
        expect(d.bpm).toBe(90)
        expect(d.bpmSource).toBeUndefined()
        expect(d.bpmSourceValue).toBeUndefined()
    })
})
