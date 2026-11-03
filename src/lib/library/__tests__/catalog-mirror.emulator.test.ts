import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { ANY_TENANT, saveSongDefaults, writeCatalog } from "@/lib/library/catalog-mirror"

/**
 * The one writer of the songs/library_index mirror and of the browser's sticky
 * song defaults. Both collections move together; every songs write bumps
 * `version`; a row of another tenant (or one only shared with the caller) is
 * refused and nothing is written, for both tenants.
 */
describe("catalog mirror (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)
    let n = 0
    const fid = () => `cm-${Date.now()}-${n++}`
    const get = async (col: string, id: string) => (await db().collection(col).doc(id).get()).data()

    async function seed(orgId: string, extra: Record<string, unknown> = {}, song = true) {
        const id = fid()
        await db().collection("library_index").doc(id).set({ name: "Adon Olam", status: "active", key: "C", orgId, ...extra })
        if (song) {
            await db().collection("songs").doc(id).set({
                title: "Adon Olam",
                orgId,
                version: 2,
                defaults: { key: "C", durationSec: 200 },
                recent: [],
                ...extra,
            })
        }
        return id
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-catalog-mirror" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    describe("writeCatalog", () => {
        it("writes the mirrored field to both collections and bumps the song's version", async () => {
            const id = await seed("crc")
            const res = await writeCatalog(db(), [{ fileId: id, patch: { title: "Adon Olam (Klepper)", key: "D" } }], { org: "crc" })
            expect(res.written).toEqual([id])
            expect(await get("library_index", id)).toMatchObject({ name: "Adon Olam (Klepper)", key: "D" })
            const song = await get("songs", id)
            expect(song).toMatchObject({ title: "Adon Olam (Klepper)", normalizedTitle: "adon olam (klepper)", version: 3, orgId: "crc" })
            // Nested merge: the rest of `defaults` stays.
            expect(song?.defaults).toEqual({ key: "D", durationSec: 200 })
        })

        it.each([
            ["crc", "brotherslazaroff"],
            ["brotherslazaroff", "crc"],
        ])("a %s caller cannot write a %s row: refused, nothing written", async (caller, owner) => {
            const id = await seed(owner)
            const res = await writeCatalog(db(), [{ fileId: id, patch: { status: "archived" } }], { org: caller })
            expect(res).toMatchObject({ written: [], refused: [id] })
            expect((await get("library_index", id))?.status).toBe("active")
            expect((await get("songs", id))?.version).toBe(2)
        })

        it("a row only shared with the caller is refused (shared charts are used, never changed)", async () => {
            const id = await seed("brotherslazaroff", { visibleToOrgs: ["brotherslazaroff", "crc"] })
            const res = await writeCatalog(db(), [{ fileId: id, patch: { status: "archived" } }], { org: "crc" })
            expect(res.refused).toEqual([id])
        })

        it("missingSong: stub creates the songs doc stamped with the row's tenant; skip leaves it absent", async () => {
            const a = await seed("brotherslazaroff", {}, false)
            const b = await seed("brotherslazaroff", {}, false)
            await writeCatalog(db(), [{ fileId: a, patch: { status: "orphaned" } }], { org: ANY_TENANT, missingSong: "stub" })
            await writeCatalog(db(), [{ fileId: b, patch: { status: "orphaned" } }], { org: "brotherslazaroff" })
            expect(await get("songs", a)).toMatchObject({ status: "orphaned", orgId: "brotherslazaroff", version: 1 })
            expect(await get("songs", b)).toBeUndefined()
            expect((await get("library_index", b))?.status).toBe("orphaned")
        })
    })

    describe("saveSongDefaults (POST /api/songs/defaults)", () => {
        it("writes only the changed field, keeps the rest (an MCP default is not reverted), caps recent at 5", async () => {
            const id = await seed("crc")
            for (let i = 0; i < 6; i++) {
                const r = await saveSongDefaults(db(), "crc", { songId: id, setlistId: `sl-${i}`, patch: { lead: `L${i}` }, now: 1000 + i })
                expect(r.ok).toBe(true)
            }
            const song = await get("songs", id)
            expect(song?.defaults).toEqual({ key: "C", durationSec: 200, lead: "L5" })
            expect(song?.recent).toHaveLength(5)
            expect(song?.recent[0]).toMatchObject({ lead: "L5", setlistId: "sl-5", performedAt: 1005 })
            expect(song?.version).toBe(8)
            // Sticky memory is not the catalogue: library_index is untouched.
            expect((await get("library_index", id))?.key).toBe("C")
        })

        it.each([
            ["crc", "brotherslazaroff"],
            ["brotherslazaroff", "crc"],
        ])("a %s caller cannot save defaults on a %s song", async (caller, owner) => {
            const id = await seed(owner)
            const r = await saveSongDefaults(db(), caller, { songId: id, setlistId: "sl", patch: { key: "G" } })
            expect(r).toEqual({ ok: false, reason: "not-owner" })
            expect((await get("songs", id))?.defaults).toEqual({ key: "C", durationSec: 200 })
        })

        it("an unknown song is not-found and an empty patch is invalid", async () => {
            expect(await saveSongDefaults(db(), "crc", { songId: "nope-" + fid(), setlistId: "sl", patch: { key: "G" } })).toEqual({ ok: false, reason: "not-found" })
            const id = await seed("crc")
            expect(await saveSongDefaults(db(), "crc", { songId: id, setlistId: "sl", patch: {} })).toEqual({ ok: false, reason: "invalid" })
        })
    })
})
