import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { createSetlistForCaller } from "@/lib/setlist-ops"

/**
 * POST /api/setlists/create (setlist sync PR 3): the browser's create,
 * duplicate, clone and save-as-template, in one transaction. The tenant is the
 * source's when copying and the host's otherwise; the caller must be a band
 * leader or admin there. The other tenant can neither read a source through
 * it nor land a setlist in it.
 */
describe("createSetlistForCaller (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    const CRC_LEAD = "c-crc-lead"
    const BL_LEAD = "c-bl-lead"
    const CRC_MUS = "c-crc-mus"
    let n = 0
    const id = () => `new-${Date.now()}-${n++}`

    async function rowsOf(setlistId: string) {
        const snap = await db().collection("tracks").where("setlistId", "==", setlistId).get()
        return snap.docs.map((d) => d.data()).sort((a, b) => (a.order as number) - (b.order as number))
    }

    beforeAll(async () => {
        app = getApps()[0] ?? initializeApp({ projectId: "demo-setlist-ops" })
        const m = db().collection("memberships")
        await Promise.all([
            m.doc(`crc__${CRC_LEAD}`).set({ uid: CRC_LEAD, tenantId: "crc", role: "band_leader" }),
            m.doc(`brotherslazaroff__${BL_LEAD}`).set({ uid: BL_LEAD, tenantId: "brotherslazaroff", role: "band_leader" }),
            m.doc(`crc__${CRC_MUS}`).set({ uid: CRC_MUS, tenantId: "crc", role: "musician" }),
        ])
        await db().collection("setlists").doc("bl-src").set({ id: "bl-src", orgId: "brotherslazaroff", name: "BL show", version: 3 })
        await db().collection("tracks").doc("bl-src-r0").set({ id: "bl-src-r0", setlistId: "bl-src", orgId: "brotherslazaroff", order: 0, title: "Opener", key: "G", version: 9, opBatchId: "x" })
        await db().collection("tracks").doc("bl-src-r1").set({ id: "bl-src-r1", setlistId: "bl-src", orgId: "brotherslazaroff", order: 1, title: "Closer", type: "song" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    it("a fresh setlist lands in the host tenant with its rows, renumbered, counted, stamped once", async () => {
        const setlistId = id()
        const r = await createSetlistForCaller(db(), CRC_LEAD, "crc", {
            setlistId,
            name: "Friday",
            rows: [{ title: "A", fileId: "c1" }, { title: "B", type: "header" }],
        })
        expect(r).toMatchObject({ ok: true, setlistId, orgId: "crc", trackCount: 2 })
        const s = (await db().collection("setlists").doc(setlistId).get()).data()!
        expect(s).toMatchObject({ orgId: "crc", trackCount: 2, songCount: 1, version: 1, ownerId: CRC_LEAD })
        const rows = await rowsOf(setlistId)
        expect(rows.map((x) => [x.title, x.order, x.orgId, x.version])).toEqual([
            ["A", 0, "crc", 1],
            ["B", 1, "crc", 1],
        ])
        expect(rows[0].songId).toBe("c1")
    })

    it("a copy takes the SOURCE's tenant and its rows (known fields only), whatever the host says", async () => {
        const setlistId = id()
        const r = await createSetlistForCaller(db(), BL_LEAD, "crc", { setlistId, name: "Copy", copyFrom: "bl-src", copyKind: "copiedFrom" })
        expect(r).toMatchObject({ ok: true, orgId: "brotherslazaroff", trackCount: 2 })
        const rows = await rowsOf(setlistId)
        expect(rows.map((x) => x.title)).toEqual(["Opener", "Closer"])
        expect(rows[0]).toMatchObject({ key: "G", version: 1, orgId: "brotherslazaroff" })
        expect(rows[0].opBatchId).toBeUndefined()
        expect((await db().collection("setlists").doc(setlistId).get()).data()?.copiedFrom).toBe("bl-src")
    })

    it("a clone loses nothing: every stored field of the row is copied except identity, tenant, parent and stamps", async () => {
        const full = {
            title: "T", type: "song", key: "G", bpm: 90, leadMusician: "Sam", referenceLink: "x", notes: "n",
            songId: "s1", fileId: "s1", fileName: "f.pdf", mimeType: "application/pdf", performer: "p", description: "d",
            estimatedMinutes: 3, momentId: "m", fixed: true, honors: [{ name: "A" }], durationSec: 200, segue: true,
            singerKeys: [{ musician: "Sam", key: "A" }], pageNumber: 3, audioFileId: "a1", audioFileName: "a.mp3",
            transposition: -2, tune: "Carlebach", duration: "3:30", unmatched: true,
            chartStatus: "needs-check", // a stored field the editor does not write: still carried
        }
        await db().collection("setlists").doc("crc-full").set({ id: "crc-full", orgId: "crc", name: "Full", rabbiSlot: "randy" })
        await db().collection("tracks").doc("crc-full-r0").set({
            ...full, id: "crc-full-r0", setlistId: "crc-full", orgId: "crc", order: 0, version: 7, updatedAt: new Date(), opBatchId: "z",
        })
        const setlistId = id()
        const r = await createSetlistForCaller(db(), CRC_LEAD, "crc", {
            setlistId, name: "Clone", copyFrom: "crc-full", copyKind: "clonedFrom", rabbiSlot: "randy",
        })
        expect(r).toMatchObject({ ok: true })
        const [row] = await rowsOf(setlistId)
        const { id: _i, setlistId: _s, orgId, order, version, createdAt: _c, updatedAt: _u, lastModifiedAt: _l, ...rest } = row as Record<string, unknown>
        expect(rest).toEqual(full)
        expect({ orgId, order, version }).toEqual({ orgId: "crc", order: 0, version: 1 })
        expect((await db().collection("setlists").doc(setlistId).get()).data()?.rabbiSlot).toBe("randy")
    })

    it("musicians: a uid with no standing in the tenant is dropped; a status sent by the client is ignored", async () => {
        const setlistId = id()
        await createSetlistForCaller(db(), CRC_LEAD, "crc", {
            setlistId,
            name: "Band",
            musicians: [
                { uid: CRC_MUS, name: "Member", email: "m@x", status: "confirmed" },
                { uid: BL_LEAD, name: "Other tenant", email: "o@x" },
            ],
        })
        const s = (await db().collection("setlists").doc(setlistId).get()).data()!
        expect(s.musicians).toEqual([
            { uid: CRC_MUS, name: "Member", email: "m@x" },
            { name: "Other tenant", email: "o@x" },
        ])
        expect(s.assignedUids).toEqual([CRC_MUS])
    })

    it("the other tenant: copying its setlist reads as not-found, and nothing is written", async () => {
        const setlistId = id()
        const r = await createSetlistForCaller(db(), CRC_LEAD, "crc", { setlistId, name: "Steal", copyFrom: "bl-src" })
        expect(r).toEqual({ ok: false, reason: "not-found" })
        expect((await db().collection("setlists").doc(setlistId).get()).exists).toBe(false)
    })

    it("a CRC lead cannot create in the band's tenant; a musician cannot create at all", async () => {
        expect(await createSetlistForCaller(db(), CRC_LEAD, "brotherslazaroff", { setlistId: id(), name: "X" })).toMatchObject({ ok: false, reason: "forbidden" })
        expect(await createSetlistForCaller(db(), CRC_MUS, "crc", { setlistId: id(), name: "X" })).toMatchObject({ ok: false, reason: "forbidden" })
    })

    it("a repeat of the same request replays; another request on the same id is refused", async () => {
        const setlistId = id()
        const body = { setlistId, name: "Once", rows: [{ title: "A" }] }
        expect(await createSetlistForCaller(db(), CRC_LEAD, "crc", body)).toMatchObject({ ok: true })
        expect(await createSetlistForCaller(db(), CRC_LEAD, "crc", body)).toMatchObject({ ok: true, replayed: true })
        expect(await createSetlistForCaller(db(), CRC_LEAD, "crc", { ...body, name: "Other" })).toMatchObject({ ok: false, reason: "invalid" })
        expect(await rowsOf(setlistId)).toHaveLength(1)
    })

    it("unknown or server-owned row fields refuse the whole create", async () => {
        const r = await createSetlistForCaller(db(), CRC_LEAD, "crc", { setlistId: id(), name: "X", rows: [{ title: "A", version: 3 }] })
        expect(r).toMatchObject({ ok: false, reason: "invalid" })
    })
})
