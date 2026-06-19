import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from "vitest"
import {
    initializeApp,
    deleteApp,
    getApps,
    type App,
} from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

import {
    findSetlistsReferencingChart,
    searchSetlists,
} from "../tools/setlists"

/**
 * v11.7-03 — emulator-backed tests for the setlist reverse-lookup tools.
 * Seeds real `setlists` + top-level `tracks` docs so the tools exercise their
 * real Firestore queries (tracks where fileId/songId == → getAll parents;
 * getAllSetlists + getTracksForSetlist). Mirrors the mcp-roster harness.
 */
describe("MCP setlist reverse-lookup tools (emulator)", () => {
    let app: App
    const CALLER = "rabbi-daniel"

    function db() {
        return getFirestore(app)
    }

    async function seedSetlist(
        id: string,
        opts: {
            name: string
            orgId?: string
            templateType?: string
            date: string
            eventDate?: string
        },
    ) {
        const payload: Record<string, unknown> = {
            name: opts.name,
            ownerId: CALLER,
            trackCount: 0,
            date: Timestamp.fromDate(new Date(`${opts.date}T00:00:00.000Z`)),
        }
        if (opts.orgId) payload.orgId = opts.orgId
        if (opts.templateType) payload.templateType = opts.templateType
        if (opts.eventDate) {
            payload.eventDate = Timestamp.fromDate(
                new Date(`${opts.eventDate}T00:00:00.000Z`),
            )
        }
        await db().collection("setlists").doc(id).set(payload)
    }

    async function seedTrack(
        id: string,
        opts: {
            setlistId: string
            fileId?: string
            songId?: string
            title?: string
            leadMusician?: string
            order?: number
        },
    ) {
        const payload: Record<string, unknown> = {
            setlistId: opts.setlistId,
            order: opts.order ?? 0,
        }
        if (opts.fileId) payload.fileId = opts.fileId
        if (opts.songId) payload.songId = opts.songId
        if (opts.title) payload.title = opts.title
        if (opts.leadMusician) payload.leadMusician = opts.leadMusician
        await db().collection("tracks").doc(id).set(payload)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-setlist-rev" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["setlists", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        // CRC setlists.
        await seedSetlist("S-crc", {
            name: "Erev Shabbat 6/19",
            orgId: "crc",
            templateType: "friday_night",
            date: "2026-06-17",
            eventDate: "2026-06-19",
        })
        await seedSetlist("S2-crc", {
            name: "Shabbat Morning 6/20",
            orgId: "crc",
            templateType: "shabbat_morning",
            date: "2026-06-18",
            eventDate: "2026-06-20",
        })
        // broslaz setlist (other tenant).
        await seedSetlist("S-bl", {
            name: "BL Show",
            orgId: "brotherslazaroff",
            templateType: "other",
            date: "2026-06-15",
            eventDate: "2026-06-21",
        })
        // NOTE: "S-dead" is intentionally NOT created (dangling parent).

        // Tracks: chart-A bonds a live CRC setlist, a dead parent, and a BL setlist.
        await seedTrack("t1", {
            setlistId: "S-crc",
            fileId: "chart-A",
            title: "Shalom Rav",
            leadMusician: "Randy",
            order: 0,
        })
        await seedTrack("t2", {
            setlistId: "S-dead",
            fileId: "chart-A",
            title: "Shalom Rav (orphan)",
            order: 1,
        })
        await seedTrack("t3", {
            setlistId: "S2-crc",
            songId: "song-Y",
            title: "Adon Olam",
            leadMusician: "Cantor",
            order: 0,
        })
        await seedTrack("t4", {
            setlistId: "S-bl",
            fileId: "chart-A",
            title: "Shalom Rav (BL)",
            order: 0,
        })
    })

    // ─── find_setlists_referencing_chart ──────────────────────────────────────

    it("by fileId: returns live in-tenant setlists, excludes dangling + other-tenant (AC-1/AC-4)", async () => {
        const r = await findSetlistsReferencingChart(
            CALLER,
            { fileId: "chart-A" },
            "crc",
        )
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        const ids = r.setlists.map((s) => s.setlistId)
        expect(ids).toContain("S-crc")
        expect(ids).not.toContain("S-dead") // dangling parent excluded
        expect(ids).not.toContain("S-bl") // tenant wall
        expect(r.danglingTracksIgnored).toBeGreaterThanOrEqual(1)
        const ref = r.setlists.find((s) => s.setlistId === "S-crc")!
        expect(ref.trackTitle).toBe("Shalom Rav")
        expect(ref.name).toBe("Erev Shabbat 6/19")
    })

    it("by songId: returns the live setlist bonding that song (AC-2)", async () => {
        const r = await findSetlistsReferencingChart(
            CALLER,
            { songId: "song-Y" },
            "crc",
        )
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.setlists.map((s) => s.setlistId)).toEqual(["S2-crc"])
    })

    it("rejects an empty call with invalid_argument (AC-2)", async () => {
        const r = await findSetlistsReferencingChart(CALLER, {}, "crc")
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("tenant wall: a BL caller does not see CRC-only bonds (AC-4)", async () => {
        const r = await findSetlistsReferencingChart(
            CALLER,
            { fileId: "chart-A" },
            "brotherslazaroff",
        )
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        const ids = r.setlists.map((s) => s.setlistId)
        expect(ids).toEqual(["S-bl"])
        expect(ids).not.toContain("S-crc")
    })

    // ─── search_setlists ──────────────────────────────────────────────────────

    it("by trackTitle: matches case-insensitively, carries matchedTracks (AC-3)", async () => {
        const r = await searchSetlists(CALLER, { trackTitle: "shalom" }, "crc")
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        const ids = r.setlists.map((s) => s.id)
        expect(ids).toContain("S-crc")
        expect(ids).not.toContain("S2-crc")
        const s = r.setlists.find((x) => x.id === "S-crc")!
        expect(s.matchedTracks.length).toBeGreaterThanOrEqual(1)
        expect(s.matchedTracks[0].title).toBe("Shalom Rav")
    })

    it("by leadMusician: matches the vocal lead (AC-3)", async () => {
        const r = await searchSetlists(CALLER, { leadMusician: "randy" }, "crc")
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.setlists.map((s) => s.id)).toContain("S-crc")
        expect(r.setlists.map((s) => s.id)).not.toContain("S2-crc")
    })

    it("by templateType: filters at the setlist level (AC-3)", async () => {
        const r = await searchSetlists(
            CALLER,
            { templateType: "friday_night" },
            "crc",
        )
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.setlists.map((s) => s.id)).toEqual(["S-crc"])
    })

    it("rejects an empty call with invalid_argument (AC-3)", async () => {
        const r = await searchSetlists(CALLER, {}, "crc")
        expect(r).toMatchObject({
            ok: false,
            error: { machine_code: "invalid_argument" },
        })
    })

    it("tenant wall: BL caller does not get CRC track matches (AC-4)", async () => {
        const r = await searchSetlists(
            CALLER,
            { trackTitle: "shalom" },
            "brotherslazaroff",
        )
        if (!("ok" in r) || !r.ok) throw new Error("expected ok=true")
        expect(r.setlists.map((s) => s.id)).not.toContain("S-crc")
    })
})
