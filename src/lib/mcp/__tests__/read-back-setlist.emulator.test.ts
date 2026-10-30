import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { addOpenItemTool } from "@/lib/mcp/tools/open-items"
import { readBackSetlistTool } from "@/lib/mcp/tools/read-back-setlist"
import { seedServiceProfiles } from "@/lib/mcp/tools/service-profiles"

/**
 * Setlist memory, release 3 — read_back_setlist: an existing setlist said
 * aloud, exceptions first, tiered against its profile when it has one.
 */
describe("read_back_setlist (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const ADMIN = "u-admin"
    const BL_LEAD = "u-bl-lead"
    const KEY = "shabbat_morning:randy"

    type Item = { kind: string; index: number | null; text: string }
    type Out = { ok: true; setlistId: string; readback: { headline: string; exceptions: Item[]; rest: string; text: string } }
    type Err = { ok: false; error: { machine_code: string } }

    function db() {
        return getFirestore(app)
    }

    async function setlist(
        id: string,
        org: string,
        fields: Record<string, unknown>,
        rows: Array<Record<string, unknown>>,
        date = "2026-10-24",
        eventAt = `${date}T15:00:00Z`,
    ) {
        await db().collection("setlists").doc(id).set({
            orgId: org,
            name: `Setlist ${id}`,
            eventDate: Timestamp.fromDate(new Date(eventAt)),
            date: Timestamp.fromDate(new Date(`${date}T12:00:00Z`)),
            ...fields,
        })
        for (const [order, row] of rows.entries()) {
            await db().collection("tracks").doc(`${id}-${order}`).set({ ...row, setlistId: id, orgId: org, order })
        }
    }

    const barchu = { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm" }
    const oseh = { type: "song", title: "Oseh Shalom", fileId: "f-oseh", key: "C" }
    const randy = { serviceType: "shabbat_morning", rabbiSlot: "randy", special: false, book: "crc-saturday" }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-read-back" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "library_index", "standing_choices", "setlistTemplates", "users", "memberships"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        for (const [uid, org, role] of [
            [ADMIN, CRC, "admin"],
            [BL_LEAD, BL, "band_leader"],
        ]) {
            await db().collection("users").doc(uid).set({ displayName: uid, membershipsMigratedAt: new Date() })
            await db().collection("memberships").doc(`${org}__${uid}`).set({ uid, tenantId: org, role })
        }
        await db().collection("library_index").doc("f-barchu").set({ orgId: CRC, name: "Barchu (Walkdown)", partGroup: "pg-barchu" })
        await db().collection("library_index").doc("f-oseh").set({ orgId: CRC, name: "Oseh Shalom (Hirsch)", partGroup: "pg-oseh" })
        await db().collection("library_index").doc("f-bl").set({ orgId: BL, name: "BL Tune", partGroup: "pg-bl" })
        // Three regular Randy Shabbat mornings: Barchu in Dm and Oseh Shalom in C are usual.
        for (const [i, date] of ["2026-10-17", "2026-10-10", "2026-10-03"].entries()) {
            await setlist(`hist-${i}`, CRC, randy, [{ type: "header", title: "Shacharit" }, barchu, oseh], date)
        }
        await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)
    })

    it("a setlist matching its profile reads 'Nothing new'", async () => {
        await setlist("sl-now", CRC, randy, [{ type: "header", title: "Shacharit" }, barchu, oseh])
        const r = (await readBackSetlistTool(ADMIN, { setlistId: "sl-now" }, CRC)) as Out
        expect(r.ok).toBe(true)
        expect(r.readback.exceptions).toEqual([])
        expect(r.readback.headline).toMatch(/^Randy Shabbat morning, Oct 24/)
        expect(r.readback.rest).toBe("All 2 songs are your usual Randy Shabbat morning.")
    })

    it("dates the headline in the tenant's zone: 00:30Z Nov 7 is a Nov 6 evening in Chicago", async () => {
        await setlist("sl-eve", CRC, {}, [oseh], "2026-11-06", "2026-11-07T00:30:00Z")
        const r = (await readBackSetlistTool(ADMIN, { setlistId: "sl-eve" }, CRC)) as Out
        expect(r.readback.headline).toContain("Nov 6")
        expect(r.readback.headline).not.toContain("Nov 7")
    })

    it("a row in Cm where the usual is Dm is listed", async () => {
        await setlist("sl-now", CRC, randy, [{ type: "header", title: "Shacharit" }, { ...barchu, key: "Cm" }, oseh])
        const r = (await readBackSetlistTool(ADMIN, { setlistId: "sl-now" }, CRC)) as Out
        expect(r.readback.exceptions.map((e) => [e.kind, e.index])).toEqual([["differs", 1]])
        expect(r.readback.exceptions[0].text).toContain("Cm this week")
        expect(r.readback.exceptions[0].text).toContain("in Dm")
        expect(r.readback.rest).toMatch(/1 song\b/)
    })

    it("open items are listed last", async () => {
        await setlist("sl-now", CRC, randy, [{ type: "header", title: "Shacharit" }, { ...barchu, key: "Cm" }, oseh])
        await addOpenItemTool(ADMIN, { setlistId: "sl-now", text: "new arrangement; swap when it lands" }, CRC)
        const r = (await readBackSetlistTool(ADMIN, { setlistId: "sl-now" }, CRC)) as Out
        expect(r.readback.exceptions.map((e) => e.kind)).toEqual(["differs", "open_item"])
        expect(r.readback.exceptions[1].text).toContain("swap when it lands")
    })

    it("an untagged setlist gets a no-tier readback listing rows without charts", async () => {
        await setlist("sl-old", CRC, {}, [
            { type: "header", title: "Shacharit" },
            { ...barchu, key: "Cm" },
            { type: "song", title: "Mi Chamocha" },
        ])
        const r = (await readBackSetlistTool(ADMIN, { setlistId: "sl-old" }, CRC)) as Out
        expect(r.ok).toBe(true)
        expect(r.readback.exceptions).toEqual([{ kind: "no_chart", index: 2, text: "Mi Chamocha: no chart yet" }])
        expect(r.readback.rest).toMatch(/^1 other song/)
        expect(r.readback.text).not.toMatch(/usual|standard|last time/)
    })

    it("BrosLaz setlist works and never reads CRC data", async () => {
        await setlist("sl-bl", BL, { serviceType: "gig" }, [
            { type: "song", title: "Opener", fileId: "f-bl", key: "E" },
            { type: "song", title: "Barchu", momentId: "barchu" },
        ])
        const r = (await readBackSetlistTool(BL_LEAD, { setlistId: "sl-bl" }, BL)) as Out
        expect(r.ok).toBe(true)
        expect(r.readback.exceptions).toEqual([{ kind: "no_chart", index: 1, text: "Barchu: no chart yet" }])
        expect(r.readback.text).not.toMatch(/Walkdown|Hirsch|Randy|Siddur/)

        // A CRC setlist is not there for BrosLaz.
        await setlist("sl-now", CRC, randy, [barchu])
        const cross = (await readBackSetlistTool(BL_LEAD, { setlistId: "sl-now" }, BL)) as unknown as Err
        expect(cross.error.machine_code).toBe("setlist_not_found")
    })
})
