import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { clearStandingChoiceTool, setStandingChoiceTool } from "@/lib/mcp/tools/standing"
import { readStanding, standingDocId, standingMapKey } from "../standing"

/**
 * Setlist memory, release 2 — standing choices store and tools.
 *
 * Both tenants, with no cross-reads; the `previous` chain and undo;
 * `overrode` only for another person within 28 days; a member without
 * admin or band_leader is refused.
 */
describe("standing choices (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const DANIEL = "u-daniel"
    const DAVID = "u-david"
    const BL_LEAD = "u-bl-lead"
    const MEMBER = "u-member"

    function db() {
        return getFirestore(app)
    }

    async function person(uid: string, name: string, roles: Array<[string, string]>) {
        await db().collection("users").doc(uid).set({ displayName: name, membershipsMigratedAt: new Date() })
        for (const [org, role] of roles) {
            await db().collection("memberships").doc(`${org}__${uid}`).set({ uid, tenantId: org, role, addedBy: "migration" })
        }
    }

    async function track(id: string, setlistId: string, org: string, data: Record<string, unknown>) {
        await db().collection("tracks").doc(id).set({ setlistId, orgId: org, type: "song", order: 0, ...data })
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-standing-choices" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "library_index", "standing_choices", "users", "memberships"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await person(DANIEL, "Daniel", [[CRC, "admin"]])
        await person(DAVID, "David", [[CRC, "band_leader"]])
        await person(BL_LEAD, "BL Lead", [[BL, "band_leader"]])
        await person(MEMBER, "Member", [[CRC, "member"]])

        await db().collection("setlists").doc("sl-crc").set({
            orgId: CRC,
            name: "Friday night",
            serviceType: "friday_night",
            rabbiSlot: "randy",
            special: false,
        })
        await db().collection("setlists").doc("sl-crc-norabbi").set({
            orgId: CRC,
            name: "Friday night",
            serviceType: "friday_night",
        })
        await db().collection("setlists").doc("sl-bl").set({ orgId: BL, name: "Gig at the Pageant" })

        for (const [id, org, name] of [
            ["f-barchu-a", CRC, "Barchu (Walkdown)"],
            ["f-barchu-b", CRC, "Barchu (Sulzer)"],
            ["f-oseh", CRC, "Oseh Shalom (Hirsch)"],
            ["f-bl", BL, "Mi Chamocha (BL chart)"],
        ]) {
            await db().collection("library_index").doc(id).set({ orgId: org, name, partGroup: `pg-${id}` })
        }
        await track("t-barchu-a", "sl-crc", CRC, { title: "Barchu", momentId: "barchu", fileId: "f-barchu-a", key: "Dm" })
        await track("t-barchu-b", "sl-crc", CRC, { title: "Barchu", momentId: "barchu", fileId: "f-barchu-b", key: "Em" })
        await track("t-oseh", "sl-crc", CRC, { title: "Oseh Shalom", fileId: "f-oseh", key: "G" })
        await track("t-open", "sl-crc", CRC, { title: "Hashkiveinu", momentId: "hashkiveinu" })
        await track("t-norabbi", "sl-crc-norabbi", CRC, { title: "Barchu", momentId: "barchu", fileId: "f-barchu-a" })
        await track("t-bl", "sl-bl", BL, { title: "Mi Chamocha", fileId: "f-bl", key: "Am" })
    })

    type SetOk = { ok: true; announcement: string; scope: string; slotKey: string; overrode?: { byName: string } }
    type Err = { ok: false; error: { machine_code: string } }

    it("remembers a moment slot under the profile and announces it", async () => {
        const r = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a", quote: "keep it in Dm" }, CRC)) as SetOk
        expect(r.ok).toBe(true)
        expect(r.scope).toBe("friday_night:randy")
        expect(r.slotKey).toBe("moment:barchu")
        expect(r.announcement).toBe("Barchu (Walkdown) in Dm is now standard for Randy Friday night.")
        expect(r.overrode).toBeUndefined()
        const doc = (await db().collection("standing_choices").doc(standingDocId(CRC, "friday_night:randy", "moment:barchu")).get()).data()
        expect(doc).toMatchObject({ orgId: CRC, fileId: "f-barchu-a", key: "Dm", by: DANIEL, quote: "keep it in Dm", previous: null })
    })

    it("a song slot is also remembered at the bare service type", async () => {
        const r = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-oseh" }, CRC)) as SetOk
        expect(r.slotKey).toBe("song:pg-f-oseh")
        const m = await readStanding(CRC, ["friday_night:randy", "friday_night"], ["song:pg-f-oseh"])
        expect([...m.keys()].sort()).toEqual(["friday_night:randy|song:pg-f-oseh", "friday_night|song:pg-f-oseh"])
    })

    it("keeps tenants apart in both directions", async () => {
        const crc = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as SetOk
        const bl = (await setStandingChoiceTool(BL_LEAD, { setlistId: "sl-bl", trackId: "t-bl" }, BL)) as SetOk
        expect(crc.ok).toBe(true)
        expect(bl.ok).toBe(true)
        expect(bl.scope).toBe("gig")
        expect(bl.announcement).toBe("Mi Chamocha (BL chart) in Am is now standard for gig.")

        expect((await readStanding(BL, ["friday_night:randy"], ["moment:barchu"])).size).toBe(0)
        expect((await readStanding(CRC, ["gig"], [bl.slotKey])).size).toBe(0)
        expect((await readStanding(CRC, ["friday_night:randy"], ["moment:barchu"])).size).toBe(1)
        expect((await readStanding(BL, ["gig"], [bl.slotKey])).size).toBe(1)

        // A leader of one tenant cannot reach the other tenant's setlist.
        const cross = (await setStandingChoiceTool(BL_LEAD, { setlistId: "sl-crc", trackId: "t-barchu-a" }, BL)) as unknown as Err
        expect(cross.ok).toBe(false)
        expect(cross.error.machine_code).toBe("setlist_not_found")
        const crossClear = (await clearStandingChoiceTool(DANIEL, { setlistId: "sl-bl", trackId: "t-bl" }, CRC)) as unknown as Err
        expect(crossClear.error.machine_code).toBe("setlist_not_found")
        expect((await readStanding(BL, ["gig"], [bl.slotKey])).size).toBe(1)
    })

    it("keeps the replaced choice as previous and undo restores it, then clears", async () => {
        await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)
        const second = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-b" }, CRC)) as SetOk
        expect(second.overrode).toBeUndefined()
        const key = standingMapKey("friday_night:randy", "moment:barchu")
        const now = (await readStanding(CRC, ["friday_night:randy"], ["moment:barchu"])).get(key)
        expect(now?.fileId).toBe("f-barchu-b")
        expect(now?.previous?.fileId).toBe("f-barchu-a")

        const undo = (await clearStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-b" }, CRC)) as { ok: true; announcement: string }
        expect(undo.announcement).toBe("Undone: back to Barchu (Walkdown) in Dm.")
        const restored = (await readStanding(CRC, ["friday_night:randy"], ["moment:barchu"])).get(key)
        expect(restored?.fileId).toBe("f-barchu-a")
        expect(restored?.previous).toBeNull()

        const undo2 = (await clearStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as { ok: true; announcement: string }
        expect(undo2.announcement).toBe("Undone: back to no standard.")
        expect((await readStanding(CRC, ["friday_night:randy"], ["moment:barchu"])).size).toBe(0)

        const nothing = (await clearStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as unknown as Err
        expect(nothing.error.machine_code).toBe("standing_not_found")
    })

    it("reports overrode only for another person within 28 days", async () => {
        await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)
        const r = (await setStandingChoiceTool(DAVID, { setlistId: "sl-crc", trackId: "t-barchu-b" }, CRC)) as SetOk & {
            overrode: { byName: string; fileId: string; key: string | null; at: string }
        }
        expect(r.overrode).toMatchObject({ byName: "Daniel", fileId: "f-barchu-a", key: "Dm" })
        expect(r.announcement).toMatch(/^Barchu \(Sulzer\) in Em is now standard for Randy Friday night\. \(Daniel set Barchu \(Walkdown\) in Dm on [A-Z][a-z]{2} \d{1,2}\.\)$/)

        // Older than 28 days: no overrode.
        const ref = db().collection("standing_choices").doc(standingDocId(CRC, "friday_night:randy", "moment:barchu"))
        await ref.update({ by: DANIEL, byName: "Daniel", at: new Date(Date.now() - 40 * 86400000).toISOString() })
        const old = (await setStandingChoiceTool(DAVID, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as SetOk
        expect(old.overrode).toBeUndefined()
    })

    it("refuses a member without admin or band_leader", async () => {
        const r = (await setStandingChoiceTool(MEMBER, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as unknown as Err
        expect(r.ok).toBe(false)
        expect(r.error.machine_code).toBe("forbidden_role")
        const c = (await clearStandingChoiceTool(MEMBER, { setlistId: "sl-crc", trackId: "t-barchu-a" }, CRC)) as unknown as Err
        expect(c.error.machine_code).toBe("forbidden_role")
        expect((await db().collection("standing_choices").get()).size).toBe(0)
    })

    it("refuses a row with no chart and a setlist with no rabbi", async () => {
        const open = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc", trackId: "t-open" }, CRC)) as unknown as Err
        expect(open.error.machine_code).toBe("no_chart")
        const noRabbi = (await setStandingChoiceTool(DANIEL, { setlistId: "sl-crc-norabbi", trackId: "t-norabbi" }, CRC)) as unknown as Err
        expect(noRabbi.error.machine_code).toBe("rabbi_required")
    })
})
