import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    createSetlistWithRows,
    deleteSetlistsWithRows,
    maintainRows,
    maintainSetlist,
    maintainSetlists,
} from "@/lib/setlist-ops"

/**
 * PR 3b: the server writers that are not author ops. A new setlist lands with
 * all its rows in one transaction; maintenance writes stamp and bump by
 * default, and `bump: false` leaves every stamp alone.
 */
describe("setlist-ops maintenance helpers (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    let n = 0
    const sid = () => `m-${Date.now()}-${n++}`
    const get = async (col: string, id: string) => (await db().collection(col).doc(id).get()).data()

    async function seed(rowCount: number) {
        const setlistId = sid()
        await db().collection("setlists").doc(setlistId).set({ id: setlistId, orgId: "crc", version: 3, updatedAt: Timestamp.fromMillis(1_000) })
        const ids: string[] = []
        for (let i = 0; i < rowCount; i++) {
            const id = `${setlistId}-r${i}`
            ids.push(id)
            await db().collection("tracks").doc(id).set({ id, setlistId, orgId: "crc", order: i, version: 1, updatedAt: Timestamp.fromMillis(1_000) })
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

    it("createSetlistWithRows writes the setlist and every row, stamped", async () => {
        const setlistId = sid()
        await createSetlistWithRows(
            db(),
            { setlistId, setlist: { id: setlistId, orgId: "brotherslazaroff", name: "Gig" }, rows: [{ id: `${setlistId}-a`, data: { order: 0, title: "A" } }] },
            { actor: "u1" },
        )
        const s = await get("setlists", setlistId)
        const r = await get("tracks", `${setlistId}-a`)
        expect(s).toMatchObject({ orgId: "brotherslazaroff", version: 1, lastModifiedBy: "u1" })
        expect(r).toMatchObject({ setlistId, version: 1 })
        expect(r?.updatedAt).toBeInstanceOf(Timestamp)
    })

    it("maintainSetlist bumps the setlist and each touched row, and merges writes to one doc", async () => {
        const { setlistId, ids } = await seed(3)
        await maintainSetlist(db(), setlistId, async (_tx, m) => {
            m.updateRow(ids[0], { performedAt: "x" })
            m.updateRow(ids[0], { order: 5 })
            m.deleteRow(ids[1])
            m.addRow("new-" + setlistId, { order: 0, title: "Audible", version: 1 })
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

    it("bump:false writes the field with no stamps", async () => {
        const { setlistId } = await seed(0)
        // no-bump: test of the option itself
        await maintainSetlist(db(), setlistId, async (_tx, m) => m.updateSetlist({ lastNotifiedAt: "t" }), { bump: false })
        const s = await get("setlists", setlistId)
        expect(s).toMatchObject({ version: 3, lastNotifiedAt: "t" })
        expect((s?.updatedAt as Timestamp).toMillis()).toBe(1_000)
    })

    it("a callback that queues nothing writes nothing", async () => {
        const { setlistId } = await seed(0)
        await maintainSetlist(db(), setlistId, async () => undefined)
        expect(await get("setlists", setlistId)).toMatchObject({ version: 3 })
    })

    it("maintainSetlists / maintainRows skip what is gone and bump what they write", async () => {
        const a = await seed(2)
        const res = await maintainSetlists(db(), [
            { setlistId: a.setlistId, patch: { isTest: true } },
            { setlistId: "gone-" + a.setlistId, patch: { isTest: true } },
        ])
        expect(res).toEqual({ written: [a.setlistId], skipped: ["gone-" + a.setlistId] })
        expect(await get("setlists", a.setlistId)).toMatchObject({ isTest: true, version: 4 })

        const rows = await maintainRows(db(), [
            { rowId: a.ids[0], setlistId: a.setlistId, patch: { mimeType: "application/pdf" } },
            { rowId: "gone-row", setlistId: a.setlistId, patch: { mimeType: "application/pdf" } },
        ])
        expect(rows).toEqual({ written: [a.ids[0]], skipped: ["gone-row"] })
        expect(await get("tracks", a.ids[0])).toMatchObject({ mimeType: "application/pdf", version: 2 })
        expect(await get("tracks", "gone-row")).toBeUndefined()
        expect(await get("setlists", a.setlistId)).toMatchObject({ version: 5 })
    })

    it("deleteSetlistsWithRows removes the rows and the setlist", async () => {
        const a = await seed(2)
        expect(await deleteSetlistsWithRows(db(), [a.setlistId])).toEqual({ setlists: 1, tracks: 2 })
        expect(await get("setlists", a.setlistId)).toBeUndefined()
        expect(await get("tracks", a.ids[0])).toBeUndefined()
    })
})
