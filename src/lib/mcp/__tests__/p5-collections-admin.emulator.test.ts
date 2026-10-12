// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

import { createCollectionTool, setCollectionSharingTool } from "@/lib/mcp/tools/collections-admin"
import { recomputeCollectionVisibility } from "@/lib/library/visibility-job"
import { __setPlatformDeps, assignCollection } from "@/lib/platform/tenants"
import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { seedP5Library } from "@/lib/library/__tests__/p5-fixture"

/**
 * Multi-tenant phase 5 — the tenant-admin collection tools on the authoring
 * MCP surface. Admin of the caller's own tenant only; own collections only;
 * dry run first; applying audits and re-stamps the charts.
 */
describe("P5 create_collection / set_collection_sharing (tenant admin, emulator)", () => {
    let app: App
    let db: Firestore
    const ADMIN = "p5-admin" // admin of crc and brotherslazaroff (fixture)
    const LEADER = "p5-leader"

    beforeAll(async () => {
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-coll-admin" })
        db = getFirestore(app)
    })
    afterAll(async () => {
        __setPlatformDeps({})
        await deleteApp(app)
    })
    beforeEach(async () => {
        await seedP5Library(db, { admin: ADMIN, withCollections: true })
        await db.collection("memberships").doc(`crc__${LEADER}`).set({ uid: LEADER, tenantId: "crc", role: "band_leader", soundEngineer: false })
        await db.collection("users").doc(LEADER).set({ uid: LEADER, membershipsMigratedAt: 1 })
        await db.collection("users").doc(ADMIN).set({ uid: ADMIN, membershipsMigratedAt: 1 })
        await db.collection("platform").doc("owners").set({ uids: [] })
        __resetPlatformOwnerMemo()
        __setPlatformDeps({ db, recomputeVisibility: (id) => recomputeCollectionVisibility(id, { db, bucket: null }) })
    })

    it("a band leader is refused", async () => {
        const r = await createCollectionTool(LEADER, null, "crc", { key: "x", label: "X" })
        expect(r).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
        const s = await setCollectionSharingTool(LEADER, null, "crc", { collectionId: "crc__nava", visibility: "listed", sharedWith: ["brotherslazaroff"], dryRun: false })
        expect(s).toMatchObject({ ok: false, error: { machine_code: "forbidden_role" } })
    })

    it("a tenant admin dry-runs, then creates its own collection", async () => {
        const dry = await createCollectionTool(ADMIN, "a@x", "crc", { key: "high-holidays", label: "High Holidays" })
        expect(dry).toMatchObject({ dryRun: true, before: null, after: { id: "crc__high-holidays", ownerOrgId: "crc", visibility: "private" } })
        expect((await db.collection("collections").doc("crc__high-holidays").get()).exists).toBe(false)
        const done = await createCollectionTool(ADMIN, "a@x", "crc", { key: "high-holidays", label: "High Holidays", dryRun: false })
        expect(done).toMatchObject({ dryRun: false, changed: true })
        const audit = await db.collection("platformAudit").where("action", "==", "create_collection").get()
        expect(audit.docs[0]?.data()).toMatchObject({ orgId: "crc", actorUid: ADMIN, via: "claude" })
    })

    it("shares its own collection (dry run first) and the charts follow; another tenant's is refused", async () => {
        const dry = await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "crc__supplemental", visibility: "listed", sharedWith: ["brotherslazaroff"] })
        expect(dry).toMatchObject({ dryRun: true, changed: true, before: { visibility: "private" }, after: { visibility: "listed", sharedWith: ["brotherslazaroff"] } })
        expect((await db.collection("library_index").doc("c-sup-1").get()).data()?.visibleToOrgs).toBeUndefined()
        const done = await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "crc__supplemental", visibility: "listed", sharedWith: ["brotherslazaroff"], dryRun: false })
        expect(done).toMatchObject({ dryRun: false, changed: true, visibility: { rows: 1, libraryIndexChanged: 1 } })
        expect((await db.collection("library_index").doc("c-sup-1").get()).data()?.visibleToOrgs).toEqual(["crc", "brotherslazaroff"])

        // An admin of BOTH tenants acting through its crc connector cannot touch BL's collection.
        const other = await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "brotherslazaroff__uploads", visibility: "all", dryRun: false })
        expect(other).toMatchObject({ ok: false, error: { machine_code: "forbidden" } })
        const missing = await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "crc__nope", visibility: "private" })
        expect(missing).toMatchObject({ ok: false, error: { machine_code: "not_found" } })
        expect((missing as { yourCollections: Array<{ id: string }> }).yourCollections.map((c) => c.id)).toContain("crc__nava")
    })

    it("the platform owner's assignment survives a tenant admin going private", async () => {
        await assignCollection("crc__nava", "brotherslazaroff", true, { actor: { uid: "po", via: "claude" }, dryRun: false })
        await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "crc__nava", visibility: "listed", sharedWith: ["brotherslazaroff"], dryRun: false })
        await setCollectionSharingTool(ADMIN, null, "crc", { collectionId: "crc__nava", visibility: "private", sharedWith: [], dryRun: false })
        const rec = (await db.collection("collections").doc("crc__nava").get()).data()
        expect(rec?.assignedTo).toEqual(["brotherslazaroff"])
        expect((await db.collection("library_index").doc("c-nava-1").get()).data()?.visibleToOrgs).toEqual(["crc", "brotherslazaroff"])
    })
})
