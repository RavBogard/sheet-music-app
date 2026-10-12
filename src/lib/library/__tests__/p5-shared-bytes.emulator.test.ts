// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

process.env.FIREBASE_STORAGE_BUCKET = "demo-p5-bytes.appspot.com"
vi.mock("@/lib/library/library-events", async (orig) => ({
    ...(await orig<typeof import("@/lib/library/library-events")>()),
    emitLibraryRowCreated: vi.fn(),
}))

import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

import { healChartBytes } from "@/lib/chart-heal"
import { SHARED_BYTES_REPLACED } from "@/lib/library/shared-bytes-audit"
import { seedP5Library } from "./p5-fixture"

/**
 * Multi-tenant phase 5 — byte replacements on charts other tenants can see.
 * healChartBytes is the one in-place byte writer behind salvage_chart_bytes and
 * finalize_chart_upload's heal mode: it now refuses a caller that does not own
 * the chart, keeps the object's `visibleTo`, and logs a replacement on a shared
 * chart to platformAudit. A private chart's heal writes no audit row.
 */
describe("P5 shared chart byte replacement (emulator)", () => {
    let app: App
    let db: Firestore
    const NAVA = "nava-tehila"
    const audits = async () => (await db.collection("platformAudit").where("action", "==", SHARED_BYTES_REPLACED).get()).docs.map((d) => d.data())

    beforeAll(async () => {
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-bytes", storageBucket: "demo-p5-bytes.appspot.com" })
        db = getFirestore(app)
    }, 60_000)
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        await seedP5Library(db, { admin: "p5-bytes-admin" })
        const shared = { orgId: NAVA, collectionId: `${NAVA}__nava`, visibleToOrgs: [NAVA, "crc"], libraryOrgs: [NAVA, "crc"] }
        await db.collection("library_index").doc("c-nava-1").update(shared)
        await db.collection("songs").doc("c-nava-1").update(shared)
        await db.collection("collections").doc(`${NAVA}__nava`).set({ ownerOrgId: NAVA, name: "nava", label: "Nava Tehila", visibility: "listed", sharedWith: ["crc"], assignedTo: ["crc"] })
        await db.collection("orgs").doc(NAVA).set({ name: "Nava Tehila" })
    }, 60_000)

    const pdf = Buffer.from("%PDF-1.4 new bytes")

    it("the owner replaces a shared chart: audited, visibility kept on the object", async () => {
        const r = await healChartBytes(db, "nava-admin", "c-nava-1", pdf, "application/pdf", "upload-session", NAVA)
        expect(r).toMatchObject({ ok: true, sizeBytes: pdf.byteLength })
        const a = await audits()
        expect(a).toHaveLength(1)
        expect(a[0]).toMatchObject({ orgId: NAVA, actorUid: "nava-admin", after: { fileId: "c-nava-1", sharedWith: ["crc"], source: "upload-session" } })
        const [meta] = await getStorage(app).bucket("demo-p5-bytes.appspot.com").file("library/c-nava-1.pdf").getMetadata()
        expect(meta.metadata).toMatchObject({ orgId: NAVA, visibleTo: `${NAVA},crc` })
        // The row keeps its id and visibility; tracks still point at it.
        expect((await db.collection("library_index").doc("c-nava-1").get()).data()).toMatchObject({ orgId: NAVA, visibleToOrgs: [NAVA, "crc"], status: "active" })
        expect((await db.collection("tracks").doc("t-crc-1").get()).data()?.fileId).toBe("c-nava-1")
    })

    it("a tenant that only uses the chart is refused with the clear message; a stranger gets not-found", async () => {
        const crc = await healChartBytes(db, "crc-admin", "c-nava-1", pdf, "application/pdf", "upload-session", "crc")
        expect(crc).toMatchObject({ ok: false, error: { machine_code: "not_owner", message: "Lakh Amar Libi belongs to Nava Tehila; you can use it but not change it." } })
        const bl = await healChartBytes(db, "bl-admin", "c-nava-1", pdf, "application/pdf", "upload-session", "brotherslazaroff")
        expect(bl).toMatchObject({ ok: false, error: { machine_code: "row_not_found" } })
        expect(await audits()).toHaveLength(0)
    })

    it("a private chart's replacement writes no audit row", async () => {
        const r = await healChartBytes(db, "crc-admin", "c-core-1", pdf, "application/pdf", "drive", "crc")
        expect(r).toMatchObject({ ok: true })
        expect(await audits()).toHaveLength(0)
    })
})
