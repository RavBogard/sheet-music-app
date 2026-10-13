import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, getApps, deleteApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { codeOrgConfig } from "@/lib/org/config-code"
import { applySetFeatures, planSetFeatures, undoSetFeatures } from "@/lib/org/set-tenant-features"

/**
 * Multi-tenant phase 6: set-tenant-features plan / apply / undo, against the
 * emulator, from the state production is in today (BL's phase 1 placeholder
 * flags, no driveInbox, no config/monitor.orgId).
 */
const PLACEHOLDER = { mixer: false, driveInbox: false, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true }

describe("set-tenant-features (emulator)", () => {
    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        if (!getApps().length) initializeApp({ projectId: "demo-mt-p6-set-features" })
    })
    afterAll(async () => {
        await Promise.all(getApps().map((a) => deleteApp(a)))
    })
    beforeEach(async () => {
        const db = getFirestore()
        await db.doc("orgs/crc").set({ id: "crc", features: codeOrgConfig("crc")!.features })
        await db.doc("orgs/brotherslazaroff").set({ id: "brotherslazaroff", features: PLACEHOLDER })
        await db.doc("config/monitor").set({ bridge: { lastSeen: 1 } })
    })

    it("plans only what differs, applies, is idempotent, and undoes exactly", async () => {
        const db = getFirestore()
        const m = await planSetFeatures(db, "demo")
        expect(m.changes.map((c) => `${c.doc}.${c.field}`).sort()).toEqual([
            "config/monitor.orgId",
            "orgs/brotherslazaroff.driveInbox",
            "orgs/brotherslazaroff.features",
            "orgs/crc.driveInbox",
        ])
        expect(await applySetFeatures(db, m)).toBe(4)
        expect((await db.doc("orgs/brotherslazaroff").get()).data()!.features).toEqual(codeOrgConfig("brotherslazaroff")!.features)
        expect((await db.doc("config/monitor").get()).data()).toEqual({ bridge: { lastSeen: 1 }, orgId: "crc" })
        expect((await planSetFeatures(db, "demo")).changes).toEqual([])

        // A field changed since apply is left alone by undo.
        await db.doc("orgs/crc").update({ driveInbox: { folderId: "someone-elses" } })
        const r = await undoSetFeatures(db, JSON.parse(JSON.stringify(m)), true)
        expect(r.restored).toBe(3)
        expect(r.skipped).toEqual(["orgs/crc.driveInbox (changed since)"])
        expect((await db.doc("orgs/brotherslazaroff").get()).data()).toEqual({ id: "brotherslazaroff", features: PLACEHOLDER })
        expect((await db.doc("config/monitor").get()).data()).toEqual({ bridge: { lastSeen: 1 } })
    })

    it("refuses, writing nothing, when a document is missing", async () => {
        const db = getFirestore()
        await db.doc("config/monitor").delete()
        await expect(planSetFeatures(db, "demo")).rejects.toThrow(/config\/monitor does not exist/)
    })
})
