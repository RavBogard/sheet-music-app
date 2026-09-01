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

import {
    archiveNonChartArtifacts,
    type ArchiveNonChartResult,
} from "../tools/archive-nonchart-artifacts"

/**
 * data-health dh-20260527a Class 3 — `archive_nonchart_artifacts`.
 *
 * Bulk soft-archives the UNAMBIGUOUS non-chart residents of library_index:
 * Google Drive folders + Google Sheets. Google Docs are HELD (never archived).
 * Real charts / audio are out of scope.
 *
 * Properties asserted:
 *  - role gate: musician + band_leader refused (forbidden_role); admin passes
 *  - classification: folder/sheet → toArchive; google-doc → heldGoogleDocs;
 *    chart/audio → ignored; already-archived eligible → alreadyArchived
 *  - the canonical inventory shape (23 folders + 1 sheet) → toArchive.count===24
 *  - dryRun default true → no writes
 *  - real run without force → refused:true, no writes (F-05)
 *  - force:true flips status→archived + archivedBy/archivedAt; songs mirror only
 *    when a songs doc pre-exists (never creates a spurious one); verified===committed
 *  - guard: an explicit chart fileId lands in notMatched + is NEVER archived
 *  - idempotent: a second force-run archives 0 (all already archived)
 *
 * Self-inclusion ([[feedback_self_inclusion_test_fixtures]]) does NOT apply: the
 * caller is a user uid; the operand set is library_index rows — the admin caller
 * can never appear in its own operand set.
 */
describe("MCP archive_nonchart_artifacts — dh-20260527a Class 3 (emulator)", () => {
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
    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }
    async function seedSong(id: string, data: Record<string, unknown>) {
        await db().collection("songs").doc(id).set(data)
    }
    function asResult(r: unknown): ArchiveNonChartResult {
        expect(
            typeof r === "object" && r !== null && "ok" in r && r.ok === true,
        ).toBe(true)
        return r as ArchiveNonChartResult
    }

    const FOLDER = "application/vnd.google-apps.folder"
    const SHEET = "application/vnd.google-apps.spreadsheet"
    const DOC = "application/vnd.google-apps.document"

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-archive-nonchart" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["users", "library_index", "songs"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(LEADER, "band_leader")
        await seedUser(MUSICIAN, "musician")
    })

    it("refuses a musician caller with a forbidden_role envelope", async () => {
        const r = await archiveNonChartArtifacts(MUSICIAN, { dryRun: true })
        expect(r.ok).toBe(false)
        if (r.ok === false) {
            expect((r.error as { machine_code: string }).machine_code).toBe(
                "forbidden_role",
            )
        }
    })

    it("refuses a band_leader caller (admin-only)", async () => {
        const r = await archiveNonChartArtifacts(LEADER, { dryRun: true })
        expect(r.ok).toBe(false)
        if (r.ok === false) {
            expect((r.error as { machine_code: string }).machine_code).toBe(
                "forbidden_role",
            )
        }
    })

    it("L1-W3 — the full scan sees only the caller's tenant", async () => {
        // This tool WRITES `status:'archived'` off a full-collection scan and
        // had zero orgId handling, so an admin of one org could soft-delete
        // another org's folders and sheets. The census named three unscoped
        // hygiene tools; this was the fourth.
        await seedUser(ADMIN, "admin")
        await seedIndex("crc-folder", {
            name: "CRC Folder",
            mimeType: "application/vnd.google-apps.folder",
            orgId: "crc",
        })
        await seedIndex("other-folder", {
            name: "Their Folder",
            mimeType: "application/vnd.google-apps.folder",
            orgId: "broslaz",
        })

        const r = asResult(
            await archiveNonChartArtifacts(ADMIN, { dryRun: true }, "crc"),
        )
        expect(r.scanned).toBe(1)
        expect(r.toArchive.count).toBe(1)
        expect(r.toArchive.rows[0].fileId).toBe("crc-folder")
    })

    it("L1-W3 — an explicit fileId from another tenant is refused, never archived", async () => {
        // The `fileIds` path bypasses the scan entirely, so it needs its own
        // guard. A cross-tenant id lands in `notMatched`, exactly like the
        // existing non-folder/sheet mime refusal.
        await seedUser(ADMIN, "admin")
        await seedIndex("other-folder", {
            name: "Their Folder",
            mimeType: "application/vnd.google-apps.folder",
            orgId: "broslaz",
        })

        const r = asResult(
            await archiveNonChartArtifacts(
                ADMIN,
                { dryRun: false, force: true, fileIds: ["other-folder"] },
                "crc",
            ),
        )
        expect(r.toArchive.count).toBe(0)
        expect(r.committed).toBe(0)
        expect(r.notMatched).toEqual(["other-folder"])

        // and the row is untouched on disk
        const doc = await db().collection("library_index").doc("other-folder").get()
        expect(doc.data()?.status).toBeUndefined()
        expect(doc.data()?.archivedAt).toBeUndefined()
    })

    it("dryRun classifies folder/sheet → toArchive, doc → held, chart → ignored, no writes", async () => {
        await seedIndex("f1", { name: "Old Folder", mimeType: FOLDER })
        await seedIndex("s1", { name: "Set Sheet", mimeType: SHEET })
        await seedIndex("d1", { name: "Lyrics Doc", mimeType: DOC })
        await seedIndex("c1", { name: "Adon Olam.pdf", mimeType: "application/pdf" })
        await seedIndex("a1", { name: "click.mp3", mimeType: "audio/mpeg" })

        const r = asResult(await archiveNonChartArtifacts(ADMIN, { dryRun: true }))
        expect(r.dryRun).toBe(true)
        expect(r.committed).toBe(0)
        expect(r.scanned).toBe(5)
        expect(r.toArchive.count).toBe(2)
        expect(r.toArchive.rows.map((x) => x.fileId).sort()).toEqual(["f1", "s1"])
        expect(r.toArchive.rows.find((x) => x.fileId === "f1")?.kind).toBe("folder")
        expect(r.toArchive.rows.find((x) => x.fileId === "s1")?.kind).toBe("sheet")
        expect(r.heldGoogleDocs.count).toBe(1)
        expect(r.heldGoogleDocs.rows[0].fileId).toBe("d1")

        // no writes
        const after = await db().collection("library_index").doc("f1").get()
        expect(after.data()?.status).toBeUndefined()
    })

    it("matches the canonical inventory shape: 23 folders + 1 sheet → toArchive.count===24", async () => {
        for (let i = 0; i < 23; i++) {
            await seedIndex(`folder-${i}`, { name: `dir ${i}`, mimeType: FOLDER })
        }
        await seedIndex("the-sheet", { name: "Master List", mimeType: SHEET })
        // noise that must NOT be counted
        await seedIndex("doc-1", { name: "doc", mimeType: DOC })
        await seedIndex("pdf-1", { name: "song.pdf", mimeType: "application/pdf" })

        const r = asResult(await archiveNonChartArtifacts(ADMIN, { dryRun: true }))
        expect(r.toArchive.count).toBe(24)
        expect(r.heldGoogleDocs.count).toBe(1)
    })

    it("real run without force → rich force_required envelope, no writes (F-05)", async () => {
        await seedIndex("f1", { name: "Old Folder", mimeType: FOLDER })
        // FU-1: force-gate now returns the rich force_required envelope (ok:false)
        // carrying the would-archive plan in `dryRunPlan`, instead of {ok:true, refused:true}.
        const raw = await archiveNonChartArtifacts(ADMIN, { dryRun: false })
        expect(raw).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
        })
        const plan = (raw as {
            dryRunPlan?: { committed?: number; toArchive?: { count?: number } }
        }).dryRunPlan
        expect(plan?.committed).toBe(0)
        expect(plan?.toArchive?.count).toBe(1)
        const after = await db().collection("library_index").doc("f1").get()
        expect(after.data()?.status).toBeUndefined()
    })

    it("force:true flips status→archived with audit fields + read-verifies", async () => {
        await seedIndex("f1", { name: "Old Folder", mimeType: FOLDER })
        await seedIndex("s1", { name: "Sheet", mimeType: SHEET })
        await seedIndex("c1", { name: "song.pdf", mimeType: "application/pdf" })

        const r = asResult(
            await archiveNonChartArtifacts(ADMIN, { dryRun: false, force: true }),
        )
        expect(r.committed).toBe(2)
        expect(r.verified).toBe(2)

        const f1 = await db().collection("library_index").doc("f1").get()
        expect(f1.data()?.status).toBe("archived")
        expect(f1.data()?.archivedBy).toBe(ADMIN)
        expect(typeof f1.data()?.archivedAt).toBe("string")
        // chart untouched
        const c1 = await db().collection("library_index").doc("c1").get()
        expect(c1.data()?.status).toBeUndefined()
    })

    it("mirrors songs/{id}.status only when a songs doc pre-exists (no spurious creation)", async () => {
        await seedIndex("f1", { name: "Folder", mimeType: FOLDER })
        await seedIndex("s1", { name: "Sheet", mimeType: SHEET })
        // only s1 has a pre-existing songs doc
        await seedSong("s1", { title: "Sheet", recent: [1, 2, 3] })

        await archiveNonChartArtifacts(ADMIN, { dryRun: false, force: true })

        const songS1 = await db().collection("songs").doc("s1").get()
        expect(songS1.data()?.status).toBe("archived")
        // sticky memory preserved (merge, not overwrite)
        expect(songS1.data()?.recent).toEqual([1, 2, 3])
        // no spurious songs doc for the folder
        const songF1 = await db().collection("songs").doc("f1").get()
        expect(songF1.exists).toBe(false)
    })

    it("already-archived eligible rows are counted, not re-archived", async () => {
        await seedIndex("f1", { name: "Folder", mimeType: FOLDER, status: "archived" })
        await seedIndex("f2", { name: "Folder2", mimeType: FOLDER })

        const r = asResult(await archiveNonChartArtifacts(ADMIN, { dryRun: true }))
        expect(r.alreadyArchived).toBe(1)
        expect(r.toArchive.count).toBe(1)
        expect(r.toArchive.rows[0].fileId).toBe("f2")
    })

    it("guard: an explicit chart fileId lands in notMatched and is NEVER archived", async () => {
        await seedIndex("c1", { name: "Adon Olam.pdf", mimeType: "application/pdf" })
        await seedIndex("f1", { name: "Folder", mimeType: FOLDER })

        const r = asResult(
            await archiveNonChartArtifacts(ADMIN, {
                dryRun: false,
                force: true,
                fileIds: ["c1", "f1", "ghost"],
            }),
        )
        // f1 archived; c1 (chart) + ghost (missing) refused
        expect(r.committed).toBe(1)
        expect(r.notMatched.sort()).toEqual(["c1", "ghost"])
        const c1 = await db().collection("library_index").doc("c1").get()
        expect(c1.data()?.status).toBeUndefined()
        const f1 = await db().collection("library_index").doc("f1").get()
        expect(f1.data()?.status).toBe("archived")
    })

    it("is idempotent: a second force-run archives 0", async () => {
        await seedIndex("f1", { name: "Folder", mimeType: FOLDER })
        await archiveNonChartArtifacts(ADMIN, { dryRun: false, force: true })
        const r = asResult(
            await archiveNonChartArtifacts(ADMIN, { dryRun: false, force: true }),
        )
        expect(r.committed).toBe(0)
        expect(r.alreadyArchived).toBe(1)
    })
})
