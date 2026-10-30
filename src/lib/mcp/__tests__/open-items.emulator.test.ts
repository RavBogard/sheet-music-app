import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { addOpenItemTool, readOpenItems, resolveOpenItemTool } from "@/lib/mcp/tools/open-items"
import { getSetlist } from "@/lib/mcp/tools/setlists"

/**
 * Setlist memory, release 3 — open items on a setlist. Editors add and
 * resolve them; get_setlist shows the unresolved ones; the doc keeps the
 * resolved ones. Tenant-scoped.
 */
describe("open items on a setlist (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const ADMIN = "u-admin"
    const BL_LEAD = "u-bl-lead"
    const MUSICIAN = "u-musician"
    const SETLIST = "sl-crc"

    type Err = { ok: false; error: { machine_code: string } }
    type Item = { id: string; text: string; trackId: string | null; createdAt: string; createdByName: string }
    type Added = { ok: true; setlistId: string; item: Item; openItems: Item[] }
    type Resolved = { ok: true; setlistId: string; resolved: Item; openItems: Item[] }

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-open-items" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "users", "memberships"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        for (const [uid, org, role] of [
            [ADMIN, CRC, "admin"],
            [BL_LEAD, BL, "band_leader"],
            [MUSICIAN, CRC, "musician"],
        ]) {
            await db().collection("users").doc(uid).set({ displayName: `Name ${uid}`, membershipsMigratedAt: new Date() })
            await db().collection("memberships").doc(`${org}__${uid}`).set({ uid, tenantId: org, role })
        }
        await db().collection("setlists").doc(SETLIST).set({ orgId: CRC, name: "Shabbat", version: 3 })
        await db().collection("tracks").doc("t-1").set({ setlistId: SETLIST, orgId: CRC, order: 0, type: "song", title: "Barchu" })
        await db().collection("setlists").doc("sl-other").set({ orgId: CRC, name: "Other" })
        await db().collection("tracks").doc("t-other").set({ setlistId: "sl-other", orgId: CRC, order: 0, type: "song", title: "X" })
    })

    async function stored() {
        return (await db().collection("setlists").doc(SETLIST).get()).data()!
    }

    it("adds an item and get_setlist shows it", async () => {
        const added = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "  chart still needed  ", trackId: "t-1" }, CRC)) as Added
        expect(added.ok).toBe(true)
        expect(added.item).toMatchObject({ text: "chart still needed", trackId: "t-1", createdByName: `Name ${ADMIN}` })
        expect(added.openItems.map((i) => i.id)).toEqual([added.item.id])
        expect((await stored()).version).toBe(4)

        const read = (await getSetlist(ADMIN, { id: SETLIST }, CRC)) as unknown as { openItems: Item[] }
        expect(read.openItems.map((i) => i.text)).toEqual(["chart still needed"])
    })

    it("resolve removes it from get_setlist and readOpenItems; the doc keeps it with resolvedAt", async () => {
        const a = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "first" }, CRC)) as Added
        await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "second" }, CRC)
        const r = (await resolveOpenItemTool(ADMIN, { setlistId: SETLIST, itemId: a.item.id }, CRC)) as Resolved
        expect(r.ok).toBe(true)
        expect(r.resolved.id).toBe(a.item.id)
        expect(r.openItems.map((i) => i.text)).toEqual(["second"])

        const doc = await stored()
        expect(readOpenItems(doc).map((i) => i.text)).toEqual(["second"])
        const kept = (doc.openItems as Array<Item & { resolvedAt: string | null; resolvedByName: string | null }>).find((i) => i.id === a.item.id)!
        expect(typeof kept.resolvedAt).toBe("string")
        expect(kept.resolvedByName).toBe(`Name ${ADMIN}`)
        const read = (await getSetlist(ADMIN, { id: SETLIST }, CRC)) as unknown as { openItems: Item[] }
        expect(read.openItems.map((i) => i.text)).toEqual(["second"])
    })

    it("resolving twice → open_item_not_found, no write", async () => {
        const a = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "once" }, CRC)) as Added
        await resolveOpenItemTool(ADMIN, { setlistId: SETLIST, itemId: a.item.id }, CRC)
        const before = await stored()
        const again = (await resolveOpenItemTool(ADMIN, { setlistId: SETLIST, itemId: a.item.id }, CRC)) as unknown as Err
        expect(again.error.machine_code).toBe("open_item_not_found")
        expect(await stored()).toEqual(before)
    })

    it("BrosLaz cannot resolve a CRC item (open_item_not_found)", async () => {
        const a = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "crc only" }, CRC)) as Added
        const before = await stored()
        const r = (await resolveOpenItemTool(BL_LEAD, { setlistId: SETLIST, itemId: a.item.id }, BL)) as unknown as Err
        expect(r.error.machine_code).toBe("open_item_not_found")
        expect(await stored()).toEqual(before)
        // Nor add one to a CRC setlist.
        const add = (await addOpenItemTool(BL_LEAD, { setlistId: SETLIST, text: "x" }, BL)) as unknown as Err
        expect(add.error.machine_code).toBe("setlist_not_found")
        expect(await stored()).toEqual(before)
    })

    it("musician role is refused", async () => {
        const r = (await addOpenItemTool(MUSICIAN, { setlistId: SETLIST, text: "x" }, CRC)) as unknown as Err
        expect(r.error.machine_code).toBe("forbidden_role")
        expect((await stored()).openItems).toBeUndefined()
    })

    it("empty text → invalid_argument", async () => {
        for (const text of ["", "   ", "x".repeat(301)]) {
            const r = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text }, CRC)) as unknown as Err
            expect(r.error.machine_code).toBe("invalid_argument")
        }
        expect((await stored()).openItems).toBeUndefined()
    })

    it("a trackId from another setlist → track_not_found", async () => {
        const r = (await addOpenItemTool(ADMIN, { setlistId: SETLIST, text: "x", trackId: "t-other" }, CRC)) as unknown as Err
        expect(r.error.machine_code).toBe("track_not_found")
        expect((await stored()).openItems).toBeUndefined()
    })
})
