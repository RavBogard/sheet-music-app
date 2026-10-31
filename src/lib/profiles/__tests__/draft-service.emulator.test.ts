import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import { createSetlistFromDraftTool, draftServiceTool } from "@/lib/mcp/tools/draft-service"
import { reseedServiceProfileTool, seedServiceProfiles } from "@/lib/mcp/tools/service-profiles"
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
    const MUSICIAN = "u-musician"

    function db() {
        return getFirestore(app)
    }

    type Err = { ok: false; error: { machine_code: string } }
    type Draft = {
        ok: true
        draftId: string
        special: boolean
        profile: { key: string; book: string | null }
        rows: Array<{ index: number; label: string; tier: string | null; fileId?: string; key?: string | null; recall?: { fileId: string; key: string | null } }>
        openIndexes: number[]
        readback: { headline: string; text: string; exceptions: Array<{ kind: string; text: string }>; rest: string }
        origin: { kind: string; count?: number; name?: string }
        vsLast: { setlistId: string; rows: Array<{ slotKey: string; fileId: string; key: string | null }> } | null
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
        const devs = await db().collectionGroup("performedDeviations").get()
        await Promise.all(devs.docs.map((d) => d.ref.delete()))
        for (const [uid, org, role] of [
            [ADMIN, CRC, "admin"],
            [BL_LEAD, BL, "band_leader"],
            [MUSICIAN, CRC, "musician"],
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
            ["Bar’chu", "f-barchu", "Em"],
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

    it("seeds a missing profile from its marked history on the first current draft, never from a past date", async () => {
        const id = `profile__${CRC}__${KEY}`
        await db().collection("setlistTemplates").doc(id).delete()
        const past = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(past.rows.map((r) => r.tier)).toEqual([null, "usual", "last_time"])
        expect((await db().collection("setlistTemplates").doc(id).get()).exists).toBe(false)
        const draft = (await draftServiceTool(ADMIN, { date: "2099-01-03", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.ok).toBe(true)
        expect(draft.profile.key).toBe(KEY)
        expect(draft.rows.map((r) => r.tier)).toEqual([null, "usual", "last_time"])
        expect((await db().collection("setlistTemplates").doc(id).get()).exists).toBe(true)
    })

    it("a standard set on Mi Chamocha before moment slots (song:<partGroup>) still fills the moment slot, after a re-learn", async () => {
        await db().collection("library_index").doc("f-mi-moshav").set({ orgId: CRC, name: "Mi Chamocha (Moshav)", partGroup: "pg-mi-moshav" })
        await db().collection("library_index").doc("f-mi-68").set({ orgId: CRC, name: "Mi Chamocha 6-8", partGroup: "pg-mi-68" })
        for (const [i, [title, fileId]] of [["Mi Chamocha 6-8", "f-mi-68"], ["Mi Chamocha (Moshav)", "f-mi-moshav"], ["Mi Chamocha (Moshav)", "f-mi-moshav"]].entries()) {
            await db().collection("tracks").doc(`sl-${i}-3`).set({ type: "song", title, fileId, key: "E", setlistId: `sl-${i}`, orgId: CRC, order: 3 })
        }
        // The old key: the Moshav chart's song slot, though the latest week played 6-8.
        await db().collection("standing_choices").doc(`${CRC}__${encodeURIComponent(KEY)}__${encodeURIComponent("song:pg-mi-moshav")}`).set({
            orgId: CRC,
            scope: KEY,
            slotKey: "song:pg-mi-moshav",
            fileId: "f-mi-moshav",
            chartName: "Mi Chamocha (Moshav)",
            key: "F",
            partGroup: "pg-mi-moshav",
            leadMusician: null,
            by: ADMIN,
            byName: "Daniel",
            at: "2026-09-01T00:00:00Z",
            quote: null,
            previous: null,
        })
        await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy", dryRun: false, force: true }, CRC)
        const draft = (await draftServiceTool(ADMIN, { date: "2099-01-03", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const miRow = draft.rows.find((r) => r.label === "Mi Chamocha")!
        expect(miRow).toMatchObject({ tier: "standard", fileId: "f-mi-moshav", key: "F" })
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

    // ─── Bet 1: service memory ───────────────────────────────────────────

    it("the order is learned from the last regular services, and the headline says so; a Bat Mitzvah never feeds it", async () => {
        // A Bat Mitzvah stored as shabbat_morning/randy, newer than every regular week.
        await db().collection("setlists").doc("sl-bm").set({
            orgId: CRC,
            name: "Eliana Levine Bat Mitzvah",
            serviceType: "shabbat_morning",
            rabbiSlot: "randy",
            special: false,
            eventDate: Timestamp.fromDate(new Date("2026-10-18T15:00:00Z")),
        })
        await db().collection("tracks").doc("sl-bm-0").set({ type: "song", title: "Intro Music", fileId: "f-oseh", setlistId: "sl-bm", orgId: CRC, order: 0 })
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.origin).toMatchObject({ kind: "history", count: 3 })
        expect(draft.readback.headline).toMatch(/last 3 regular Shabbat mornings, Oct 3 – Oct 17/)
        expect(draft.rows.map((r) => r.label)).toEqual(["Shacharit", "Bar’chu", "Oseh Shalom"])
        expect(draft.vsLast?.setlistId).toBe("sl-0")
        expect(draft.vsLast?.rows.map((r) => [r.slotKey, r.fileId])).toEqual([
            ["moment:barchu", "f-barchu"],
            ["song:pg-oseh", "f-oseh"],
        ])
    })

    it("an open row recalls last time's exact chart, and useRecall creates with it", async () => {
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.rows[2].fileId).toBeUndefined()
        expect(draft.rows[2].recall).toMatchObject({ fileId: "f-oseh", key: "C" })
        const created = (await createSetlistFromDraftTool(ADMIN, { draftId: draft.draftId, choices: [{ index: 2, useRecall: true }] }, CRC)) as Created
        expect(created.ok).toBe(true)
        const row = (await db().collection("tracks").where("setlistId", "==", created.setlistId).where("order", "==", 2).get()).docs[0].data()
        expect([row.fileId, row.key]).toEqual(["f-oseh", "C"])
        expect((await db().collection("standing_choices").get()).size).toBe(0)
    })

    it("carries the previous setlist's unresolved open items into the draft readback", async () => {
        await db().collection("setlists").doc("sl-0").update({
            openItems: [
                { id: "o1", text: "new Oseh arrangement coming", trackId: null, createdAt: "2026-10-16T00:00:00Z", createdByName: "Daniel", resolvedAt: null },
                { id: "o2", text: "done already", trackId: null, createdAt: "2026-10-16T00:00:00Z", createdByName: "Daniel", resolvedAt: "2026-10-17T00:00:00Z" },
            ],
        })
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        const items = draft.readback.exceptions.filter((e) => e.kind === "open_item")
        expect(items).toHaveLength(1)
        expect(items[0].text).toContain("new Oseh arrangement coming")
    })

    it("history is read as performed: a chart the band swapped in counts toward the usual", async () => {
        for (const i of [1, 2]) {
            await db().collection("tracks").doc(`sl-${i}-2`).update({ fileId: "f-oseh-2" })
        }
        // Planned f-oseh on Oct 17, but the band swapped to f-oseh-2 that morning.
        await db().collection("setlists").doc("sl-0").collection("performedDeviations").doc("2026-10-17-000001-sl-0-2").set({
            rowId: "sl-0-2",
            kind: "swap",
            plannedFileId: "f-oseh",
            plannedTitle: "Oseh Shalom (Hirsch)",
            beforeFileId: "f-oseh",
            beforeTitle: "Oseh Shalom (Hirsch)",
            performedFileId: "f-oseh-2",
            performedTitle: "Oseh Shalom (Zeira)",
            at: Date.parse("2026-10-17T16:00:00Z"),
            by: ADMIN,
            eventDay: "2026-10-17",
            rev: 1,
        })
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-24", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.rows[2]).toMatchObject({ tier: "usual", fileId: "f-oseh-2" })
        // The plan itself is never written.
        expect((await db().collection("tracks").doc("sl-0-2").get()).data()!.fileId).toBe("f-oseh")
    })

    it("with no history, a matching legacy template gives the order with every song open", async () => {
        await db().collection("setlistTemplates").doc("tpl-randy-fri").set({
            orgId: CRC,
            name: "Randy Friday night",
            templateType: "friday_night",
            tracks: [
                { type: "header", title: "Kabbalat Shabbat" },
                { type: "song", title: "L'cha Dodi", fileId: "f-barchu", key: "G" },
            ],
        })
        // Daniel's Friday template never answers for Randy.
        await db().collection("setlistTemplates").doc("tpl-daniel-fri").set({ orgId: CRC, name: "Daniel Friday night", templateType: "friday_night", tracks: [] })
        const draft = (await draftServiceTool(ADMIN, { date: "2026-10-23", serviceType: "friday_night", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.ok).toBe(true)
        expect(draft.origin).toMatchObject({ kind: "template", name: "Randy Friday night" })
        expect(draft.readback.headline).toContain("Randy Friday night template")
        expect(draft.rows.map((r) => r.label)).toEqual(["Kabbalat Shabbat", "L'cha Dodi"])
        expect(draft.rows[1].fileId).toBeUndefined()
        expect(draft.openIndexes).toEqual([1])
    })

    it("reseed_service_profile: dry run by default, force to write, editors only, CRC profiles only", async () => {
        const id = `profile__${CRC}__${KEY}`
        await db().collection("setlistTemplates").doc(id).update({ tracks: [{ type: "header", title: "stale" }] })
        type Report = { ok: true; dryRun: boolean; outcome: string; learnedFrom: Array<{ setlistId: string }>; order: Array<{ title: string }> }
        const dry = (await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Report
        expect(dry).toMatchObject({ ok: true, dryRun: true, outcome: "updated" })
        expect(dry.learnedFrom.map((s) => s.setlistId)).toEqual(["sl-0", "sl-1", "sl-2"])
        expect(dry.order.map((r) => r.title)).toEqual(["Shacharit", "Bar’chu", "Oseh Shalom"])
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toHaveLength(1)

        const noForce = (await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy", dryRun: false }, CRC)) as unknown as Err
        expect(noForce.error.machine_code).toBe("force_required")
        const real = (await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy", dryRun: false, force: true }, CRC)) as Report
        expect(real.dryRun).toBe(false)
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toHaveLength(3)

        const musician = (await reseedServiceProfileTool(MUSICIAN, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as unknown as Err
        expect(musician.error.machine_code).toBe("forbidden_role")
        const noRabbi = (await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning" }, CRC)) as unknown as Err
        expect(noRabbi.error.machine_code).toBe("rabbi_required")
        const bl = (await reseedServiceProfileTool(BL_LEAD, { serviceType: "gig" }, BL)) as unknown as Err
        expect(bl.error.machine_code).toBe("profile_not_found")
        expect((await db().collection("setlistTemplates").where("orgId", "==", BL).get()).size).toBe(0)
    })

    it("never writes a learned order under half the saved one without allowShrink, from reseed or a draft", async () => {
        const id = `profile__${CRC}__${KEY}`
        const saved = Array.from({ length: 10 }, (_, i) => ({ type: "header", title: `saved ${i}` }))
        await db().collection("setlistTemplates").doc(id).update({ tracks: saved })
        type Report = { ok: true; outcome: string; shrinkGuard?: { reason: string; learned: number; stored: number; overridden: boolean } }

        const dry = (await reseedServiceProfileTool(ADMIN, { serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Report
        expect(dry.shrinkGuard).toMatchObject({ reason: "shrinks_by_half", learned: 3, stored: 10, overridden: false })
        const refused = (await reseedServiceProfileTool(
            ADMIN,
            { serviceType: "shabbat_morning", rabbiSlot: "randy", dryRun: false, force: true },
            CRC,
        )) as unknown as Err
        expect(refused.error.machine_code).toBe("shrink_refused")
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toHaveLength(10)

        // A current draft neither caches the halved order nor drafts from it.
        const draft = (await draftServiceTool(ADMIN, { date: "2099-01-03", serviceType: "shabbat_morning", rabbiSlot: "randy" }, CRC)) as Draft
        expect(draft.origin.kind).toBe("saved_profile")
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toHaveLength(10)

        const forced = (await reseedServiceProfileTool(
            ADMIN,
            { serviceType: "shabbat_morning", rabbiSlot: "randy", dryRun: false, force: true, allowShrink: true },
            CRC,
        )) as Report
        expect(forced.shrinkGuard?.overridden).toBe(true)
        expect((await db().collection("setlistTemplates").doc(id).get()).data()!.tracks).toHaveLength(3)
    })
})
