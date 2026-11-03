import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { hydrateEmbeddedTracks } from "@/lib/setlist-ops"

/**
 * Server-side lazy hydration (setlist sync PR 3 fix round): a legacy setlist
 * whose rows are embedded gets them written as rows in ONE transaction, in
 * their embedded order and the setlist's tenant, and `hydrated: true`.
 * Running it again writes nothing.
 */
describe("hydrateEmbeddedTracks (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    let n = 0

    async function rowsOf(setlistId: string) {
        const snap = await db().collection("tracks").where("setlistId", "==", setlistId).get()
        return snap.docs.map((d) => d.data()).sort((a, b) => (a.order as number) - (b.order as number))
    }

    beforeAll(() => {
        app = getApps()[0] ?? initializeApp({ projectId: "demo-setlist-ops" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    for (const orgId of ["crc", "brotherslazaroff"]) {
        it(`${orgId}: embedded rows become rows (order, tenant, fields), the setlist is hydrated, and a second run is a no-op`, async () => {
            const setlistId = `legacy-${orgId}-${n++}`
            await db().collection("setlists").doc(setlistId).set({
                id: setlistId,
                orgId,
                name: "Legacy",
                version: 2,
                tracks: [
                    { id: `${setlistId}-a`, title: "Adon Olam", key: "Dm", fileId: "c1", type: "song" },
                    { id: `${setlistId}-b`, title: "Readings", type: "header" },
                    { title: "No id", pageNumber: 4 },
                ],
            })
            const first = await hydrateEmbeddedTracks(db(), setlistId)
            expect(first).toEqual({ hydrated: true, created: 3 })
            const rows = await rowsOf(setlistId)
            expect(rows.map((r) => [r.title, r.order, r.orgId, r.setlistId])).toEqual([
                ["Adon Olam", 0, orgId, setlistId],
                ["Readings", 1, orgId, setlistId],
                ["No id", 2, orgId, setlistId],
            ])
            expect(rows[0]).toMatchObject({ key: "Dm", fileId: "c1", version: 1 })
            expect(rows[2]).toMatchObject({ pageNumber: 4, type: "song" })
            const s = (await db().collection("setlists").doc(setlistId).get()).data()!
            expect(s).toMatchObject({ hydrated: true, trackCount: 3, songCount: 2, version: 3 })

            expect(await hydrateEmbeddedTracks(db(), setlistId)).toEqual({ hydrated: true, created: 0 })
            expect(await rowsOf(setlistId)).toHaveLength(3)
        })
    }

    it("an embedded row whose id already exists as a row is not written again", async () => {
        const setlistId = `legacy-partial-${n++}`
        await db().collection("setlists").doc(setlistId).set({
            id: setlistId, orgId: "crc", name: "Half", tracks: [{ id: `${setlistId}-x`, title: "X" }, { id: `${setlistId}-y`, title: "Y" }],
        })
        await db().collection("tracks").doc(`${setlistId}-x`).set({ id: `${setlistId}-x`, setlistId, orgId: "crc", order: 0, title: "X (edited)" })
        expect(await hydrateEmbeddedTracks(db(), setlistId)).toEqual({ hydrated: true, created: 1 })
        const rows = await rowsOf(setlistId)
        expect(rows.map((r) => r.title)).toEqual(["X (edited)", "Y"])
    })

    it("a missing setlist is left alone", async () => {
        expect(await hydrateEmbeddedTracks(db(), "no-such-setlist")).toEqual({ hydrated: false, created: 0 })
    })
})
