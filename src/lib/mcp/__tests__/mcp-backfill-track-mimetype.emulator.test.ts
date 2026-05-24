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

import { backfillTrackMimetype } from "../tools/backfill-track-mimetype"

/**
 * cowork #2/#7 — `backfill_track_mimetype` trusted-leader hygiene backfill.
 *
 * Heals the denormalized `mimeType` cache on LEGACY setlist `tracks` rows that
 * were bonded before the picker / MCP bind paths started stamping it (the known
 * [[project_track_mimetype_gotcha]]). Each candidate (bonded `fileId`, no
 * `mimeType`) is stamped from its bonded `library_index/{fileId}` entry.
 *
 * Properties asserted:
 *  - role gate: musician refused (forbidden_role); admin AND band_leader pass
 *  - classification: bonded+missing → heal; bonded+present → alreadyHealthy;
 *    unbonded (no fileId) → not bonded; library entry absent/no-mime → skipped
 *  - dryRun default true; no writes
 *  - real run without force → refused:true, no writes (F-05)
 *  - force:true stamps mimeType + bumps version, preserves sibling fields
 *  - idempotent: a second force-run finds zero candidates (committed:0)
 *
 * Self-inclusion ([[feedback_self_inclusion_test_fixtures]]) does NOT apply:
 * the caller is a user uid and the operand set is `tracks` rows — the caller
 * can never appear in its own operand set.
 */
describe("MCP backfill_track_mimetype — cowork #2/#7 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "david-leader"
    const MUSICIAN = "musician-1"

    function db() {
        return getFirestore(app)
    }
    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }
    async function seedTrack(id: string, data: Record<string, unknown>) {
        await db().collection("tracks").doc(id).set(data)
    }
    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-backfill-track-mimetype" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["users", "tracks", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(LEADER, "band_leader")
        await seedUser(MUSICIAN, "musician")
    })

    it("refuses a musician caller with a forbidden_role envelope", async () => {
        await seedTrack("t1", { setlistId: "s1", fileId: "upload-1" })
        await seedIndex("upload-1", { mimeType: "text/plain" })

        const r = await backfillTrackMimetype(MUSICIAN, {})
        expect(r.ok).toBe(false)
        if (r.ok === false) {
            expect((r.error as { machine_code: string }).machine_code).toBe(
                "forbidden_role",
            )
        }
        // No write happened on refusal.
        const t1 = (await db().collection("tracks").doc("t1").get()).data() ?? {}
        expect(t1.mimeType).toBeUndefined()
    })

    it("allows a band_leader (trusted-leader gate) to run dryRun", async () => {
        await seedTrack("t1", { setlistId: "s1", fileId: "upload-1" })
        await seedIndex("upload-1", { mimeType: "text/plain" })

        const r = await backfillTrackMimetype(LEADER, {})
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.dryRun).toBe(true)
    })

    it("dryRun (default) classifies rows + writes nothing", async () => {
        // heal: bonded, no mimeType, library entry supplies one.
        await seedTrack("t-heal", {
            setlistId: "s1",
            title: "Hinei Ma Tov",
            fileId: "upload-text",
            key: "G",
        })
        await seedIndex("upload-text", { mimeType: "text/plain" })
        // alreadyHealthy: bonded + already carries a mimeType.
        await seedTrack("t-ok", {
            setlistId: "s1",
            fileId: "upload-pdf",
            mimeType: "application/pdf",
        })
        await seedIndex("upload-pdf", { mimeType: "application/pdf" })
        // unbonded: no fileId → not even bonded, never a candidate.
        await seedTrack("t-header", { setlistId: "s1", type: "header" })
        // skipped — library entry missing.
        await seedTrack("t-noidx", { setlistId: "s1", fileId: "ghost-id" })
        // skipped — library entry exists but has no mimeType.
        await seedTrack("t-nomime", { setlistId: "s1", fileId: "upload-nomime" })
        await seedIndex("upload-nomime", { name: "Legacy Drive Row" })

        const r = await backfillTrackMimetype(ADMIN, {})
        if (!r.ok) throw new Error("expected ok:true")

        expect(r.dryRun).toBe(true)
        expect(r.committed).toBe(0)
        expect(r.scannedTracks).toBe(5)
        expect(r.bondedTracks).toBe(4) // all but t-header
        expect(r.alreadyHealthy).toBe(1) // t-ok
        expect(r.heal.count).toBe(1)
        expect(r.heal.rows[0]).toMatchObject({
            trackId: "t-heal",
            setlistId: "s1",
            title: "Hinei Ma Tov",
            fileId: "upload-text",
            bondKind: "fileId",
            before: null,
            after: "text/plain",
        })
        expect(r.skipped.count).toBe(2)
        const skippedById = Object.fromEntries(
            r.skipped.rows.map((s) => [s.trackId, s.reason]),
        )
        expect(skippedById["t-noidx"]).toBe("library_entry_not_found")
        expect(skippedById["t-nomime"]).toBe("library_entry_no_mimetype")
        for (const s of r.skipped.rows) {
            expect(s.bondKind).toBe("fileId")
        }

        // Nothing written.
        const heal = (await db().collection("tracks").doc("t-heal").get()).data() ?? {}
        expect(heal.mimeType).toBeUndefined()
    })

    it("refuses a real run without force — returns plan with refused:true, no writes", async () => {
        await seedTrack("t-heal", { setlistId: "s1", fileId: "upload-text" })
        await seedIndex("upload-text", { mimeType: "text/plain" })

        const r = await backfillTrackMimetype(ADMIN, { dryRun: false })
        if (!r.ok) throw new Error("expected ok:true")
        expect(r.refused).toBe(true)
        expect(r.dryRun).toBe(false)
        expect(r.committed).toBe(0)
        expect(r.heal.count).toBe(1)

        const heal = (await db().collection("tracks").doc("t-heal").get()).data() ?? {}
        expect(heal.mimeType).toBeUndefined()
    })

    it("force:true stamps mimeType + bumps version, preserves sibling fields, and is idempotent", async () => {
        await seedTrack("t-heal", {
            setlistId: "s1",
            title: "Hinei Ma Tov",
            fileId: "upload-text",
            key: "G",
            version: 3,
        })
        await seedIndex("upload-text", { mimeType: "text/plain" })

        const r = await backfillTrackMimetype(ADMIN, { dryRun: false, force: true })
        if (!r.ok) throw new Error("expected ok:true")
        expect(r.refused).toBeUndefined()
        expect(r.committed).toBe(1)
        expect(r.heal.count).toBe(1)

        const after = (await db().collection("tracks").doc("t-heal").get()).data() ?? {}
        expect(after.mimeType).toBe("text/plain")
        // Sibling fields untouched (merge-set).
        expect(after.title).toBe("Hinei Ma Tov")
        expect(after.fileId).toBe("upload-text")
        expect(after.key).toBe("G")
        // W-04 version bump applied.
        expect(after.version).toBe(4)
        expect(typeof after.lastModifiedAt).toBe("string")

        // Idempotent: a second force-run finds zero candidates.
        const r2 = await backfillTrackMimetype(ADMIN, { dryRun: false, force: true })
        if (!r2.ok) throw new Error("expected ok:true")
        expect(r2.committed).toBe(0)
        expect(r2.heal.count).toBe(0)
        expect(r2.alreadyHealthy).toBe(1)
    })

    // ─── FINDING-6 (ingest-mutator-matrix) — audioFileId-only audio bonds ────
    // audio-viewer-f7 (`912ea2c3d`) introduced bonded `track.type:'song'` rows
    // carrying ONLY `audioFileId` (no `fileId`). The legacy candidate filter
    // (`if (!fileId) continue`) skipped them as unbonded; their `mimeType`
    // stayed un-healed. The fix accepts `audioFileId` as a fallback lookup key.
    it("FINDING-6: heals an audioFileId-only bonded track from library_index/{audioFileId}.mimeType", async () => {
        // audio-only bond: no fileId, audioFileId set, mimeType missing.
        await seedTrack("t-audio", {
            setlistId: "s1",
            title: "Adon Olam",
            audioFileId: "upload-mp3",
        })
        await seedIndex("upload-mp3", { mimeType: "audio/mpeg" })

        const r = await backfillTrackMimetype(ADMIN, { dryRun: false, force: true })
        if (!r.ok) throw new Error("expected ok:true")
        expect(r.bondedTracks).toBe(1)
        expect(r.committed).toBe(1)
        expect(r.heal.count).toBe(1)
        expect(r.heal.rows[0]).toMatchObject({
            trackId: "t-audio",
            setlistId: "s1",
            title: "Adon Olam",
            fileId: "upload-mp3",
            bondKind: "audioFileId",
            before: null,
            after: "audio/mpeg",
        })
        const after = (await db().collection("tracks").doc("t-audio").get()).data() ?? {}
        expect(after.mimeType).toBe("audio/mpeg")
        // Bond fields untouched (merge-set).
        expect(after.audioFileId).toBe("upload-mp3")
        expect(after.fileId).toBeUndefined()
    })

    it("FINDING-6: heals from fileId when both fileId AND audioFileId are present (chart bond is primary)", async () => {
        // Multi-bond shape: fileId points at a PDF, audioFileId points at an
        // mp3, mimeType missing. PDFOverlay dispatches off the chart-bond
        // mimeType, so we heal from library_index/{fileId} (the PDF), not the
        // audio entry. Track has only one mimeType field; the audio side stays
        // out of scope of this denorm cache.
        await seedTrack("t-multi", {
            setlistId: "s1",
            title: "Hashkivenu",
            fileId: "upload-pdf",
            audioFileId: "upload-mp3",
        })
        await seedIndex("upload-pdf", { mimeType: "application/pdf" })
        await seedIndex("upload-mp3", { mimeType: "audio/mpeg" })

        const r = await backfillTrackMimetype(ADMIN, { dryRun: false, force: true })
        if (!r.ok) throw new Error("expected ok:true")
        expect(r.committed).toBe(1)
        expect(r.heal.count).toBe(1)
        expect(r.heal.rows[0]).toMatchObject({
            trackId: "t-multi",
            fileId: "upload-pdf",
            bondKind: "fileId",
            after: "application/pdf",
        })
        const after = (await db().collection("tracks").doc("t-multi").get()).data() ?? {}
        expect(after.mimeType).toBe("application/pdf")
    })

    it("FINDING-6: skips an audioFileId-only track when library_index entry is missing (preserves bondKind)", async () => {
        await seedTrack("t-audio-ghost", {
            setlistId: "s1",
            audioFileId: "ghost-audio",
        })
        // No library_index row seeded for "ghost-audio".

        const r = await backfillTrackMimetype(ADMIN, {})
        if (!r.ok) throw new Error("expected ok:true")
        expect(r.bondedTracks).toBe(1)
        expect(r.heal.count).toBe(0)
        expect(r.skipped.count).toBe(1)
        expect(r.skipped.rows[0]).toMatchObject({
            trackId: "t-audio-ghost",
            fileId: "ghost-audio",
            bondKind: "audioFileId",
            reason: "library_entry_not_found",
        })
    })
})
