import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { createSetlistFromDraftTool, draftServiceTool } from "@/lib/mcp/tools/draft-service"
import { seedServiceProfiles } from "@/lib/mcp/tools/service-profiles"
import { writeSetlistFromTemplateRows } from "@/lib/mcp/tools/templates"

/**
 * Setlist memory, release 2 — draft_service → create_setlist_from_draft,
 * both tenants. Only usual/standard slots are filled; a standing choice is
 * remembered, a one-off is not; no rabbi is ever inferred; a draft never
 * crosses tenants.
 */
describe("draft a service from its profile (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const ADMIN = "u-admin"
    const BL_LEAD = "u-bl-lead"
    const KEY = "shabbat_morning:randy"

    function db() {
        return getFirestore(app)
    }

    type Err = { ok: false; error: { machine_code: string } }
    type Draft = {
        ok: true
        draftId: string
        special: boolean
        profile: { key: string; book: string | null }
        rows: Array<{ index: number; label: string; tier: string | null; fileId?: string; key?: string | null }>
        openIndexes: number[]
        readback: { exceptions: Array<{ kind: string }>; rest: string }
    }
    type Created = { ok: true; setlistId: string; announcements: string[]; oneOffNote?: string; book: string | null }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-draft-service" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "library_index", "standing_choices", "setlistTemplates", "service_drafts", "users", "memberships"]) {
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
        await db().collection("library_index").doc("f-bl").set({ orgId: BL, name: "BL Tune", partGroup: "pg-bl" })
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
                { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm", liturgyRef: { book: "crc-saturday", folio: 60 } },
                { type: "song", title: "Oseh Shalom", fileId: i === 0 ? "f-oseh" : "f-oseh-2", key: "C" },
            ]
            for (const [order, row] of rows.entries()) {
                await db().collection("tracks").doc(`${id}-${order}`).set({ ...row, setlistId: id, orgId: CRC, order })
            }
        }
        // One Daniel Shabbat morning, so Daniel's profile exists too.
        await db().collection("setlists").doc("sl-daniel").set({
            orgId: CRC,
            name: "Shabbat Morning with Daniel",
            serviceType: "shabbat_morning",
            rabbiSlot: "daniel_karen",
            special: false,
            eventDate: Timestamp.fromDate(new Date("2026-10-18T15:00:00Z")),
            date: Timestamp.fromDate(new Date("2026-10-18T12:00:00Z")),
        })
        await db().collection("tracks").doc("sl-daniel-0").set({
            type: "song", title: "Oseh Shalom", fileId: "f-oseh-2", key: "C", setlistId: "sl-daniel", orgId: CRC, order: 0,
        })
        await seedServiceProfiles(ADMIN, { profiles: [KEY, "shabbat_morning:daniel_karen"], dryRun: false, force: true }, CRC)
    })

    it("drafts usual slots filled and the rest open, then creates the setlist", async () => {
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.ok).toBe(true)
        expect(draft.special).toBe(false)
        expect(draft.profile).toMatchObject({ key: KEY, book: "crc-saturday" })
        expect(draft.rows.map((r) => r.tier)).toEqual([null, "usual", "last_time"])
        expect(draft.rows[1]).toMatchObject({ fileId: "f-barchu", key: "Dm" })
        expect(draft.rows[2].fileId).toBeUndefined()
        expect(draft.openIndexes).toEqual([2])
        expect(draft.readback.exceptions.map((e) => e.kind)).toEqual(["open_slot"])
        expect(draft.readback.rest).toMatch(/1 songs?/)

        // Standing on the open slot; a one-off key change on the filled one.
        const created = (await createSetlistFromDraftTool(
            ADMIN,
            {
                draftId: draft.draftId,
                choices: [
                    { index: 2, fileId: "f-oseh", key: "D", standing: true, quote: "keep it in D" },
                    { index: 1, key: "Em" },
                ],
            },
            CRC,
        )) as Created
        expect(created.ok).toBe(true)
        expect(created.announcements).toHaveLength(1)
        expect(created.oneOffNote).toContain("Barchu (Walkdown) in Em")

        const setlist = (await db().collection("setlists").doc(created.setlistId).get()).data()!
        expect(setlist).toMatchObject({ orgId: CRC, serviceType: "shabbat_morning", rabbiSlot: "randy", special: false, book: "crc-saturday" })
        expect(typeof setlist.sourceTemplateId).toBe("string")
        const tracks = (await db().collection("tracks").where("setlistId", "==", created.setlistId).get()).docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)
        expect(tracks.map((t) => [t.title, t.fileId ?? null, t.key ?? null])).toEqual([
            ["Shacharit", null, null],
            ["Barchu", "f-barchu", "Em"],
            ["Oseh Shalom", "f-oseh", "D"],
        ])
        expect(tracks.every((t) => t.orgId === CRC)).toBe(true)
        // Pages: the moment row is bound to the profile's book.
        expect(tracks[1].liturgyRef).toMatchObject({ book: "crc-saturday", folio: 60 })

        // Only the standing choice was remembered; the one-off was not.
        const standing = (await db().collection("standing_choices").get()).docs.map((d) => d.data())
        expect(standing.map((s) => s.slotKey).every((k) => k.startsWith("song:"))).toBe(true)
        expect(standing.every((s) => s.fileId === "f-oseh" && s.key === "D" && s.orgId === CRC)).toBe(true)
        expect((await db().collection("service_drafts").doc(draft.draftId).get()).exists).toBe(false)

        // Next week the standing choice fills the slot.
        const next = (await draftServiceTool(ADMIN, { date: "2026-10-31", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(next.rows[2]).toMatchObject({ tier: "standard", fileId: "f-oseh", key: "D" })
    })

    const BM = "bnei_mitzvah_saturday"
    async function seedBneiMitzvah() {
        for (const [i, date] of ["2026-10-17", "2026-10-10"].entries()) {
            const id = `sl-bm-${i}`
            await db().collection("setlists").doc(id).set({
                orgId: CRC,
                name: `B'nei Mitzvah ${date}`,
                serviceType: BM,
                rabbiSlot: null,
                special: false,
                eventDate: Timestamp.fromDate(new Date(`${date}T15:00:00Z`)),
                date: Timestamp.fromDate(new Date(`${date}T12:00:00Z`)),
            })
            const rows = [
                { type: "song", title: "Barchu", momentId: "barchu", fileId: "f-barchu", key: "Dm", liturgyRef: { book: "legacy-beit-mitzvah", folio: 7, unitId: "shma.barchu@bm-shacharit" } },
                // A page in another book is never carried into this one.
                { type: "song", title: "Oseh Shalom", fileId: "f-oseh", key: "C", liturgyRef: { book: "crc-saturday", folio: 60 } },
            ]
            for (const [order, row] of rows.entries()) {
                await db().collection("tracks").doc(`${id}-${order}`).set({ ...row, setlistId: id, orgId: CRC, order })
            }
        }
        await seedServiceProfiles(ADMIN, { profiles: [BM], dryRun: false, force: true }, CRC)
    }

    it("a B'nei Mitzvah draft binds its rows to the Beit Mitzvah siddur, never another book's page", async () => {
        await seedBneiMitzvah()
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: BM }, CRC)) as Draft
        expect(draft.ok).toBe(true)
        expect(draft.profile).toMatchObject({ key: BM, book: "legacy-beit-mitzvah" })
        const created = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId }, CRC)) as Created
        expect(created.ok).toBe(true)

        const setlist = (await db().collection("setlists").doc(created.setlistId).get()).data()!
        expect(setlist).toMatchObject({ orgId: CRC, serviceType: BM, book: "legacy-beit-mitzvah" })
        const tracks = (await db().collection("tracks").where("setlistId", "==", created.setlistId).get()).docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)
        expect(tracks.map((t) => t.momentId ?? null)).toEqual(["barchu", null])
        expect(tracks[0].liturgyRef).toMatchObject({ book: "legacy-beit-mitzvah", folio: 7, unitId: "shma.barchu@bm-shacharit" })
        expect(tracks[1].liturgyRef?.book).not.toBe("crc-saturday")
        expect(tracks[1].liturgyRef?.folio ?? null).toBeNull()
    })

    it("a family's own booklet (book: null) gets no book and no page on any row", async () => {
        await seedBneiMitzvah()
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: BM }, CRC)) as Draft
        const created = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId, book: null }, CRC)) as Created
        expect(created.ok).toBe(true)
        expect(created.book).toBeNull()
        const setlist = (await db().collection("setlists").doc(created.setlistId).get()).data()!
        expect(setlist.book ?? null).toBeNull()
        const tracks = (await db().collection("tracks").where("setlistId", "==", created.setlistId).get()).docs.map((d) => d.data())
        expect(tracks).toHaveLength(2)
        expect(tracks.every((t) => t.liturgyRef == null)).toBe(true)
    })

    it("an explicit book:null drops a row's literal liturgyRef too; an omitted book copies it", async () => {
        const rows = [{ type: "prayer", title: "Bar'chu", momentId: "barchu", liturgyRef: { book: "legacy-beit-mitzvah", unitId: "shma.barchu@bm-shacharit", folio: 7 } }]
        const base = { rows, name: "Rows", sourceTemplateId: "tpl-x", logLabel: "test" }
        const none = await writeSetlistFromTemplateRows(db(), ADMIN, CRC, { ...base, book: null })
        const omitted = await writeSetlistFromTemplateRows(db(), ADMIN, CRC, { ...base })
        if (!none.ok || !omitted.ok) throw new Error("write failed")
        const rowOf = async (id: string) => (await db().collection("tracks").where("setlistId", "==", id).get()).docs[0].data()
        const noneRow = await rowOf(none.setlistId)
        expect(noneRow.liturgyRef).toBeUndefined()
        expect(noneRow.momentId).toBe("barchu")
        expect((await rowOf(omitted.setlistId)).liturgyRef).toMatchObject({ folio: 7 })
    })

    it("refuses an unknown book before creating anything", async () => {
        await seedBneiMitzvah()
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: BM }, CRC)) as Draft
        const r = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId, book: "no-such-book" }, CRC)) as unknown as Err
        expect(r.error.machine_code).toBe("unknown_book")
        expect((await db().collection("service_drafts").doc(draft.draftId).get()).exists).toBe(true)
        expect((await db().collection("setlists").where("serviceType", "==", BM).get()).size).toBe(2)
    })

    it("Randy's standing choice never shapes Daniel's profile or draft", async () => {
        const randy = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        await createSetlistFromDraftTool(ADMIN, { draftId: randy.draftId, choices: [{ index: 2, fileId: "f-oseh-2", key: "E", standing: true }] }, CRC)
        expect((await db().collection("standing_choices").get()).docs.map((d) => d.data().scope)).toEqual([KEY])

        const daniel = (await draftServiceTool(ADMIN, { date: "2026-10-25", serviceType: "shabbat_morning", rabbiSlot: "daniel_karen" }, CRC)) as Draft
        expect(daniel.ok).toBe(true)
        expect(daniel.rows.every((r) => r.tier !== "standard")).toBe(true)
        expect(daniel.rows.every((r) => r.fileId === undefined)).toBe(true)
    })

    it("one draft makes one setlist: a second create with the same draftId is draft_not_found", async () => {
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const [a, b] = await Promise.all([
            createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId }, CRC),
            createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId }, CRC),
        ])
        const results = [a, b] as Array<Created | Err>
        expect(results.filter((r) => r.ok).length).toBe(1)
        expect(results.filter((r) => !r.ok).map((r) => (r as Err).error.machine_code)).toEqual(["draft_not_found"])
        const again = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId }, CRC)) as unknown as Err
        expect(again.error.machine_code).toBe("draft_not_found")
        const made = (await db().collection("setlists").where("sourceTemplateId", "==", (await db().collection("setlistTemplates").where("profile.key", "==", KEY).get()).docs[0].id).get()).size
        expect(made).toBe(1)
    })

    it("a one-off choice writes nothing to standing_choices; an open slot with no choice has no chart", async () => {
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const created = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId, choices: [{ index: 1, key: "Em" }] }, CRC)) as Created
        expect(created.ok).toBe(true)
        expect(created.announcements).toEqual([])
        expect((await db().collection("standing_choices").get()).size).toBe(0)
        const open = (await db().collection("tracks").where("setlistId", "==", created.setlistId).where("order", "==", 2).get()).docs[0].data()
        expect(open.title).toBe("Oseh Shalom")
        expect(open.type).toBe("song")
        expect(open.fileId).toBeUndefined()
    })

    it("seeds a missing profile from its marked history on the first draft", async () => {
        const id = `profile__${CRC}__${KEY}`
        await db().collection("setlistTemplates").doc(id).delete()
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.ok).toBe(true)
        expect(draft.profile.key).toBe(KEY)
        expect(draft.rows.map((r) => r.tier)).toEqual([null, "usual", "last_time"])
        expect((await db().collection("setlistTemplates").doc(id).get()).exists).toBe(true)
    })

    it("says no_profile when no setlist is marked with that service and rabbi", async () => {
        await db().collection("setlistTemplates").doc(`profile__${CRC}__friday_night:randy`).delete()
        const r = (await draftServiceTool(ADMIN, { date: "2026-10-23", serviceType: "friday_night", rabbiSlot: "randy" }, CRC)) as unknown as Err
        expect(r.error.machine_code).toBe("no_profile")
        expect((await db().collection("setlistTemplates").where("profile.key", "==", "friday_night:randy").get()).size).toBe(0)
    })

    it("refuses without a rabbi, never inferring one", async () => {
        const r = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning" }, CRC)) as unknown as Err
        expect(r.error.machine_code).toBe("rabbi_required")
        expect((await db().collection("service_drafts").get()).size).toBe(0)
    })

    it("Brothers Lazaroff has no profile, and a CRC draft is not found from BL", async () => {
        const bl = (await draftServiceTool(BL_LEAD, { date: "2026-10-24", serviceType: "gig" }, BL)) as unknown as Err
        expect(bl.error.machine_code).toBe("no_profile")

        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const cross = (await createSetlistFromDraftTool(BL_LEAD, { draftId: draft.draftId, choices: [{ index: 2, fileId: "f-bl", standing: true }] }, BL)) as unknown as Err
        expect(cross.error.machine_code).toBe("draft_not_found")
        expect((await db().collection("setlists").where("orgId", "==", BL).get()).size).toBe(0)
        expect((await db().collection("standing_choices").get()).size).toBe(0)
        expect((await db().collection("service_drafts").doc(draft.draftId).get()).exists).toBe(true)
    })

    it("an expired draft is not found, and another tenant's chart is refused", async () => {
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const foreignChart = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId, choices: [{ index: 2, fileId: "f-bl" }] }, CRC)) as unknown as Err
        expect(foreignChart.error.machine_code).toBe("chart_not_found")

        await db().collection("service_drafts").doc(draft.draftId).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
        const expired = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId }, CRC)) as unknown as Err
        expect(expired.error.machine_code).toBe("draft_not_found")
    })
})
