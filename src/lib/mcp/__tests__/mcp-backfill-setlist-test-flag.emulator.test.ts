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

import { backfillSetlistTestFlag } from "../tools/setlist-hygiene"
import { isTestSetlist } from "@/types/models"

/**
 * Cycle-2 SEC-004 — `backfill_setlist_test_flag` admin-only sweep that
 * classifies legacy setlists and stamps `isTest`. Forward fix is in
 * `createSetlistServerSide`; this tool covers everything created
 * before that commit.
 */
describe("MCP backfill_setlist_test_flag — SEC-004 (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "musician-7"

    function db() {
        return getFirestore(app)
    }

    async function seedUser(uid: string, role: string) {
        await db().collection("users").doc(uid).set({ role })
    }
    async function seedSetlist(id: string, data: Record<string, unknown>) {
        await db().collection("setlists").doc(id).set(data)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-setlist-istest" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "users"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await seedUser(ADMIN, "admin")
        await seedUser(MUSICIAN, "musician")
    })

    it("isTestSetlist classifier — covers test-* uid + [TEST/[CYCLE/[CF prefixes", () => {
        expect(isTestSetlist({ name: "Shabbat Morning", ownerId: ADMIN })).toBe(false)
        expect(isTestSetlist({ name: "Shabbat Morning", ownerId: "test-claude-1" })).toBe(true)
        expect(isTestSetlist({ name: "[TEST] integration probe", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "[CYCLE2-stress] probe", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "[CF1-mcp] cowork", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "Real Setlist (TEST mode)", ownerId: ADMIN })).toBe(false)
        expect(isTestSetlist({ name: null, ownerId: null })).toBe(false)

        // C9I5 §6.2 — un-bracketed cowork conventions, admin-owned (so the uid
        // check misses them) and no leading `[` (so the bracketed pattern
        // misses them). These previously leaked onto public /perform.
        expect(isTestSetlist({ name: "c9i5-clone-probe", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "test-rehearsal", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "cf2-followup", ownerId: ADMIN })).toBe(true)
        expect(isTestSetlist({ name: "Shabbat-CLONE-fixture", ownerId: ADMIN })).toBe(true)
        // Real names that merely CONTAIN the words must stay false.
        expect(isTestSetlist({ name: "Latest Service", ownerId: ADMIN })).toBe(false)
        expect(isTestSetlist({ name: "Copy of Shabbat Morning", ownerId: ADMIN })).toBe(false)
    })

    it("refuses non-admin callers", async () => {
        await seedSetlist("s1", { name: "x", ownerId: ADMIN })
        const r = await backfillSetlistTestFlag(MUSICIAN, {})
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "forbidden_role", code: 403 },
            requiredRoles: ["admin"],
        })
        if ("error" in r && typeof r.error === "object" && r.error) {
            expect(r.error.message).toMatch(/admin-only/i)
        }
    })

    it("dryRun default — classifies without writing", async () => {
        await seedSetlist("real", {
            name: "Shabbat Morning",
            ownerId: ADMIN,
        })
        await seedSetlist("test-owner", {
            name: "Friday Night",
            ownerId: "test-claude-1",
        })
        await seedSetlist("test-name", {
            name: "[CYCLE2-stress] integration",
            ownerId: ADMIN,
        })
        await seedSetlist("already-flagged", {
            name: "Saturday Evening",
            ownerId: ADMIN,
            isTest: false,
        })

        const r = await backfillSetlistTestFlag(ADMIN, {})
        if ("error" in r) throw new Error(typeof r.error === "string" ? r.error : JSON.stringify(r.error))

        expect(r.dryRun).toBe(true)
        expect(r.scanned).toBe(4)
        expect(r.rowsChanged).toBe(3) // already-flagged is in sync
        expect(r.flaggedTest).toBe(2)
        expect(r.flaggedReal).toBe(1)

        // No writes happened.
        const reread = await db().collection("setlists").doc("test-owner").get()
        expect(reread.data()?.isTest).toBeUndefined()
    })

    it("refuses real run without force — returns rich force_required envelope with no writes", async () => {
        await seedSetlist("test-name", {
            name: "[TEST] integration",
            ownerId: ADMIN,
        })

        const r = await backfillSetlistTestFlag(ADMIN, { dryRun: false })
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "force_required", code: 409 },
        })
        const plan = (r as { dryRunPlan?: { rowsChanged?: number } }).dryRunPlan
        expect(plan?.rowsChanged).toBe(1)
        const reread = await db().collection("setlists").doc("test-name").get()
        expect(reread.data()?.isTest).toBeUndefined()
    })

    it("force:true applies writes and is idempotent on a second run", async () => {
        await seedSetlist("real", { name: "Shabbat Morning", ownerId: ADMIN })
        await seedSetlist("test-owner", {
            name: "Friday Night",
            ownerId: "test-claude-1",
        })
        await seedSetlist("test-name", {
            name: "[CF1-cowork] probe",
            ownerId: ADMIN,
        })

        const r = await backfillSetlistTestFlag(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in r) throw new Error(JSON.stringify(r.error))
        // Success shape is `BackfillSetlistTestFlagResult` — no `ok` field.
        // The cycle-3 envelope sweep incorrectly added an `ok !== true`
        // guard here; the success type never had `ok`.

        expect(r.dryRun).toBe(false)
        expect(r.rowsChanged).toBe(3)
        expect(r.flaggedTest).toBe(2)
        expect(r.flaggedReal).toBe(1)

        const real = await db().collection("setlists").doc("real").get()
        const testOwner = await db().collection("setlists").doc("test-owner").get()
        const testName = await db().collection("setlists").doc("test-name").get()
        expect(real.data()?.isTest).toBe(false)
        expect(testOwner.data()?.isTest).toBe(true)
        expect(testName.data()?.isTest).toBe(true)

        // Second run = idempotent.
        const r2 = await backfillSetlistTestFlag(ADMIN, {
            dryRun: false,
            force: true,
        })
        if ("error" in r2) throw new Error(typeof r2.error === "string" ? r2.error : JSON.stringify(r2.error))
        expect(r2.rowsChanged).toBe(0)
    })
})
