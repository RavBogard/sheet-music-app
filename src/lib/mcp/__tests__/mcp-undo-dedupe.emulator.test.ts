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

import { dedupeLibraryIndex } from "../tools/library"
import {
    undoDedupeGroup,
    seedLegacyDedupeRun,
    LEGACY_RUN_ID,
    type LegacyUndoFileRow,
} from "../tools/undo-dedupe"

/**
 * W3 (R-0903-live-cw-2 §5) — `undo_dedupe_group`.
 *
 * The rule under test: a repair tool may not create the class of harm it
 * exists to repair. Restoring is a write, and "restore everything to active"
 * would un-archive rows somebody deliberately archived — so these tests pin
 * the REFUSALS as hard as the restores.
 */
describe("MCP undo_dedupe_group (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-1"

    function db() {
        return getFirestore(app)
    }
    async function seedIndex(id: string, data: Record<string, unknown>) {
        await db().collection("library_index").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-undo-dedupe" })
    }, 30_000)
    afterAll(async () => {
        await deleteApp(app)
    })
    // The first hook of the file pays Admin-SDK + emulator warm-up and blew
    // the default 10s budget on a cold run. The work is a handful of
    // deletes; the cost is startup, so the budget moves rather than the
    // assertions.
    beforeEach(async () => {
        for (const col of ["songs", "library_index", "users", "dedupeRuns"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician" })
    }, 30_000)

    /** Mark a pair and return the runId dedupe wrote. */
    async function markAPair(
        keepId: string,
        loseId: string,
        name: string,
        loserStatus = "active",
    ) {
        await seedIndex(keepId, {
            name,
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            status: loserStatus === "archived" ? "archived" : "active",
        })
        await seedIndex(loseId, {
            name,
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            status: loserStatus,
        })
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.committed).toBe(1)
        return r.dedupeRunId as string
    }

    it("refuses non-admin callers", async () => {
        const r = await undoDedupeGroup(MUSICIAN, {
            fileId: "x",
            toStatus: "active",
            force: true,
        })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("forbidden_role")
    })

    it("restores a whole run to each row's RECORDED priorStatus", async () => {
        const runId = await markAPair("u-keep", "u-lose", "Hashkivenu (Randy)")

        const r = await undoDedupeGroup(ADMIN, {
            runId,
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.mode).toBe("run")
        expect(r.restored).toBe(1)
        expect(r.rows[0]).toMatchObject({
            fileId: "u-lose",
            fromStatus: "duplicate",
            toStatus: "active",
            source: "run-record",
        })

        const row = (
            await db().collection("library_index").doc("u-lose").get()
        ).data() as Record<string, unknown>
        expect(row.status).toBe("active")
        // The dedupe stamps are cleared: a restored row must not still claim
        // membership of a run, or the next undo would restore it twice.
        expect(row.dedupedAt).toBeNull()
        expect(row.dedupeRunId).toBeNull()
        expect(row.priorStatus).toBeNull()
    })

    it("G3 CORE — an ARCHIVED row is restored to archived, never to active", async () => {
        // This is the 18-row shape from the 09-01 sweep, as a unit.
        const runId = await markAPair(
            "u-arch-keep",
            "u-arch-lose",
            "Lecha Dodi Lincoln_s Nigun",
            "archived",
        )

        const r = await undoDedupeGroup(ADMIN, {
            runId,
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.rows[0].toStatus).toBe("archived")

        const row = (
            await db().collection("library_index").doc("u-arch-lose").get()
        ).data() as Record<string, unknown>
        expect(row.status).toBe("archived")
    })

    it("G3 — a blanket restore is REFUSED and NAMES the rows it would have wrongly activated", async () => {
        // Two runs: one whose loser was active, one whose loser was archived.
        await markAPair("g3-a-keep", "g3-a-lose", "Twilight")
        await markAPair(
            "g3-b-keep",
            "g3-b-lose",
            "Oseh shalom (S&P)",
            "archived",
        )
        // Plus a marked row with NO record at all, stamped by hand the way
        // the pre-W2 code did it: status only, no prior state anywhere.
        await seedIndex("g3-orphan", {
            name: "Ana B_Koach",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "duplicate",
        })

        const r = await undoDedupeGroup(ADMIN, { dryRun: false, force: true })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("restore_target_required")

        // `richError` spreads its extras at the TOP LEVEL of the envelope
        // (errors.ts:215-220), not under `error.data`.
        const d = r as unknown as Record<string, number>
        // eslint-disable-next-line no-console
        console.log("[G3 REFUSAL]", JSON.stringify(r, null, 2))

        expect(d.markedRowsTotal).toBe(3)
        // The archived loser is the one a default-to-active restore would
        // have wrongly activated, and the refusal must say so by count.
        expect(d.wouldWronglyActivate).toBe(1)
        expect(d.rowsWithRecordedPriorStatus).toBe(2)
        // The hand-stamped row has no prior status anywhere, and the tool
        // says that rather than assuming `active` for it.
        expect(d.markedRowsWithNoRecord).toBe(1)

        // And nothing moved.
        for (const id of ["g3-a-lose", "g3-b-lose", "g3-orphan"]) {
            const row = (
                await db().collection("library_index").doc(id).get()
            ).data() as Record<string, unknown>
            expect(row.status).toBe("duplicate")
        }
    })

    it("refuses a single-row restore with no toStatus, and quotes the recorded prior status", async () => {
        const runId = await markAPair("u-nts-keep", "u-nts-lose", "V'Shamru")
        expect(runId).toBeTruthy()

        const r = await undoDedupeGroup(ADMIN, {
            fileId: "u-nts-lose",
            dryRun: false,
            force: true,
        })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("to_status_required")
        expect(
            (r as unknown as Record<string, unknown>).recordedPriorStatus,
        ).toBe("active")
        expect(r.error.message).toContain("active")
    })

    it("restores one named row on an explicit toStatus", async () => {
        await markAPair("u-one-keep", "u-one-lose", "G-minor Spirits")

        const r = await undoDedupeGroup(ADMIN, {
            fileId: "u-one-lose",
            toStatus: "archived",
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        expect(r.mode).toBe("row")
        expect(r.restored).toBe(1)
        expect(r.rows[0].source).toBe("explicit")
        const row = (
            await db().collection("library_index").doc("u-one-lose").get()
        ).data() as Record<string, unknown>
        // The operator said `archived`, so `archived` it is — the tool does
        // not "helpfully" prefer the recorded `active`.
        expect(row.status).toBe("archived")
    })

    it("refuses runId + fileId together rather than silently preferring one", async () => {
        const r = await undoDedupeGroup(ADMIN, {
            runId: "r1",
            fileId: "f1",
            toStatus: "active",
            force: true,
        })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("invalid_arguments")
    })

    it("F-05 — dryRun writes nothing; a real run without force is refused with the plan", async () => {
        const runId = await markAPair("u-f5-keep", "u-f5-lose", "Bminor tune")

        const dry = await undoDedupeGroup(ADMIN, { runId, dryRun: true })
        if ("error" in dry) throw new Error(JSON.stringify(dry.error))
        expect(dry.restored).toBe(0)
        expect(dry.rows).toHaveLength(1)
        expect(dry.rows[0].toStatus).toBe("active")
        expect(
            (
                (
                    await db().collection("library_index").doc("u-f5-lose").get()
                ).data() as Record<string, unknown>
            ).status,
        ).toBe("duplicate")

        const refused = await undoDedupeGroup(ADMIN, { runId, dryRun: false })
        expect("error" in refused).toBe(true)
        if (!("error" in refused)) throw new Error("unreachable")
        expect(refused.error.machine_code).toBe("force_required")
        expect(
            (refused as unknown as Record<string, unknown>).dryRunPlan,
        ).toBeTruthy()
        expect(
            (
                (
                    await db().collection("library_index").doc("u-f5-lose").get()
                ).data() as Record<string, unknown>
            ).status,
        ).toBe("duplicate")
    })

    it("is idempotent and SAYS SO — a second restore skips with the reason, not silently", async () => {
        const runId = await markAPair("u-idem-keep", "u-idem-lose", "Refa tziri")
        const first = await undoDedupeGroup(ADMIN, {
            runId,
            dryRun: false,
            force: true,
        })
        if ("error" in first) throw new Error(JSON.stringify(first.error))
        expect(first.restored).toBe(1)

        const second = await undoDedupeGroup(ADMIN, {
            runId,
            dryRun: false,
            force: true,
        })
        if ("error" in second) throw new Error(JSON.stringify(second.error))
        expect(second.restored).toBe(0)
        expect(second.skipped).toBe(1)
        expect(second.rows[0].skipped).toContain("not `duplicate`")
    })

    it("does not restore across tenants", async () => {
        await seedIndex("x-keep", {
            name: "Shared Name",
            uploadedAt: "2025-01-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "active",
        })
        await seedIndex("x-lose", {
            name: "Shared Name",
            uploadedAt: "2025-06-01T00:00:00Z",
            mimeType: "application/pdf",
            status: "active",
        })
        const r = await dedupeLibraryIndex(ADMIN, { dryRun: false, force: true })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        const runId = r.dedupeRunId as string

        // The row moves to another tenant after the run recorded it.
        await db()
            .collection("library_index")
            .doc("x-lose")
            .set({ orgId: "someone-else" }, { merge: true })

        const u = await undoDedupeGroup(ADMIN, {
            runId,
            dryRun: false,
            force: true,
        })
        if ("error" in u) throw new Error(JSON.stringify(u.error))
        expect(u.restored).toBe(0)
        expect(u.rows[0].skipped).toContain("another org")
        expect(
            (
                (
                    await db().collection("library_index").doc("x-lose").get()
                ).data() as Record<string, unknown>
            ).status,
        ).toBe("duplicate")
    })

    it("refuses an unknown runId rather than inventing prior statuses", async () => {
        const r = await undoDedupeGroup(ADMIN, {
            runId: "run-that-never-happened",
            dryRun: false,
            force: true,
        })
        expect("error" in r).toBe(true)
        if (!("error" in r)) throw new Error("unreachable")
        expect(r.error.machine_code).toBe("run_not_found")
    })

    /* ── the legacy seed ─────────────────────────────────────────────────── */

    const LEGACY: LegacyUndoFileRow[] = [
        {
            fileId: "leg-active-1",
            name: "B'sefer chayim & Hashiveinu",
            priorStatus: "active",
            canonicalFileId: "leg-canon-1",
        },
        {
            fileId: "leg-archived-1",
            name: "Lecha Dodi Lincoln_s Nigun",
            priorStatus: "archived",
            canonicalFileId: "leg-canon-1",
        },
        {
            fileId: "leg-gone",
            name: "Od Yavo Shalom Aleinu",
            priorStatus: "active",
            canonicalFileId: "leg-canon-2",
        },
    ]

    it("seeds the 09-01 artifact as a run record, preserving each priorStatus", async () => {
        await seedIndex("leg-active-1", { name: "a", status: "duplicate" })
        await seedIndex("leg-archived-1", { name: "b", status: "duplicate" })
        // In the file, but already back to `active` in the catalog — the
        // 09-01 file has exactly 2 rows in this shape.
        await seedIndex("leg-gone", { name: "c", status: "active" })
        // Marked, but NOT in the file. Gets no record, by design.
        await seedIndex("leg-uncovered", { name: "d", status: "duplicate" })

        const r = await seedLegacyDedupeRun(ADMIN, LEGACY, {
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))

        expect(r.runId).toBe(LEGACY_RUN_ID)
        expect(r.seeded).toBe(3)
        expect(r.priorStatusHistogram).toEqual({ active: 2, archived: 1 })
        expect(r.stillMarked).toBe(2)
        expect(r.noLongerMarked).toEqual(["leg-gone"])
        // The uncovered population is REPORTED, not silently defaulted.
        expect(r.markedWithNoRecord).toEqual(["leg-uncovered"])

        const rec = (
            await db().collection("dedupeRuns").doc(LEGACY_RUN_ID).get()
        ).data() as {
            rows: Array<{ fileId: string; priorStatus: string; groupedBy: string }>
        }
        expect(rec.rows).toHaveLength(3)
        expect(
            rec.rows.find((x) => x.fileId === "leg-archived-1")?.priorStatus,
        ).toBe("archived")
        // Recorded as a NAME group, not a byte group — the 09-01 sweep was
        // the normalized-name pass, and calling it byte-identity would be a
        // much stronger claim than the evidence supports.
        expect(rec.rows[0].groupedBy).toBe("exact-name")
    })

    it("the seeded record is restorable end-to-end, archived rows included", async () => {
        await seedIndex("leg-active-1", {
            name: "a",
            status: "duplicate",
            dedupedAt: "2026-09-01T00:00:00Z",
        })
        await seedIndex("leg-archived-1", {
            name: "b",
            status: "duplicate",
            dedupedAt: "2026-09-01T00:00:00Z",
        })
        await seedIndex("leg-gone", { name: "c", status: "active" })

        const s = await seedLegacyDedupeRun(ADMIN, LEGACY, {
            dryRun: false,
            force: true,
        })
        if ("error" in s) throw new Error(JSON.stringify(s.error))

        const u = await undoDedupeGroup(ADMIN, {
            runId: LEGACY_RUN_ID,
            dryRun: false,
            force: true,
        })
        if ("error" in u) throw new Error(JSON.stringify(u.error))
        expect(u.restored).toBe(2)
        expect(u.skipped).toBe(1)

        const a = (
            await db().collection("library_index").doc("leg-active-1").get()
        ).data() as Record<string, unknown>
        const b = (
            await db().collection("library_index").doc("leg-archived-1").get()
        ).data() as Record<string, unknown>
        expect(a.status).toBe("active")
        // THE POINT OF THE WHOLE WAVE.
        expect(b.status).toBe("archived")
    })

    it("the seed is F-05 gated and read-only on dryRun", async () => {
        await seedIndex("leg-active-1", { name: "a", status: "duplicate" })

        const dry = await seedLegacyDedupeRun(ADMIN, LEGACY, { dryRun: true })
        if ("error" in dry) throw new Error(JSON.stringify(dry.error))
        expect(dry.seeded).toBe(0)
        expect(dry.priorStatusHistogram).toEqual({ active: 2, archived: 1 })
        expect((await db().collection("dedupeRuns").get()).size).toBe(0)

        const refused = await seedLegacyDedupeRun(ADMIN, LEGACY, {
            dryRun: false,
        })
        expect("error" in refused).toBe(true)
        expect((await db().collection("dedupeRuns").get()).size).toBe(0)
    })
})
