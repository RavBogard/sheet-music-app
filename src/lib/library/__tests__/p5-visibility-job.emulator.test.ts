// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import type { Bucket } from "@google-cloud/storage"

import { recomputeCollectionVisibility, recomputeRowVisibility } from "@/lib/library/visibility-job"
import {
    __setPlatformDeps,
    assignCollection,
    createCollection,
    setCollectionSharing,
    setOwnCollectionSharing,
} from "@/lib/platform/tenants"
import { P5_FIXTURE_TRACKS, seedP5Library } from "./p5-fixture"

/**
 * Multi-tenant phase 5 — the visibility job against the Firestore AND Storage
 * emulators: it stamps library_index, songs and Storage metadata from the
 * collection record, is idempotent, and runs after every platform / tenant-admin
 * sharing write. Unsharing touches no setlist row.
 */
const ADMIN = "p5-job-admin"
const actor = { uid: ADMIN, email: null, via: "claude" as const }

describe("P5 visibility job (emulator)", () => {
    let app: App
    let db: Firestore
    let bucket: Bucket

    const meta = async (name: string) => {
        const [m] = await bucket.file(name).getMetadata()
        return (m.metadata ?? {}) as Record<string, unknown>
    }
    const row = async (coll: string, id: string) => (await db.collection(coll).doc(id).get()).data() ?? {}

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        expect(process.env.FIREBASE_STORAGE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-job" })
        db = getFirestore(app)
        bucket = getStorage(app).bucket("demo-p5-job.appspot.com") as unknown as Bucket
    }, 60_000)

    afterAll(async () => {
        __setPlatformDeps({})
        await deleteApp(app)
    })

    beforeEach(async () => {
        await seedP5Library(db, { admin: ADMIN, withCollections: true })
        const [files] = await bucket.getFiles({ prefix: "library/" })
        await Promise.all(files.map((f) => f.delete()))
        for (const [name, orgId] of [
            ["library/c-nava-1.pdf", "crc"],
            ["library/c-nava-2.pdf", "crc"],
            ["library/c-nava-2/page-1.png", "crc"],
            ["library/c-nava-20.pdf", "crc"], // a different id sharing the prefix
            ["library/c-core-1.pdf", "crc"],
        ]) {
            await bucket.file(name).save(Buffer.from("%PDF"), { metadata: { contentType: "application/pdf", metadata: { orgId } } })
        }
        __setPlatformDeps({
            db,
            recomputeVisibility: (id) => recomputeCollectionVisibility(id, { db, bucket }),
        })
    }, 60_000)

    it("starts owner-only, stamps rows that have no stamp, and is idempotent", async () => {
        const r1 = await recomputeCollectionVisibility("crc__nava", { db, bucket })
        expect(r1.stamp).toEqual({ collectionId: "crc__nava", visibleToOrgs: ["crc"], libraryOrgs: ["crc"] })
        expect(r1.rows).toBe(3) // c-nava-1, c-nava-2, c-nava-arch
        expect(r1.libraryIndexChanged).toBe(3)
        expect(r1.songsChanged).toBe(3)
        expect(await meta("library/c-nava-2/page-1.png")).toMatchObject({ visibleTo: "crc", orgId: "crc" })
        expect((await meta("library/c-nava-20.pdf")).visibleTo).toBeUndefined()
        const r2 = await recomputeCollectionVisibility("crc__nava", { db, bucket })
        expect([r2.libraryIndexChanged, r2.songsChanged, r2.storageChanged]).toEqual([0, 0, 0])
        // core = rows with no / unknown / "core" collection
        const core = await recomputeCollectionVisibility("crc__core", { db, bucket: null })
        expect(core.rows).toBe(6)
        expect((await row("library_index", "c-core-2")).collectionId).toBe("crc__core")
    })

    it("platform set_collection_sharing applies, audits and re-stamps rows and Storage", async () => {
        const dry = await setCollectionSharing("crc__nava", { visibility: "listed", sharedWith: ["brotherslazaroff"] }, { actor })
        expect(dry.dryRun).toBe(true)
        expect((await row("library_index", "c-nava-1")).visibleToOrgs).toBeUndefined()
        const applied = await setCollectionSharing("crc__nava", { visibility: "listed", sharedWith: ["brotherslazaroff"] }, { actor, dryRun: false })
        expect(applied.visibility).toMatchObject({ rows: 3, libraryIndexChanged: 3, songsChanged: 3 })
        expect(await row("library_index", "c-nava-1")).toMatchObject({ visibleToOrgs: ["crc", "brotherslazaroff"], libraryOrgs: ["crc"], collectionId: "crc__nava" })
        expect(await row("songs", "c-nava-1")).toMatchObject({ visibleToOrgs: ["crc", "brotherslazaroff"] })
        expect((await meta("library/c-nava-1.pdf")).visibleTo).toBe("crc,brotherslazaroff")
        expect((await row("library_index", "c-core-1")).visibleToOrgs).toBeUndefined() // other collections untouched
        const audit = await db.collection("platformAudit").where("action", "==", "set_collection_sharing").get()
        expect(audit.size).toBe(1)

        await assignCollection("crc__nava", "brotherslazaroff", true, { actor, dryRun: false })
        expect((await row("library_index", "c-nava-2")).libraryOrgs).toEqual(["crc", "brotherslazaroff"])

        // A tenant admin cannot remove the platform owner's assignment by going private.
        await setCollectionSharing("crc__nava", { visibility: "private", sharedWith: [] }, { actor, dryRun: false })
        expect((await row("library_index", "c-nava-2")).visibleToOrgs).toEqual(["crc", "brotherslazaroff"])
        await assignCollection("crc__nava", "brotherslazaroff", false, { actor, dryRun: false })
        expect(await row("library_index", "c-nava-2")).toMatchObject({ visibleToOrgs: ["crc"], libraryOrgs: ["crc"] })
        expect((await meta("library/c-nava-2.pdf")).visibleTo).toBe("crc")
    })

    it("visibility all lists every active tenant", async () => {
        await db.collection("orgs").doc("nava-tehila").set({ id: "nava-tehila", name: "Nava Tehila", status: "active" })
        await db.collection("orgs").doc("gone").set({ id: "gone", name: "Gone", status: "suspended" })
        const r = await setCollectionSharing("crc__supplemental", { visibility: "all", sharedWith: [] }, { actor, dryRun: false })
        const v = (await row("library_index", "c-sup-1")).visibleToOrgs as string[]
        expect(v[0]).toBe("crc")
        expect(v).toContain("brotherslazaroff")
        expect(v).not.toContain("gone")
        expect(r.visibility?.rows).toBe(1)
    })

    it("unsharing leaves every setlist row as it was (tracks resolve by fileId)", async () => {
        await setCollectionSharing("crc__nava", { visibility: "listed", sharedWith: ["brotherslazaroff"] }, { actor, dryRun: false })
        const before = (await db.collection("tracks").get()).docs.map((d) => [d.id, d.data()])
        await setCollectionSharing("crc__nava", { visibility: "private", sharedWith: [] }, { actor, dryRun: false })
        const after = (await db.collection("tracks").get()).docs.map((d) => [d.id, d.data()])
        expect(after).toEqual(before)
        expect(Object.fromEntries(after)).toMatchObject(P5_FIXTURE_TRACKS)
        expect(await row("library_index", "c-nava-1")).toMatchObject({ name: "Lakh Amar Libi.pdf", status: "active" })
    })

    it("tenant admins create collections and change sharing on their own only", async () => {
        const dry = await createCollection("brotherslazaroff", { key: "covers", label: "Covers" }, { actor })
        expect(dry).toMatchObject({ dryRun: true, before: null, after: { id: "brotherslazaroff__covers", visibility: "private" } })
        expect((await db.collection("collections").doc("brotherslazaroff__covers").get()).exists).toBe(false)
        const done = await createCollection("brotherslazaroff", { key: "covers", label: "Covers" }, { actor, dryRun: false })
        expect(done.auditId).toBeTruthy()
        await expect(createCollection("brotherslazaroff", { key: "covers", label: "x" }, { actor, dryRun: false })).rejects.toThrow(/already has/)
        await expect(createCollection("brotherslazaroff", { key: "Bad Key", label: "x" }, { actor })).rejects.toThrow(/lowercase/)

        await expect(
            setOwnCollectionSharing("brotherslazaroff", "crc__nava", { visibility: "listed", sharedWith: ["brotherslazaroff"] }, { actor, dryRun: false }),
        ).rejects.toThrow(/belongs to another tenant/)
        const own = await setOwnCollectionSharing("brotherslazaroff", "brotherslazaroff__uploads", { visibility: "listed", sharedWith: ["crc"] }, { actor, dryRun: false })
        expect(own.changed).toBe(true)
        expect((await row("library_index", "b-up-1")).visibleToOrgs).toEqual(["brotherslazaroff", "crc"])
    })

    it("recomputeRowVisibility follows a row's changed collection", async () => {
        await setCollectionSharing("crc__nava", { visibility: "listed", sharedWith: ["brotherslazaroff"] }, { actor, dryRun: false })
        await db.collection("library_index").doc("c-nava-1").update({ collection: "core" })
        const s = await recomputeRowVisibility("c-nava-1", { db, bucket })
        expect(s).toEqual({ collectionId: "crc__core", visibleToOrgs: ["crc"], libraryOrgs: ["crc"] })
        expect((await meta("library/c-nava-1.pdf")).visibleTo).toBe("crc")
        expect(await recomputeRowVisibility("no-such-row", { db, bucket })).toBeNull()
    })
})
