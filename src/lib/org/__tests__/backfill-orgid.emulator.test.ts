import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    deleteApp,
    getApps,
    initializeApp,
    type App,
} from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import {
    backfillOrgId,
    seedOrgs,
    TENANT_COLLECTIONS,
} from "@/lib/org/backfill-orgid"
import { DEFAULT_ORG_ID, ORGS } from "@/lib/org/registry"

/**
 * v11-01-03 — backfill + org-seed logic against the Firebase emulator.
 *
 * Proves the one-time tenant migration: stamps orgId="crc" on docs missing it
 * across all 5 collections, never overwrites an existing orgId, is idempotent,
 * dry-runs without writing, and seeds orgs/{crc,brotherslazaroff} from the
 * registry preserving createdAt across re-runs.
 */
describe("backfill-orgid (real Firestore emulator)", () => {
    let app: App
    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-backfill-orgid" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [...TENANT_COLLECTIONS, "orgs"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    /**
     * Seed each tenant collection with 2 unstamped docs + 1 already-stamped doc.
     * The stamped doc on `setlists` uses "brotherslazaroff" to prove a non-crc
     * orgId is never overwritten; the rest use "crc".
     */
    async function seedMixed() {
        for (const col of TENANT_COLLECTIONS) {
            await db().collection(col).doc(`${col}-unstamped-1`).set({ name: "a" })
            await db().collection(col).doc(`${col}-unstamped-2`).set({ name: "b" })
            const existingOrg =
                col === "setlists" ? "brotherslazaroff" : "crc"
            await db()
                .collection(col)
                .doc(`${col}-stamped`)
                .set({ name: "c", orgId: existingOrg })
        }
    }

    it("AC-4: dryRun makes NO writes but reports accurate wouldStamp counts", async () => {
        await seedMixed()

        const res = await backfillOrgId(db(), { dryRun: true })
        expect(res.dryRun).toBe(true)

        for (const col of TENANT_COLLECTIONS) {
            expect(res.perCollection[col].scanned).toBe(3)
            expect(res.perCollection[col].alreadyStamped).toBe(1)
            expect(res.perCollection[col].wouldStamp).toBe(2)
            expect(res.perCollection[col].stamped).toBe(0)
            // No writes: the unstamped docs still lack orgId.
            const d = (
                await db().collection(col).doc(`${col}-unstamped-1`).get()
            ).data()!
            expect(d.orgId).toBeUndefined()
        }
    })

    it("AC-1: apply stamps orgId='crc' on every doc missing it (all 5 collections)", async () => {
        await seedMixed()

        const res = await backfillOrgId(db(), { dryRun: false })
        expect(res.dryRun).toBe(false)
        expect(res.orgId).toBe(DEFAULT_ORG_ID)

        for (const col of TENANT_COLLECTIONS) {
            expect(res.perCollection[col].stamped).toBe(2)
            const d1 = (
                await db().collection(col).doc(`${col}-unstamped-1`).get()
            ).data()!
            const d2 = (
                await db().collection(col).doc(`${col}-unstamped-2`).get()
            ).data()!
            expect(d1.orgId).toBe("crc")
            expect(d2.orgId).toBe("crc")
            // Sibling field preserved by the merge-set.
            expect(d1.name).toBe("a")
        }
    })

    it("AC-2: existing orgId is never overwritten; a second apply stamps 0", async () => {
        await seedMixed()

        await backfillOrgId(db(), { dryRun: false })

        // The pre-stamped setlists doc kept its brotherslazaroff tenant.
        const stamped = (
            await db().collection("setlists").doc("setlists-stamped").get()
        ).data()!
        expect(stamped.orgId).toBe("brotherslazaroff")

        // Second run: everything now carries orgId → 0 stamped, all alreadyStamped.
        const second = await backfillOrgId(db(), { dryRun: false })
        for (const col of TENANT_COLLECTIONS) {
            expect(second.perCollection[col].stamped).toBe(0)
            expect(second.perCollection[col].alreadyStamped).toBe(3)
        }
    })

    it("AC-3: seedOrgs writes orgs/{crc,brotherslazaroff} from the registry, idempotent on createdAt", async () => {
        const first = await seedOrgs(db(), { dryRun: false })
        expect(first.dryRun).toBe(false)
        expect(first.orgs.map((o) => o.action)).toEqual(
            Object.values(ORGS).map(() => "create"),
        )

        for (const org of Object.values(ORGS)) {
            const doc = (await db().collection("orgs").doc(org.id).get()).data()!
            expect(doc.id).toBe(org.id)
            expect(doc.name).toBe(org.name)
            expect(doc.domain).toBe(org.domain)
            expect(doc.createdAt).toBeTruthy()
        }

        // Capture createdAt, re-run, assert unchanged (not re-stamped) + noop.
        const crcCreatedAt = (
            await db().collection("orgs").doc("crc").get()
        ).data()!.createdAt
        const crcMs = crcCreatedAt.toMillis()

        const second = await seedOrgs(db(), { dryRun: false })
        for (const o of second.orgs) expect(o.action).toBe("noop")

        const after = (
            await db().collection("orgs").doc("crc").get()
        ).data()!.createdAt
        expect(after.toMillis()).toBe(crcMs)
    })

    it("AC-4: seedOrgs dryRun writes nothing but reports create actions", async () => {
        const res = await seedOrgs(db(), { dryRun: true })
        expect(res.dryRun).toBe(true)
        expect(res.orgs.every((o) => o.action === "create")).toBe(true)
        const snap = await db().collection("orgs").get()
        expect(snap.size).toBe(0)
    })
})
