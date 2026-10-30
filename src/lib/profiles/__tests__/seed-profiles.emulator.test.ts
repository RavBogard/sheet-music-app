import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { getServiceProfileTool, seedServiceProfiles } from "@/lib/mcp/tools/service-profiles"
import { cloneSetlistFromTemplate } from "@/lib/mcp/tools/templates"
import { standingDocId } from "../standing"

/**
 * Setlist memory, release 2 — seed_service_profiles and get_service_profile.
 *
 * Seeding is idempotent (a second real run changes nothing), never touches a
 * template without a profile, and is CRC only. get_service_profile reads
 * live tiers, prefers a standing choice, and needs a rabbi where the rabbi
 * changes the music.
 */
describe("service profiles (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const ADMIN = "u-admin"
    const BL_LEAD = "u-bl-lead"
    const KEY = "shabbat_morning:randy"

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-service-profiles" })
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
        await db().collection("library_index").doc("f-oseh-2").set({ orgId: CRC, name: "Oseh Shalom (Zeira)", partGroup: "pg-oseh-2" })
        const dates = ["2026-10-17", "2026-10-10", "2026-10-03"]
        for (const [i, date] of dates.entries()) {
            const id = `sl-${i}`
            await db().collection("setlists").doc(id).set({
                orgId: CRC,
                name: `Shabbat Morning ${date}`,
                serviceType: "shabbat_morning",
                rabbiSlot: "randy",
                special: false,
                eventDate: Timestamp.fromDate(new Date(`${date}T15:00:00Z`)),
                date: Timestamp.fromDate(new Date(`${date}T12:00:00Z`)),
            })
            const rows = [
                { type: "header", title: "Shacharit" },
                { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm" },
                { type: "song", title: "Oseh Shalom", fileId: i === 0 ? "f-oseh" : "f-oseh-2", key: "C" },
            ]
            for (const [order, row] of rows.entries()) {
                await db().collection("tracks").doc(`${id}-${order}`).set({ ...row, setlistId: id, orgId: CRC, order })
            }
        }
        await db().collection("setlistTemplates").doc("tpl-plain").set({
            orgId: CRC,
            name: "Hand-made Shabbat",
            templateType: "shabbat_morning",
            tracks: [{ type: "song", title: "Anything" }],
            version: 3,
        })
    })

    type SeedRun = {
        ok: true
        dryRun: boolean
        changed: number
        seeded: Array<{ key: string; templateId: string | null; outcome: string }>
        profiles: Array<{ key: string; unsure: Array<{ label: string }> }>
    }

    it("dry run reports and writes nothing; a real run needs force", async () => {
        const dry = (await seedServiceProfiles(ADMIN, { profiles: [KEY] }, CRC)) as SeedRun
        expect(dry.dryRun).toBe(true)
        expect(dry.seeded).toEqual([{ key: KEY, templateId: null, outcome: "created" }])
        expect(dry.profiles[0].unsure.map((u) => u.label)).toEqual(["Oseh Shalom"])
        expect((await db().collection("setlistTemplates").get()).size).toBe(1)

        const noForce = (await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false }, CRC)) as unknown as {
            ok: false
            error: { machine_code: string }
        }
        expect(noForce.error.machine_code).toBe("force_required")
    })

    it("seeds once, is idempotent, and leaves non-profile templates alone", async () => {
        const first = (await seedServiceProfiles(ADMIN, { dryRun: false, force: true }, CRC)) as SeedRun
        expect(first.changed).toBe(1)
        const created = first.seeded.find((s) => s.key === KEY)!
        expect(created.outcome).toBe("created")
        expect(first.seeded.filter((s) => s.key !== KEY).every((s) => s.outcome === "no_history")).toBe(true)

        const doc = (await db().collection("setlistTemplates").doc(created.templateId!).get()).data()!
        expect(doc.orgId).toBe(CRC)
        expect(doc.profile).toMatchObject({ key: KEY, serviceType: "shabbat_morning", rabbiSlot: "randy", book: "crc-saturday" })
        expect(doc.tracks.map((t: { slotKind?: string }) => t.slotKind ?? null)).toEqual([null, "moment", "open"])

        const second = (await seedServiceProfiles(ADMIN, { dryRun: false, force: true }, CRC)) as SeedRun
        expect(second.changed).toBe(0)
        expect(second.seeded.find((s) => s.key === KEY)).toEqual({ key: KEY, templateId: created.templateId, outcome: "unchanged" })
        expect((await db().collection("setlistTemplates").where("profile.key", "==", KEY).get()).size).toBe(1)

        const plain = (await db().collection("setlistTemplates").doc("tpl-plain").get()).data()!
        expect(plain).toMatchObject({ name: "Hand-made Shabbat", version: 3, tracks: [{ type: "song", title: "Anything" }] })
        expect(plain.profile).toBeUndefined()
    })

    it("never overwrites an existing profile unless asked; replace lists the rows it changes", async () => {
        const first = (await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)) as SeedRun
        const id = first.seeded[0].templateId!
        // New history: Oseh Shalom (Zeira) on a fourth week makes it usual.
        await db().collection("setlists").doc("sl-new").set({
            orgId: CRC, name: "Shabbat Morning 2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy", special: false,
            eventDate: Timestamp.fromDate(new Date("2026-10-24T15:00:00Z")), date: Timestamp.fromDate(new Date("2026-10-24T12:00:00Z")),
        })
        for (const [order, row] of [
            { type: "header", title: "Shacharit" },
            { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm" },
            { type: "song", title: "Oseh Shalom", fileId: "f-oseh-2", key: "C" },
        ].entries()) {
            await db().collection("tracks").doc(`sl-new-${order}`).set({ ...row, setlistId: "sl-new", orgId: CRC, order })
        }
        const before = (await db().collection("setlistTemplates").doc(id).get()).data()!

        const kept = (await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)) as SeedRun
        expect(kept.seeded[0].outcome).toBe("kept")
        expect(kept.changed).toBe(0)
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toEqual(before.tracks)

        type Replace = SeedRun & { seeded: Array<{ outcome: string; rowChanges?: Array<{ index: number; after: { fileId: string | null } }> }> }
        const dry = (await seedServiceProfiles(ADMIN, { profiles: [KEY], replace: true }, CRC)) as Replace
        expect(dry.seeded[0].outcome).toBe("updated")
        expect(dry.seeded[0].rowChanges?.map((c) => c.index)).toContain(2)
        expect(dry.seeded[0].rowChanges?.find((c) => c.index === 2)?.after.fileId).toBe("f-oseh-2")

        const real = (await seedServiceProfiles(ADMIN, { profiles: [KEY], replace: true, dryRun: false, force: true }, CRC)) as Replace
        expect(real.changed).toBe(1)
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks[2].fileId).toBe("f-oseh-2")
    })

    it("clone_setlist_from_template refuses a profile template", async () => {
        const first = (await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)) as SeedRun
        const r = (await cloneSetlistFromTemplate(ADMIN, { templateId: first.seeded[0].templateId!, newName: "X" }, CRC)) as unknown as {
            error: { machine_code: string }
        }
        expect(r.error.machine_code).toBe("use_draft_service")
        const plain = (await cloneSetlistFromTemplate(ADMIN, { templateId: "tpl-plain", newName: "Y" }, CRC)) as { ok: boolean }
        expect(plain.ok).toBe(true)
    })

    it("seeds nothing for Brothers Lazaroff", async () => {
        const r = (await seedServiceProfiles(BL_LEAD, { dryRun: false, force: true }, BL)) as { ok: true; seeded: unknown[] }
        expect(r.ok).toBe(true)
        expect(r.seeded).toEqual([])
        expect((await db().collection("setlistTemplates").where("orgId", "==", BL).get()).size).toBe(0)
    })

    it("get_service_profile reads live tiers and prefers a standing choice", async () => {
        await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)
        type Profile = { ok: true; rows: Array<{ title: string; tier?: { tier: string; fileId?: string; key?: string | null } }> }
        const before = (await getServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Profile
        expect(before.ok).toBe(true)
        expect(before.rows.map((r) => r.tier?.tier ?? null)).toEqual([null, "usual", "last_time"])

        await db().collection("standing_choices").doc(standingDocId(CRC, "shabbat_morning:randy", "moment:barchu")).set({
            orgId: CRC,
            scope: "shabbat_morning:randy",
            slotKey: "moment:barchu",
            fileId: "f-barchu",
            chartName: "Barchu (Walkdown)",
            key: "Em",
            partGroup: "pg-barchu",
            leadMusician: null,
            by: ADMIN,
            byName: "Admin",
            at: new Date().toISOString(),
            quote: null,
            previous: null,
        })
        // A BL choice for the same scope and slot never shapes CRC.
        await db().collection("standing_choices").doc(standingDocId(BL, "shabbat_morning:randy", "moment:barchu")).set({
            orgId: BL,
            scope: "shabbat_morning:randy",
            slotKey: "moment:barchu",
            fileId: "f-bl",
            chartName: "BL",
            key: "F",
            by: BL_LEAD,
            at: new Date().toISOString(),
        })
        const after = (await getServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Profile
        expect(after.rows[1].tier).toMatchObject({ tier: "standard", fileId: "f-barchu", key: "Em" })
    })

    it("get_service_profile refuses without a rabbi, and BL has no CRC profile", async () => {
        await seedServiceProfiles(ADMIN, { profiles: [KEY], dryRun: false, force: true }, CRC)
        const noRabbi = (await getServiceProfileTool(ADMIN, { serviceType: "shabbat_morning" }, CRC)) as unknown as {
            error: { machine_code: string }
        }
        expect(noRabbi.error.machine_code).toBe("rabbi_required")
        const bl = (await getServiceProfileTool(BL_LEAD, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, BL)) as unknown as {
            error: { machine_code: string }
        }
        expect(bl.error.machine_code).toBe("profile_not_found")
    })
})
