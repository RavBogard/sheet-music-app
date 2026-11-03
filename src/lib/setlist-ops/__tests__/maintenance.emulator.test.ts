import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    createSetlistWithRows,
    deleteSetlistRows,
    deleteSetlistsWithRows,
    deleteSetlistTree,
    maintainRows,
    maintainSetlist,
    maintainSetlists,
} from "@/lib/setlist-ops"

/**
 * PR 3b: the server writers that are not author ops. A new setlist lands with
 * all its rows in one transaction; maintenance writes stamp and bump by
 * default; `bump: false` takes only its allowlisted field; and every helper
 * refuses another tenant's setlist or row, writing nothing.
 */
describe("setlist-ops maintenance helpers (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    let n = 0
    const sid = () => `m-${Date.now()}-${n++}`
    const get = async (col: string, id: string) => (await db().collection(col).doc(id).get()).data()
    const T0 = Timestamp.fromMillis(1_000)

    async function seed(rowCount: number, orgId = "crc") {
        const setlistId = sid()
        await db().collection("setlists").doc(setlistId).set({ id: setlistId, orgId, version: 3, updatedAt: T0 })
        const ids: string[] = []
        for (let i = 0; i < rowCount; i++) {
            const id = `${setlistId}-r${i}`
            ids.push(id)
            await db().collection("tracks").doc(id).set({ id, setlistId, orgId, order: i, version: 1, updatedAt: T0 })
        }
        return { setlistId, ids }
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-setlist-ops" })
    })
    afterAll(async () => {
        if (app) await deleteApp(app)
    })

    it("createSetlistWithRows writes the setlist and every row, stamped, in create mode", async () => {
        const setlistId = sid()
        const input = {
            setlistId,
            setlist: { id: setlistId, orgId: "brotherslazaroff", name: "Gig" },
            rows: [{ id: `${setlistId}-a`, data: { orgId: "brotherslazaroff", order: 0, title: "A" } }],
        }
        await createSetlistWithRows(db(), "brotherslazaroff", input, { actor: "u1" })
        expect(await get("setlists", setlistId)).toMatchObject({ orgId: "brotherslazaroff", version: 1, lastModifiedBy: "u1" })
        const r = await get("tracks", `${setlistId}-a`)
        expect(r).toMatchObject({ setlistId, version: 1 })
        expect(r?.updatedAt).toBeInstanceOf(Timestamp)
        // create mode: a second write of the same ids is refused.
        await expect(createSetlistWithRows(db(), "brotherslazaroff", input)).rejects.toThrow()
        // another tenant's caller cannot create it.
        await expect(createSetlistWithRows(db(), "crc", { ...input, setlistId: sid() })).rejects.toThrow(/wrong-tenant/)
    })

    it("maintainSetlist bumps the setlist and each touched row, and merges writes to one doc", async () => {
        const { setlistId, ids } = await seed(3)
        await maintainSetlist(db(), "crc", setlistId, async (_tx, m) => {
            m.updateRow(ids[0], { performedAt: "x" })
            m.updateRow(ids[0], { order: 5 })
            m.deleteRow(ids[1])
            m.addRow("new-" + setlistId, { orgId: "crc", order: 0, title: "Audible", version: 1 })
            m.updateRow("new-" + setlistId, { order: 1 })
            m.updateSetlist({ note: "n" })
        })
        const s = await get("setlists", setlistId)
        expect(s).toMatchObject({ version: 4, note: "n" })
        expect((s?.updatedAt as Timestamp).toMillis()).toBeGreaterThan(1_000)
        const r0 = await get("tracks", ids[0])
        expect(r0).toMatchObject({ version: 2, performedAt: "x", order: 5 })
        expect((r0?.updatedAt as Timestamp).toMillis()).toBeGreaterThan(1_000)
        expect(await get("tracks", ids[1])).toBeUndefined()
        expect(await get("tracks", ids[2])).toMatchObject({ version: 1 })
        expect(await get("tracks", "new-" + setlistId)).toMatchObject({ setlistId, order: 1 })
    })

    it("touchUpdatedAt:false still bumps version but leaves updatedAt", async () => {
        const { setlistId } = await seed(0)
        await maintainSetlist(db(), "crc", setlistId, async (_tx, m) => m.updateSetlist({ musicians: [] }), { touchUpdatedAt: false })
        const s = await get("setlists", setlistId)
        expect(s).toMatchObject({ version: 4 })
        expect((s?.updatedAt as Timestamp).toMillis()).toBe(1_000)
    })

    it("updateRow on a row deleted in the same write throws, and nothing is written", async () => {
        const { setlistId, ids } = await seed(1)
        await expect(
            maintainSetlist(db(), "crc", setlistId, async (_tx, m) => {
                m.deleteRow(ids[0])
                m.updateRow(ids[0], { order: 2 })
            }),
        ).rejects.toThrow(/deleted earlier/)
        expect(await get("tracks", ids[0])).toMatchObject({ version: 1, order: 0 })
    })

    it("bump:false writes only the allowlisted field, unstamped, and refuses anything else", async () => {
        const { setlistId, ids } = await seed(1)
        // no-bump: test of the option itself
        await maintainSetlist(db(), "crc", setlistId, async (_tx, m) => m.updateSetlist({ lastNotifiedAt: "t" }), { bump: false })
        const s = await get("setlists", setlistId)
        expect(s).toMatchObject({ version: 3, lastNotifiedAt: "t" })
        expect((s?.updatedAt as Timestamp).toMillis()).toBe(1_000)
        // no-bump: test of the option itself
        await expect(maintainSetlist(db(), "crc", setlistId, async (_tx, m) => m.updateSetlist({ name: "x" }), { bump: false })).rejects.toThrow(/may not set name/)
        // no-bump: test of the option itself
        await expect(maintainSetlist(db(), "crc", setlistId, async (_tx, m) => m.updateRow(ids[0], { order: 9 }), { bump: false })).rejects.toThrow(/may not touch rows/)
        expect(await get("tracks", ids[0])).toMatchObject({ order: 0 })
    })

    it("a callback that queues nothing writes nothing", async () => {
        const { setlistId } = await seed(0)
        await maintainSetlist(db(), "crc", setlistId, async () => undefined)
        expect(await get("setlists", setlistId)).toMatchObject({ version: 3 })
    })

    it("another tenant's setlist or row is refused and nothing is written, including the callback's own writes", async () => {
        const crc = await seed(1, "crc")
        const receipt = db().collection("receipts").doc(sid())
        await expect(
            maintainSetlist(db(), "brotherslazaroff", crc.setlistId, async (tx, m) => {
                tx.set(receipt, { x: 1 })
                m.updateSetlist({ note: "leak" })
            }),
        ).rejects.toThrow(/wrong-tenant/)
        expect(await get("setlists", crc.setlistId)).toEqual({ id: crc.setlistId, orgId: "crc", version: 3, updatedAt: T0 })
        expect(await get("receipts", receipt.id)).toBeUndefined()

        await expect(maintainSetlists(db(), "brotherslazaroff", [{ setlistId: crc.setlistId, patch: { isTest: true } }])).rejects.toThrow(/wrong-tenant/)
        await expect(maintainRows(db(), "brotherslazaroff", [{ rowId: crc.ids[0], setlistId: crc.setlistId, patch: { mimeType: "x" } }])).rejects.toThrow(/wrong-tenant/)
        await expect(deleteSetlistRows(db(), "brotherslazaroff", crc.setlistId)).rejects.toThrow(/wrong-tenant/)
        await expect(deleteSetlistsWithRows(db(), "brotherslazaroff", [crc.setlistId])).rejects.toThrow(/wrong-tenant/)
        await expect(deleteSetlistTree(db(), "brotherslazaroff", crc.setlistId)).rejects.toThrow(/wrong-tenant/)
        expect(await get("setlists", crc.setlistId)).toMatchObject({ version: 3 })
        expect(await get("tracks", crc.ids[0])).toMatchObject({ version: 1 })
        expect(await get("tracks", crc.ids[0])).not.toHaveProperty("mimeType")
    })

    it("maintainSetlists / maintainRows skip what is gone and bump what they write", async () => {
        const a = await seed(2)
        const res = await maintainSetlists(db(), "crc", [
            { setlistId: a.setlistId, patch: { isTest: true } },
            { setlistId: "gone-" + a.setlistId, patch: { isTest: true } },
        ])
        expect(res).toEqual({ written: [a.setlistId], skipped: ["gone-" + a.setlistId] })
        expect(await get("setlists", a.setlistId)).toMatchObject({ isTest: true, version: 4 })

        const rows = await maintainRows(db(), "crc", [
            { rowId: a.ids[0], setlistId: a.setlistId, patch: { mimeType: "application/pdf" } },
            { rowId: "gone-row", setlistId: a.setlistId, patch: { mimeType: "application/pdf" } },
        ])
        expect(rows).toEqual({ written: [a.ids[0]], skipped: ["gone-row"] })
        expect(await get("tracks", a.ids[0])).toMatchObject({ mimeType: "application/pdf", version: 2 })
        expect(await get("tracks", "gone-row")).toBeUndefined()
        expect(await get("setlists", a.setlistId)).toMatchObject({ version: 5 })
    })

    it("maintainRows refuses one setlist's rows that do not fit one transaction, before writing", async () => {
        const a = await seed(1)
        const many = Array.from({ length: 500 }, (_, i) => ({ rowId: i === 0 ? a.ids[0] : `x-${i}`, setlistId: a.setlistId, patch: { mimeType: "x" } }))
        await expect(maintainRows(db(), "crc", many)).rejects.toThrow(/too-large/)
        expect(await get("tracks", a.ids[0])).not.toHaveProperty("mimeType")
    })

    it("deleteSetlistsWithRows removes the rows and the setlist", async () => {
        const a = await seed(2)
        expect(await deleteSetlistsWithRows(db(), "crc", [a.setlistId])).toEqual({ setlists: 1, tracks: 2 })
        expect(await get("setlists", a.setlistId)).toBeUndefined()
        expect(await get("tracks", a.ids[0])).toBeUndefined()
    })
})
