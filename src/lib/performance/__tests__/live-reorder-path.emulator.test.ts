import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { __resetPlatformOwnerMemo } from "@/lib/org/access"
import { membershipId } from "@/lib/org/membership-types"
import { reorderSetlist } from "@/lib/mcp/tools/setlist-write"

/**
 * Live reorder from the Perform page (Daniel, 2026-10-31) writes through
 * `reorderSetlist`, the path MCP `reorder_setlist` uses
 * (`/api/setlist/reorder`). Against the emulator:
 *  - a musician (no leader role) can't reorder; nothing is written
 *  - a band leader can, in their own tenant: rows renumber and versions bump
 *  - a leader of the other tenant gets "not found", in both directions
 *  - a stale id list (a row added meanwhile) is refused
 */
describe("live reorder write path (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const MUSICIAN = "crc-musician"
    const CRC_LEADER = "crc-leader"
    const BL_LEADER = "bl-leader"

    const db = () => getFirestore(app)
    const code = (r: unknown) => (r as { error?: { machine_code?: string } }).error?.machine_code

    async function seedSetlist(id: string, orgId: string) {
        await db().collection("setlists").doc(id).set({ name: id, orgId, version: 1 })
        for (const [i, t] of ["a", "b", "c"].entries()) {
            await db().collection("tracks").doc(`${id}-${t}`).set({ setlistId: id, orgId, order: i, title: t, version: 1 })
        }
    }
    async function orderOf(id: string) {
        const snap = await db().collection("tracks").where("setlistId", "==", id).get()
        return snap.docs
            .map((d) => ({ id: d.id, order: d.data().order as number }))
            .sort((x, y) => x.order - y.order)
            .map((x) => x.id)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-live-reorder" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const col of ["users", "memberships", "setlists", "tracks", "platform"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        __resetPlatformOwnerMemo()
        const migrated = { membershipsMigratedAt: "2026-10-01" }
        await db().collection("users").doc(MUSICIAN).set({ role: "musician", ...migrated })
        await db().collection("users").doc(CRC_LEADER).set({ role: "band_leader", ...migrated })
        await db().collection("users").doc(BL_LEADER).set({ role: "band_leader", ...migrated })
        await db().collection("memberships").doc(membershipId(CRC, MUSICIAN)).set({ tenantId: CRC, uid: MUSICIAN, role: "musician" })
        await db().collection("memberships").doc(membershipId(CRC, CRC_LEADER)).set({ tenantId: CRC, uid: CRC_LEADER, role: "band_leader" })
        await db().collection("memberships").doc(membershipId(BL, BL_LEADER)).set({ tenantId: BL, uid: BL_LEADER, role: "band_leader" })
        await seedSetlist("crc-set", CRC)
        await seedSetlist("bl-set", BL)
    })

    it("refuses a musician and writes nothing", async () => {
        const r = await reorderSetlist(MUSICIAN, { setlistId: "crc-set", orderedTrackIds: ["crc-set-c", "crc-set-a", "crc-set-b"] }, CRC)
        expect(code(r)).toBe("forbidden_role")
        expect(await orderOf("crc-set")).toEqual(["crc-set-a", "crc-set-b", "crc-set-c"])
        expect((await db().collection("setlists").doc("crc-set").get()).data()?.version).toBe(1)
    })

    it("lets a leader reorder their own tenant's setlist, bumping versions", async () => {
        const r = await reorderSetlist(CRC_LEADER, { setlistId: "crc-set", orderedTrackIds: ["crc-set-c", "crc-set-a", "crc-set-b"] }, CRC)
        expect(r).toEqual({ ok: true })
        expect(await orderOf("crc-set")).toEqual(["crc-set-c", "crc-set-a", "crc-set-b"])
        expect((await db().collection("setlists").doc("crc-set").get()).data()?.version).toBe(2)
    })

    it("lets a Brothers Lazaroff leader reorder their own setlist too", async () => {
        const r = await reorderSetlist(BL_LEADER, { setlistId: "bl-set", orderedTrackIds: ["bl-set-b", "bl-set-a", "bl-set-c"] }, BL)
        expect(r).toEqual({ ok: true })
        expect(await orderOf("bl-set")).toEqual(["bl-set-b", "bl-set-a", "bl-set-c"])
    })

    it("answers not found across tenants, both ways, and writes nothing", async () => {
        const fromBl = await reorderSetlist(BL_LEADER, { setlistId: "crc-set", orderedTrackIds: ["crc-set-c", "crc-set-a", "crc-set-b"] }, BL)
        expect(code(fromBl)).toBe("setlist_not_found")
        const fromCrc = await reorderSetlist(CRC_LEADER, { setlistId: "bl-set", orderedTrackIds: ["bl-set-c", "bl-set-a", "bl-set-b"] }, CRC)
        expect(code(fromCrc)).toBe("setlist_not_found")
        // A leader of one tenant is not a leader of the other.
        const blInCrc = await reorderSetlist(BL_LEADER, { setlistId: "crc-set", orderedTrackIds: ["crc-set-c", "crc-set-a", "crc-set-b"] }, CRC)
        expect(code(blInCrc)).toBe("forbidden_role")
        expect(await orderOf("crc-set")).toEqual(["crc-set-a", "crc-set-b", "crc-set-c"])
        expect(await orderOf("bl-set")).toEqual(["bl-set-a", "bl-set-b", "bl-set-c"])
    })

    it("refuses a list that no longer matches the setlist", async () => {
        const r = await reorderSetlist(CRC_LEADER, { setlistId: "crc-set", orderedTrackIds: ["crc-set-b", "crc-set-a"] }, CRC)
        expect(code(r)).toBe("reorder_failed")
        expect(await orderOf("crc-set")).toEqual(["crc-set-a", "crc-set-b", "crc-set-c"])
    })
})
