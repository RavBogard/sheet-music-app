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

import { backfillLibraryIndex } from "../tools/library"

/**
 * Cycle-2 DATA-001 — `backfill_library_index` admin-only hygiene pass.
 *
 * Pre-fix: 80% of `library_index` rows had `fileSize: null` (Drive sync
 * never fetched the `size` field; only Storage uploads populated it),
 * and a long tail of rows still carried leading/trailing whitespace on
 * `name` from earlier Drive scans — the same root cause as F-019.
 *
 * Going forward, the Drive sync at write time strips names and
 * persists Drive `size`. This tool covers the existing population.
 *
 * Properties asserted:
 *  - admin gate refuses non-admin callers
 *  - dryRun default true; force omitted → refused on real run
 *  - name strip detected, nameLower kept in sync
 *  - fileSize hydrated only for rows missing it AND not orphaned/duplicate
 *  - idempotent: a second run after force shows rowsChanged:0
 *
 * Storage probing is exercised via a thin abstraction shim — the
 * emulator doesn't run Firebase Storage, so we don't assert
 * fileSize hydration here; instead we assert that orphaned/duplicate
 * rows never enter the size-probe queue (a property guaranteed by the
 * candidate filter, not by Storage). End-to-end size hydration is
 * covered by the prod-validation report.
 */
describe("MCP backfill_library_index — DATA-001 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
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

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-backfill-library" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["library_index", "users"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(MUSICIAN, "musician")
    })

    it("refuses non-admin callers", async () => {
        await seedIndex("u1", { name: " whitespace " })
        const r = await backfillLibraryIndex(MUSICIAN, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role", code: 403 },
            requiredRoles: ["admin"],
        })
        if ("error" in r && typeof r.error === "object" && r.error) {
            expect(r.error.message).toMatch(/admin-only/i)
        }
    })

    it("dryRun default — surfaces name deltas without writing", async () => {
        await seedIndex("u1", {
            name: " Ana B_Koach.pdf",
            nameLower: " ana b_koach.pdf",
        })
        await seedIndex("u2", {
            name: "Hinei Ma Tov",
            nameLower: "hinei ma tov",
        })

        const r = await backfillLibraryIndex(ADMIN, {})
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.dryRun).toBe(true)
        expect(r.scanned).toBe(2)
        expect(r.namesNormalized).toBe(1)
        expect(r.rowsChanged).toBe(1)
        expect(r.deltas).toHaveLength(1)
        expect(r.deltas[0].fileId).toBe("u1")
        const fields = r.deltas[0].changes.map((c) => c.field)
        expect(fields).toContain("name")
        expect(fields).toContain("nameLower")

        // No writes happened.
        const u1 = await db().collection("library_index").doc("u1").get()
        expect(u1.data()?.name).toBe(" Ana B_Koach.pdf")
    })

    it("refuses real run without force — returns rich force_required envelope with no writes", async () => {
        await seedIndex("u1", { name: " trim me " })

        const r = await backfillLibraryIndex(ADMIN, { dryRun: false })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
        })
        const plan = (r as { dryRunPlan?: { namesNormalized?: number } }).dryRunPlan
        expect(plan?.namesNormalized).toBe(1)
        const u1 = await db().collection("library_index").doc("u1").get()
        expect(u1.data()?.name).toBe(" trim me ")
    })

    it("applies name + nameLower writes when force:true", async () => {
        await seedIndex("u1", {
            name: " Ana B_Koach.pdf",
            nameLower: " ana b_koach.pdf",
        })
        await seedIndex("u2", { name: "Already Clean" })

        const r = await backfillLibraryIndex(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.dryRun).toBe(false)
        expect(r.namesNormalized).toBe(1)
        expect(r.rowsChanged).toBe(1)

        const u1 = await db().collection("library_index").doc("u1").get()
        expect(u1.data()?.name).toBe("Ana B_Koach.pdf")
        expect(u1.data()?.nameLower).toBe("ana b_koach.pdf")

        // Second run is idempotent.
        const r2 = await backfillLibraryIndex(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in r2) throw new Error(typeof r2.error === "string" ? r2.error : JSON.stringify(r2.error))
        expect(r2.rowsChanged).toBe(0)
        expect(r2.namesNormalized).toBe(0)
    })

    it("skips fileSize hydration for orphaned + duplicate rows", async () => {
        // Storage probing is mocked away by the emulator (no GCS); we
        // assert that the candidate filter never even queues orphan/dupe
        // rows for the probe. The signal: fileSizesUnresolved counts only
        // active rows whose Storage probe missed.
        await seedIndex("active", {
            name: "Active",
            status: "active",
            fileSize: null,
        })
        await seedIndex("orphan", {
            name: "Orphan",
            status: "orphaned",
            fileSize: null,
        })
        await seedIndex("dupe", {
            name: "Dupe",
            status: "duplicate",
            fileSize: null,
        })
        await seedIndex("sized", {
            name: "Sized",
            status: "active",
            fileSize: 1024,
        })

        const r = await backfillLibraryIndex(ADMIN, {})
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.scanned).toBe(4)
        // Only the `active` row enters the probe queue; `orphan` and
        // `dupe` are skipped by the candidate filter; `sized` already
        // has fileSize. Probe miss → fileSizesUnresolved:1.
        expect(r.fileSizesUnresolved).toBe(1)
        expect(r.fileSizesHydrated).toBe(0)
        // No name changes either — every row was clean.
        expect(r.namesNormalized).toBe(0)
        expect(r.rowsChanged).toBe(0)
    })
})
