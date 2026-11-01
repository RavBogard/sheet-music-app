// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { backfillWeekKeys } from "@/lib/mcp/tools/week-key-backfill"
import { ceremonyCardCacheSize, clearCeremonyCardCache, readCeremonyCard } from "@/lib/family/ceremony-card"
import { collections, linkId, saveDetails } from "@/lib/beit-mitzvah/service"
import type { WeekInfo } from "@/lib/family/week-key"

/**
 * BET-6 — the week-key back-fill (F-05) and the Beit Mitzvah card read,
 * against the Firestore emulator. Hebcal is replaced by a fixed table so the
 * run is deterministic and offline.
 */

const ADMIN = "rabbi-daniel"
const WEEKS: Record<string, WeekInfo> = {
    "2026-10-10": { weekKey: "5787-bereshit", day: "2026-10-10", parasha: { slug: "bereshit", name: "Bereshit" } },
    "2026-10-17": { weekKey: "5787-noach", day: "2026-10-17", parasha: { slug: "noach", name: "Noach" } },
    "2026-09-26": { weekKey: "5787-sukkot-1", day: "2026-09-26", parasha: null },
}
const compute = async (day: unknown) => WEEKS[String(day)] ?? null
const CEREMONY = "8f14e45f-ceea-4e6b-9c5e-2f0f5b1d7a11"

describe("BET-6 back-fill and ceremony card (emulator)", () => {
    let app: App
    const db = () => getFirestore(app)

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-bet6-week-keys" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const coll of ["setlists", "users", collections.links]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        clearCeremonyCardCache()
        // Sat 10:00 Chicago = 15:00Z in October (CDT).
        await db().collection("setlists").doc("missing").set({ orgId: "crc", name: "Shabbat Morning", eventDate: "2026-10-10T15:00:00.000Z", version: 3 })
        await db().collection("setlists").doc("moved").set({ orgId: "crc", name: "Shabbat Morning", eventDate: "2026-10-17T15:00:00.000Z", weekKey: "5787-bereshit", weekKeyDay: "2026-10-10", parashaName: "Bereshit", version: 5 })
        await db().collection("setlists").doc("keyed").set({ orgId: "crc", name: "Sukkot", eventDate: "2026-09-26T15:00:00.000Z", weekKey: "5787-sukkot-1", weekKeyDay: "2026-09-26", parashaName: null })
        await db().collection("setlists").doc("unknown").set({ orgId: "crc", name: "Far future", eventDate: "2099-01-03T16:00:00.000Z" })
        await db().collection("setlists").doc("undated").set({ orgId: "crc", name: "No date" })
        await db().collection("setlists").doc("test").set({ orgId: "crc", name: "[TEST] x", eventDate: "2026-10-10T15:00:00.000Z", isTest: true })
        await db().collection("setlists").doc("bl").set({ orgId: "brotherslazaroff", name: "Gig", eventDate: "2026-10-10T15:00:00.000Z" })
    })

    it("dry run (the default) reports the full plan and writes nothing", async () => {
        const r = await backfillWeekKeys(ADMIN, {}, "crc", compute)
        expect("deltas" in r).toBe(true)
        if (!("deltas" in r)) return
        expect(r.dryRun).toBe(true)
        expect(r.alreadyKeyed).toBe(1)
        expect(r.deltas.map((d) => [d.setlistId, d.from, d.to])).toEqual([
            ["missing", null, "5787-bereshit"],
            ["moved", "5787-bereshit", "5787-noach"],
        ])
        expect(r.unresolved.map((u) => u.setlistId)).toEqual(["unknown"])
        expect((await db().collection("setlists").doc("missing").get()).data()?.weekKey).toBeUndefined()
    })

    it("a real run needs force; with it, writes only the week fields", async () => {
        const refused = await backfillWeekKeys(ADMIN, { dryRun: false }, "crc", compute)
        expect((refused as { ok?: boolean }).ok).toBe(false)
        expect((await db().collection("setlists").doc("missing").get()).data()?.weekKey).toBeUndefined()

        const r = await backfillWeekKeys(ADMIN, { dryRun: false, force: true }, "crc", compute)
        expect("rowsChanged" in r && r.rowsChanged).toBe(2)
        const missing = (await db().collection("setlists").doc("missing").get()).data()!
        expect([missing.weekKey, missing.weekKeyDay, missing.parashaName, missing.version]).toEqual(["5787-bereshit", "2026-10-10", "Bereshit", 3])
        const moved = (await db().collection("setlists").doc("moved").get()).data()!
        expect([moved.weekKey, moved.weekKeyDay, moved.parashaName, moved.version]).toEqual(["5787-noach", "2026-10-17", "Noach", 5])
        // Brothers Lazaroff and test rows are untouched.
        expect((await db().collection("setlists").doc("bl").get()).data()?.weekKey).toBeUndefined()
        expect((await db().collection("setlists").doc("test").get()).data()?.weekKey).toBeUndefined()

        const again = await backfillWeekKeys(ADMIN, {}, "crc", compute)
        expect("rowsChanged" in again && again.rowsChanged).toBe(0)
    })

    it("refuses a non-admin, and a Brothers Lazaroff run has nothing to do", async () => {
        await db().collection("users").doc("musician").set({ role: "musician" })
        expect((await backfillWeekKeys("musician", {}, "crc", compute) as { ok?: boolean }).ok).toBe(false)
        await db().collection("users").doc(ADMIN).set({ role: "admin", orgRoles: { brotherslazaroff: "admin" } }, { merge: true })
        const bl = await backfillWeekKeys(ADMIN, { dryRun: false, force: true }, "brotherslazaroff", compute)
        if ("rowsChanged" in bl) expect(bl.rowsChanged).toBe(0)
        expect((await db().collection("setlists").doc("bl").get()).data()?.weekKey).toBeUndefined()
    })

    describe("ceremony card", () => {
        beforeEach(async () => {
            await db().collection("setlists").doc("bm").set({ orgId: "crc", name: "B'nei Mitzvah Morning", ceremonyId: CEREMONY, occasion: "bnei-mitzvah" })
            await db().collection(collections.links).doc(linkId(CEREMONY)).set({ orgId: "crc", ceremonyId: CEREMONY, setlistId: "bm", localDate: "2026-11-07", ceremonyType: "morning" })
        })

        it("shows the slot from the link, then the portal's details once sent", async () => {
            const bare = await readCeremonyCard(db(), "bm", "crc")
            expect(bare).toMatchObject({ ceremonyType: "morning", localDate: "2026-11-07", students: [], torahRef: null })
            await saveDetails(db(), {
                version: 1, orgId: "crc", ceremonyId: CEREMONY, operation: "details", sentAt: "2026-10-31T12:00:00.000Z",
                students: ["Avery Example"], slot: "Saturday morning", torahRef: "Genesis 1:1–2:3", haftarahRef: "Isaiah 42:5–43:10", rehearsals: ["2026-11-05", "2026-11-03"],
            })
            clearCeremonyCardCache()
            const card = await readCeremonyCard(db(), "bm", "crc")
            expect(card).toMatchObject({ students: ["Avery Example"], slot: "Saturday morning", torahRef: "Genesis 1:1–2:3", rehearsals: ["2026-11-03", "2026-11-05"] })
        })

        it("hides for another tenant, a copied ceremonyId, or a missing link", async () => {
            expect(await readCeremonyCard(db(), "bm", "brotherslazaroff")).toBeNull()
            await db().collection("setlists").doc("copy").set({ orgId: "crc", name: "Copy", ceremonyId: CEREMONY })
            expect(await readCeremonyCard(db(), "copy", "crc")).toBeNull()
            await db().collection("setlists").doc("orphan").set({ orgId: "crc", name: "Orphan", ceremonyId: "11111111-1111-4111-8111-111111111111" })
            expect(await readCeremonyCard(db(), "orphan", "crc")).toBeNull()
        })

        it("an older or replayed details send is a no-op ack", async () => {
            const send = (sentAt: string, name: string) => saveDetails(db(), { version: 1, orgId: "crc", ceremonyId: CEREMONY, operation: "details", sentAt, students: [name] })
            expect(await send("2026-10-31T12:00:00.000Z", "Newer Name")).toEqual({ applied: true })
            expect(await send("2026-10-30T12:00:00.000Z", "Older Name")).toEqual({ applied: false })
            expect(await send("2026-10-31T12:00:00.000Z", "Replayed Name")).toEqual({ applied: false })
            clearCeremonyCardCache()
            expect((await readCeremonyCard(db(), "bm", "crc"))?.students).toEqual(["Newer Name"])
        })

        it("a setlist two ceremonies link to shows both families on one card", async () => {
            const second = "33333333-3333-4333-8333-333333333333"
            await db().collection("setlists").doc("bm").set({ ceremonyIds: [CEREMONY, second] }, { merge: true })
            await db().collection(collections.links).doc(linkId(second)).set({ orgId: "crc", ceremonyId: second, setlistId: "bm", localDate: "2026-11-07", ceremonyType: "morning" })
            const at = "2026-10-31T12:00:00.000Z"
            await saveDetails(db(), { version: 1, orgId: "crc", ceremonyId: CEREMONY, operation: "details", sentAt: at, students: ["Avery Example"], torahRef: "Genesis 1:1-2:3" })
            await saveDetails(db(), { version: 1, orgId: "crc", ceremonyId: second, operation: "details", sentAt: at, students: ["Blake Example"], torahRef: "Genesis 1:1-2:3" })
            clearCeremonyCardCache()
            expect(await readCeremonyCard(db(), "bm", "crc")).toMatchObject({ students: ["Avery Example", "Blake Example"], torahRef: "Genesis 1:1-2:3" })
        })

        it("the cache stays bounded", async () => {
            for (let i = 0; i < 230; i++) await readCeremonyCard(db(), `missing-${i}`, "crc")
            expect(ceremonyCardCacheSize()).toBeLessThanOrEqual(200)
        })

        it("details for an unknown ceremony are refused", async () => {
            await expect(saveDetails(db(), {
                version: 1, orgId: "crc", ceremonyId: "22222222-2222-4222-8222-222222222222", operation: "details", sentAt: "2026-10-31T12:00:00.000Z", students: ["X"],
            })).rejects.toThrow("not_found")
        })
    })
})
