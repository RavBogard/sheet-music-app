// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

process.env.FIREBASE_STORAGE_BUCKET = "demo-p5-nava.appspot.com"
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null), checkUserRateLimit: vi.fn(async () => null) }))

import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import type { Bucket } from "@google-cloud/storage"
import { NextRequest } from "next/server"

import { applyStamp, planStamp, undoStamp } from "@/lib/library/stamp-visibility"
import { applyNavaMove, planNavaMove, undoNavaMove, MoveError } from "@/lib/library/nava-move"
import { recomputeCollectionVisibility } from "@/lib/library/visibility-job"
import { getSong, listLibrary, searchLibrary } from "@/lib/mcp/tools/library"
import { getSetlist } from "@/lib/mcp/tools/setlists"
import { updateSong } from "@/lib/mcp/tools/song-metadata"
import { markChartStatus } from "@/lib/mcp/tools/mark-chart-status"
import { P5_FIXTURE_INDEX, seedP5Library } from "./p5-fixture"

vi.mock("@/lib/file-fetcher", async (orig) => ({
    ...(await orig<typeof import("@/lib/file-fetcher")>()),
    getChartHealth: vi.fn().mockResolvedValue({ status: "ok", source: "firebase-storage" }),
}))

/**
 * Multi-tenant phase 5 — REHEARSAL of the stamp and the nava ownership move
 * (ruling 6) on a fixture shaped like production, against the Firestore and
 * Storage emulators. The lead repeats this on a restored production export.
 *
 * Stamp: every row and object visible only to its owner; reads unchanged.
 * Move: CRC's tab, setlists, chart bytes and Perform tracks keep working; CRC
 * can use but not change the charts; BL sees none; Nava owns them.
 * Undo (move, then stamp): every document and object is byte-identical to
 * where it started.
 */
const ADMIN = "p5-nava-admin"
const NAVA = "nava-tehila"
const NAVA_IDS = ["c-nava-1", "c-nava-2", "c-nava-arch"]

describe("P5 nava move rehearsal (emulator)", () => {
    let app: App
    let db: Firestore
    let bucket: Bucket

    async function snapshotAll() {
        const out: Record<string, unknown> = {}
        for (const c of ["library_index", "songs", "tracks", "setlists", "collections"]) {
            const snap = await db.collection(c).get()
            for (const d of snap.docs) out[`${c}/${d.id}`] = d.data()
        }
        const [files] = await bucket.getFiles({ prefix: "library/" })
        for (const f of files) {
            const [m] = await f.getMetadata()
            out[`gs/${f.name}`] = m.metadata ?? {}
        }
        return JSON.parse(JSON.stringify(out))
    }
    const ids = (r: unknown) => ((r as { rows: Array<{ fileId: string }> }).rows ?? []).map((x) => x.fileId)
    const reads = async () => ({
        crcDefault: ids(await listLibrary(ADMIN, { limit: 200 }, "crc")),
        crcNava: ids(await listLibrary(ADMIN, { collection: "nava", limit: 200 }, "crc")),
        crcSearchLakh: (await searchLibrary(ADMIN, { query: "lakh" }, "crc")).map((s) => s.id),
        blAll: ids(await listLibrary(ADMIN, { limit: 200, includeShared: true } as never, "brotherslazaroff")),
        blSearch: (await searchLibrary(ADMIN, { query: "", limit: 50, includeShared: true } as never, "brotherslazaroff")).map((s) => s.id),
    })

    beforeAll(async () => {
        app = getApps()[0] ?? initializeApp({ projectId: "demo-p5-nava", storageBucket: "demo-p5-nava.appspot.com" })
        db = getFirestore(app)
        bucket = getStorage(app).bucket("demo-p5-nava.appspot.com") as unknown as Bucket
        await seedP5Library(db, { admin: ADMIN, withCollections: true })
        const [files] = await bucket.getFiles({ prefix: "library/" })
        await Promise.all(files.map((f) => f.delete()))
        for (const [id, r] of Object.entries(P5_FIXTURE_INDEX)) {
            if (String(r.mimeType) !== "application/pdf") continue
            await bucket.file(`library/${id}.pdf`).save(Buffer.from(`%PDF ${id}`), {
                metadata: { contentType: "application/pdf", metadata: { orgId: String(r.orgId) } },
            })
        }
    }, 120_000)

    afterAll(async () => {
        await deleteApp(app)
    })

    it("refuses a tenant that does not exist", async () => {
        await expect(planNavaMove(db, bucket, NAVA)).rejects.toBeInstanceOf(MoveError)
        await expect(planNavaMove(db, bucket, "crc")).rejects.toBeInstanceOf(MoveError)
    })

    it("stamp, move, then undo both: everything resolves throughout and ends byte-identical", async () => {
        const start = await snapshotAll()
        const readsStart = await reads()
        const tracksStart = (await db.collection("tracks").get()).docs.map((d) => [d.id, d.data()])
        const setlistStart = JSON.stringify(await getSetlist(ADMIN, { id: "s-crc-up" }, "crc"))

        // ── stamp: owner-only everywhere, reads unchanged ──
        const stamp = await planStamp(db, bucket, "demo")
        expect(stamp.summary.sharedRows).toBe(0)
        await applyStamp(db, bucket, stamp)
        for (const d of (await db.collection("library_index").get()).docs) {
            expect(d.get("visibleToOrgs"), d.id).toEqual([d.get("orgId")])
        }
        expect((await bucket.file("library/b-core-1.pdf").getMetadata())[0].metadata?.visibleTo).toBe("brotherslazaroff")
        expect(await reads()).toEqual(readsStart)
        expect((await planStamp(db, bucket, "demo")).docs).toHaveLength(0) // idempotent
        const stamped = await snapshotAll()

        // ── move ──
        await db.collection("orgs").doc(NAVA).set({ id: NAVA, name: "Nava Tehila" })
        const plan = await planNavaMove(db, bucket, NAVA, "demo")
        expect(plan.summary).toMatchObject({ library_index: 3, songs: 3, objects: 3, "status:active": 2, "status:archived": 1 })
        expect(plan.targetCollectionBefore).toBeNull()
        const moved = await applyNavaMove(db, bucket, JSON.parse(JSON.stringify(plan)))
        expect(moved.docs).toBe(6)

        for (const id of NAVA_IDS) {
            const li = (await db.collection("library_index").doc(id).get()).data()
            expect(li).toMatchObject({ orgId: NAVA, collection: "nava", collectionId: `${NAVA}__nava`, visibleToOrgs: [NAVA, "crc"], libraryOrgs: [NAVA, "crc"], previousOrgId: "crc" })
        }
        expect((await bucket.file("library/c-nava-1.pdf").getMetadata())[0].metadata).toMatchObject({ orgId: NAVA, visibleTo: `${NAVA},crc` })
        expect((await db.collection("collections").doc(`${NAVA}__nava`).get()).data()).toMatchObject({ ownerOrgId: NAVA, visibility: "listed", sharedWith: ["crc"], assignedTo: ["crc"] })
        expect((await db.collection("collections").doc("crc__nava").get()).get("movedTo")).toBe(`${NAVA}__nava`)
        // The visibility job agrees with what the move wrote (no drift on the next sharing change).
        const job = await recomputeCollectionVisibility(`${NAVA}__nava`, { db, bucket })
        expect([job.libraryIndexChanged, job.songsChanged, job.storageChanged]).toEqual([0, 0, 0])

        // CRC: tab, default library and search unchanged; setlists and tracks untouched.
        expect(await reads()).toEqual(readsStart)
        const search = await searchLibrary(ADMIN, { query: "lakh" }, "crc")
        expect((search[0] as { ownerOrgId?: string }).ownerOrgId).toBe(NAVA)
        expect((await db.collection("tracks").get()).docs.map((d) => [d.id, d.data()])).toEqual(tracksStart)
        expect(JSON.stringify(await getSetlist(ADMIN, { id: "s-crc-up" }, "crc"))).toBe(setlistStart)
        expect(await getSong(ADMIN, { id: "c-nava-1" }, "crc")).toMatchObject({ id: "c-nava-1", title: "Lakh Amar Libi" })

        // Chart bytes by fileId, as Perform and links fetch them.
        const { GET } = await import("@/app/api/library/file/[id]/route")
        const res = await GET(
            new NextRequest("http://localhost/api/library/file/c-nava-1", { headers: { "sec-fetch-site": "same-origin", "x-org-id": "crc" } }),
            { params: Promise.resolve({ id: "c-nava-1" }) },
        )
        expect(res.status).toBe(200)
        expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF c-nava-1")

        // CRC can use but not change them.
        const msg = "Lakh Amar Libi belongs to Nava Tehila; you can use it but not change it."
        const upd = await updateSong(ADMIN, { id: "c-nava-1", key: "Bm" }, "crc")
        expect(upd).toMatchObject({ ok: false, error: { machine_code: "not_owner", message: msg } })
        const mark = await markChartStatus(ADMIN, { fileId: "c-nava-1", toStatus: "archived", dryRun: false, force: true } as never, "crc")
        expect(mark).toMatchObject({ ok: false, error: { machine_code: "not_owner", message: msg } })
        expect((await db.collection("library_index").doc("c-nava-1").get()).get("status")).toBe("active")

        // BL sees none of them; Nava sees them as its own.
        expect(await getSong(ADMIN, { id: "c-nava-1" }, "brotherslazaroff")).toBeNull()
        const navaList = ids(await listLibrary(ADMIN, { limit: 200 }, NAVA))
        expect(navaList.sort()).toEqual(["c-nava-1", "c-nava-2"])

        // ── undo the move, then the stamp ──
        const u1 = await undoNavaMove(db, bucket, JSON.parse(JSON.stringify(plan)), true)
        expect(u1.skipped).toEqual([])
        expect(await snapshotAll()).toEqual(stamped)
        const u2 = await undoStamp(db, bucket, JSON.parse(JSON.stringify(stamp)), true)
        expect(u2.skipped).toEqual([])
        const end = await snapshotAll()
        delete (end as Record<string, unknown>)[`orgs/${NAVA}`]
        expect(end).toEqual(start)
        expect(await reads()).toEqual(readsStart)
    })
})
