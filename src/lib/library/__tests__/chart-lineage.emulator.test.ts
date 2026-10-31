import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

import { applyRevision, loadRevisionTarget, type RevisionTarget } from "../lineage"
import { backfillChartLineage } from "@/lib/mcp/tools/backfill-chart-lineage"

/**
 * Bet 2 — chart lineage against the Firestore emulator. Daniel's ruling
 * (2026-10-31): a revised chart applies to FUTURE setlists only; past
 * setlists keep their exact chart, played keys are kept, and standing
 * choices follow the new version. Both tenants are seeded: a Brothers
 * Lazaroff caller can neither see nor link a CRC chart, and a CRC revision
 * never touches a Brothers Lazaroff setlist, standing choice or profile.
 */
describe("chart lineage (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const NOW = Date.parse("2026-11-01T18:00:00.000Z")
    const LEADER = { role: "admin", canUpload: true, email: "rabbi@crc.test" }

    function db() {
        return getFirestore(app)
    }
    function code(r: unknown): string | undefined {
        const e = r as { ok?: boolean; error?: { machine_code?: string } }
        return e && e.ok === false && e.error ? e.error.machine_code : undefined
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-chart-lineage" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const coll of ["setlists", "tracks", "songs", "library_index", "setlistTemplates", "users", "standing_choices", "library_signals"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        await db().collection("users").doc(ADMIN).set({ role: "admin", email: "rabbi@crc.test" })

        const chart = (id: string, name: string, org: string, extra: Record<string, unknown> = {}) =>
            Promise.all([
                db().collection("library_index").doc(id).set({ name, orgId: org, status: "active", collection: "uploads", uploadedBy: ADMIN, ...extra }),
                db().collection("songs").doc(id).set({ title: name, orgId: org, status: "active", defaults: { key: extra.key ?? null } }),
            ])
        await chart("old", "Adon Olam band chart", CRC, { key: "D", partGroup: "adon olam band chart", uploadedAt: "2026-01-01T00:00:00Z" })
        await chart("new", "Adon Olam band chart DRAFT v2", CRC, { key: "C", partGroup: "adon olam band chart draft v2", uploadedAt: "2026-10-30T00:00:00Z" })

        const setlist = (id: string, org: string, eventDate: string) =>
            db().collection("setlists").doc(id).set({ name: id, orgId: org, eventDate, date: eventDate, ownerId: ADMIN, version: 1, trackCount: 1, songCount: 1, fileIds: ["old"] })
        const track = (id: string, setlistId: string, org: string, title: string) =>
            db().collection("tracks").doc(id).set({ setlistId, orgId: org, order: 0, type: "song", title, songId: "old", fileId: "old", key: "E", version: 1 })
        await setlist("s-past", CRC, "2026-10-24T15:00:00.000Z")
        await track("t-past", "s-past", CRC, "Adon Olam")
        await setlist("s-next", CRC, "2026-11-07T15:00:00.000Z")
        await track("t-next", "s-next", CRC, "Adon Olam (closing)")
        // A Brothers Lazaroff gig using the CRC chart (a shared chart).
        await setlist("s-bl", BL, "2026-11-08T01:00:00.000Z")
        await track("t-bl", "s-bl", BL, "Adon Olam")

        const standing = (org: string) =>
            db().collection("standing_choices").doc(`${org}__friday_night__moment%3Aadon-olam`).set({
                orgId: org, scope: "friday_night", slotKey: "moment:adon-olam", fileId: "old", chartName: "Adon Olam band chart",
                key: "E", partGroup: "adon olam band chart", leadMusician: null, by: ADMIN, byName: "Daniel", at: "2026-10-01T00:00:00Z", quote: null, previous: null,
            })
        await standing(CRC)
        await standing(BL)

        const profile = (org: string) =>
            db().collection("setlistTemplates").doc(`profile__${org}__friday_night`).set({
                orgId: org, kind: "profile", profile: { key: "friday_night" }, version: 1,
                tracks: [
                    { type: "song", title: "Adon Olam", fileId: "old", fileName: "old.pdf", key: "E" },
                    { type: "song", title: "Shalom Aleichem", fileId: "other", parts: [{ fileId: "old", chartName: "Adon Olam band chart", title: "x" }] },
                ],
            })
        await profile(CRC)
        await profile(BL)
    })

    async function target(org = CRC): Promise<RevisionTarget> {
        const t = await loadRevisionTarget(db(), "old", org, ADMIN, LEADER)
        if ("error" in t) throw new Error(`no target: ${JSON.stringify(t)}`)
        return t
    }

    it("moves upcoming rows only, keeping their played key and title; past setlists keep the exact chart", async () => {
        const report = await applyRevision(ADMIN, CRC, await target(), "new", { tool: "test", nowMs: NOW })

        expect(report.repointed.map((r) => r.setlistId)).toEqual(["s-next"])
        expect(report.keptPast.map((r) => r.setlistId)).toEqual(["s-past"])

        const next = (await db().collection("tracks").doc("t-next").get()).data()!
        expect(next).toMatchObject({ fileId: "new", songId: "new", key: "E", title: "Adon Olam (closing)" })
        const past = (await db().collection("tracks").doc("t-past").get()).data()!
        expect(past).toMatchObject({ fileId: "old", songId: "old", key: "E", title: "Adon Olam" })
    })

    it("writes the lineage on both rows, gives the new row the old partGroup, and archives the old row", async () => {
        const report = await applyRevision(ADMIN, CRC, await target(), "new", { tool: "test", nowMs: NOW })
        expect(report).toMatchObject({ revisionOf: "old", lineageId: "old", previousArchived: true })

        const oldRow = (await db().collection("library_index").doc("old").get()).data()!
        expect(oldRow).toMatchObject({ status: "archived", supersededBy: "new", lineageId: "old", canonicalFileId: "new", priorStatus: "active" })
        const newRow = (await db().collection("library_index").doc("new").get()).data()!
        expect(newRow).toMatchObject({ lineageId: "old", supersedes: "old", revisionOf: "old", partGroup: "adon olam band chart", status: "active" })

        // A second version after the first is refused on the superseded row.
        const again = await loadRevisionTarget(db(), "old", CRC, ADMIN, LEADER)
        expect(code(again)).toBe("already_superseded")
    })

    it("moves this org's standing choices and profile rows, nothing of the other tenant's", async () => {
        const report = await applyRevision(ADMIN, CRC, await target(), "new", { tool: "test", nowMs: NOW })
        expect(report.standingMoved).toBe(1)
        expect(report.profileRowsMoved).toBe(2)

        const crcStanding = (await db().collection("standing_choices").doc(`${CRC}__friday_night__moment%3Aadon-olam`).get()).data()!
        expect(crcStanding).toMatchObject({ fileId: "new", key: "E", revisedFrom: "old" })
        const blStanding = (await db().collection("standing_choices").doc(`${BL}__friday_night__moment%3Aadon-olam`).get()).data()!
        expect(blStanding.fileId).toBe("old")

        const crcProfile = (await db().collection("setlistTemplates").doc(`profile__${CRC}__friday_night`).get()).data()!
        expect(crcProfile.tracks[0]).toMatchObject({ fileId: "new", key: "E" })
        expect(crcProfile.tracks[0].fileName).toBeUndefined()
        expect(crcProfile.tracks[1].parts[0].fileId).toBe("new")
        const blProfile = (await db().collection("setlistTemplates").doc(`profile__${BL}__friday_night`).get()).data()!
        expect(blProfile.tracks[0].fileId).toBe("old")
        expect(blProfile.tracks[1].parts[0].fileId).toBe("old")

        const blTrack = (await db().collection("tracks").doc("t-bl").get()).data()!
        expect(blTrack.fileId).toBe("old")
    })

    it("another tenant can neither see nor link the chart", async () => {
        const r = await loadRevisionTarget(db(), "old", BL, ADMIN, LEADER)
        expect(code(r)).toBe("row_not_found")
        expect(JSON.stringify(r)).not.toContain("Adon Olam")
    })

    it("a musician may revise only a chart they filed", async () => {
        const musician = { role: "musician", canUpload: true, email: "m@crc.test" }
        expect(code(await loadRevisionTarget(db(), "old", CRC, "someone-else", musician))).toBe("forbidden")
        const own = await loadRevisionTarget(db(), "old", CRC, ADMIN, musician)
        expect(code(own)).toBeUndefined()
    })

    it("backfill_chart_lineage: dry run lists the pair, a real run needs force and links this org only", async () => {
        // A Brothers Lazaroff pair of the same shape stays out of a CRC run.
        await db().collection("library_index").doc("bl-a").set({ name: "Adon Olam band chart", orgId: BL, status: "active", uploadedAt: "2026-01-01T00:00:00Z" })
        await db().collection("library_index").doc("bl-b").set({ name: "Adon Olam band chart v2", orgId: BL, status: "active", uploadedAt: "2026-02-01T00:00:00Z" })

        const dry = (await backfillChartLineage(ADMIN, {}, CRC)) as { ok: true; dryRun: boolean; pairs: Array<{ from: { fileId: string }; to: { fileId: string } }> }
        expect(dry.dryRun).toBe(true)
        expect(dry.pairs.map((p) => [p.from.fileId, p.to.fileId])).toEqual([["old", "new"]])
        expect((await db().collection("library_index").doc("old").get()).data()!.supersededBy).toBeUndefined()

        const refused = await backfillChartLineage(ADMIN, { dryRun: false }, CRC)
        expect(code(refused)).toBe("force_required")

        const real = (await backfillChartLineage(ADMIN, { dryRun: false, force: true }, CRC)) as { ok: true; standingMoved: number }
        expect(real.ok).toBe(true)
        expect(real.standingMoved).toBe(1)
        const oldRow = (await db().collection("library_index").doc("old").get()).data()!
        expect(oldRow).toMatchObject({ lineageId: "old", supersededBy: "new", status: "active" })
        const newRow = (await db().collection("library_index").doc("new").get()).data()!
        expect(newRow).toMatchObject({ lineageId: "old", supersedes: "old", partGroup: "adon olam band chart" })
        // Setlists are untouched by a back-fill.
        expect((await db().collection("tracks").doc("t-next").get()).data()!.fileId).toBe("old")
        // The other tenant's rows are not linked.
        expect((await db().collection("library_index").doc("bl-a").get()).data()!.supersededBy).toBeUndefined()
        const blStanding = (await db().collection("standing_choices").doc(`${BL}__friday_night__moment%3Aadon-olam`).get()).data()!
        expect(blStanding.fileId).toBe("old")
    })
})
