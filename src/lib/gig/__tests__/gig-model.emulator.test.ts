// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

vi.mock("@/lib/rate-limit", () => ({ checkUserRateLimit: vi.fn().mockResolvedValue(null), checkRateLimit: vi.fn().mockResolvedValue(null) }))
const mockFileSave = vi.fn().mockResolvedValue(undefined)
const mockGetSignedUrl = vi.fn().mockResolvedValue(["https://signed.example/part.pdf"])
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({ bucket: () => ({ file: () => ({ save: mockFileSave, getSignedUrl: mockGetSignedUrl }) }) }),
}))
const printCalls: Array<{ musicianName?: string; tracks: Array<{ title: string; transposition?: number }> }> = []
vi.mock("@/lib/print-pipeline", () => ({
    generatePrintPdf: vi.fn(async (req: { musicianName?: string; tracks: Array<{ title: string; transposition?: number }> }) => {
        printCalls.push(req)
        return {
            pdf: new Uint8Array([37, 80, 68, 70]),
            stats: { totalTracks: 1, appendedTracks: 1, transposedTracks: 1, cacheHits: 0, cacheMisses: 0, fromResultCache: false, omittedTracks: [] },
        }
    }),
}))

import { getSetlist } from "@/lib/mcp/tools/setlists"
import { readBackSetlistTool } from "@/lib/mcp/tools/read-back-setlist"
import { addTrackToSetlist, updateSetlist, updateSetlistTrack } from "@/lib/mcp/tools/setlist-write"
import { updateSong } from "@/lib/mcp/tools/song-metadata"
import { createContact } from "@/lib/mcp/tools/contacts"
import { generateGigPacket } from "@/lib/mcp/tools/library-download"
import { createSetlistFromDraftTool, draftServiceTool } from "@/lib/mcp/tools/draft-service"
import { setStandingChoiceTool } from "@/lib/mcp/tools/standing"

/**
 * BET-5 PR B5a: the gig model's writes, both tenants. A CRC setlist without
 * the new fields reads exactly as before; Brothers Lazaroff never reads CRC's
 * gig data by id; a band draft from a past gig keeps its order and fills only
 * what the band kept.
 */
describe("gig model (emulator)", () => {
    let app: App
    const CRC = "crc"
    const BL = "brotherslazaroff"
    const CRC_ADMIN = "u-crc-admin"
    const BL_LEAD = "u-bl-lead"

    type Err = { ok: false; error: { machine_code: string } }
    const db = () => getFirestore(app)

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-gig-model" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        printCalls.length = 0
        for (const coll of ["setlists", "tracks", "library_index", "songs", "contacts", "standing_choices", "service_drafts", "users", "memberships"]) {
            const snap = await db().collection(coll).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        for (const [uid, org, role] of [
            [CRC_ADMIN, CRC, "admin"],
            [BL_LEAD, BL, "band_leader"],
        ]) {
            await db().collection("users").doc(uid).set({ displayName: uid, membershipsMigratedAt: new Date() })
            await db().collection("memberships").doc(`${org}__${uid}`).set({ uid, tenantId: org, role })
        }
        // A BL gig: two sets.
        await db().collection("setlists").doc("bl-gig").set({
            orgId: BL,
            name: "Pageant show",
            eventDate: Timestamp.fromDate(new Date("2026-10-03T01:00:00Z")),
            date: Timestamp.fromDate(new Date("2026-10-02T12:00:00Z")),
        })
        const blRows = [
            { id: "bl-h1", type: "header", title: "Set 1" },
            { id: "bl-a", type: "song", title: "Tune A", fileId: "f-bl-a", key: "G" },
            { id: "bl-b", type: "song", title: "Tune B", fileId: "f-bl-b", key: "D" },
            { id: "bl-h2", type: "header", title: "Set 2" },
            { id: "bl-c", type: "song", title: "Tune C" },
        ]
        for (const [order, { id, ...row }] of blRows.entries()) {
            await db().collection("tracks").doc(id).set({ ...row, id, setlistId: "bl-gig", orgId: BL, order })
        }
        await db().collection("library_index").doc("f-bl-a").set({ orgId: BL, name: "Tune A", partGroup: "pg-a" })
        await db().collection("library_index").doc("f-bl-b").set({ orgId: BL, name: "Tune B", partGroup: "pg-b" })
        await db().collection("library_index").doc("f-bl-a2").set({ orgId: BL, name: "Tune A (slow)", partGroup: "pg-a" })
        // A CRC service carrying gig data (it should not, but if it did, BL must not see it).
        await db().collection("setlists").doc("crc-svc").set({
            orgId: CRC,
            name: "Shabbat Morning",
            gig: { venue: "Sanctuary", notes: "private" },
            eventDate: Timestamp.fromDate(new Date("2026-10-03T15:00:00Z")),
        })
        await db().collection("tracks").doc("crc-1").set({ id: "crc-1", setlistId: "crc-svc", orgId: CRC, order: 0, type: "song", title: "Barchu", key: "Dm" })
    })

    it("update_setlist sets, merges and removes gig fields, and refuses a bad time", async () => {
        const first = (await updateSetlist(BL_LEAD, { id: "bl-gig", gig: { venue: "The Pageant", start: "20:00", setTargets: [{ headerRowId: "bl-h1", minutes: 45 }] } }, BL)) as {
            ok: true
            setlist: { gig?: Record<string, unknown> }
        }
        expect(first.ok).toBe(true)
        expect(first.setlist.gig).toMatchObject({ venue: "The Pageant", start: "20:00" })

        await updateSetlist(BL_LEAD, { id: "bl-gig", gig: { loadIn: "17:30", start: null } }, BL)
        const stored = (await db().collection("setlists").doc("bl-gig").get()).data()!
        expect(stored.gig).toEqual({ venue: "The Pageant", loadIn: "17:30", setTargets: [{ headerRowId: "bl-h1", minutes: 45 }] })

        const bad = (await updateSetlist(BL_LEAD, { id: "bl-gig", gig: { start: "8pm" } }, BL)) as Err
        expect(bad.error.machine_code).toBe("invalid_argument")

        await updateSetlist(BL_LEAD, { id: "bl-gig", gig: null }, BL)
        expect((await db().collection("setlists").doc("bl-gig").get()).data()!.gig).toBeUndefined()
    })

    it("update_track writes the band fields, null clears the length, bad values are refused", async () => {
        const ok = (await updateSetlistTrack(BL_LEAD, {
            setlistId: "bl-gig",
            trackId: "bl-a",
            patch: { durationSec: 245, segue: true, singerKeys: [{ musician: "Ben", key: "G" }, { musician: "Sam", key: "A" }] },
        }, BL)) as { ok: true }
        expect(ok.ok).toBe(true)
        let row = (await db().collection("tracks").doc("bl-a").get()).data()!
        expect(row).toMatchObject({ durationSec: 245, segue: true, singerKeys: [{ musician: "Ben", key: "G" }, { musician: "Sam", key: "A" }] })

        await updateSetlistTrack(BL_LEAD, { setlistId: "bl-gig", trackId: "bl-a", patch: { durationSec: null } }, BL)
        row = (await db().collection("tracks").doc("bl-a").get()).data()!
        expect(row.durationSec).toBeUndefined()

        const bad = (await updateSetlistTrack(BL_LEAD, { setlistId: "bl-gig", trackId: "bl-a", patch: { durationSec: -5 } }, BL)) as Err
        expect(bad.error.machine_code).toBe("invalid_argument")
    })

    it("get_setlist and read_back_setlist give a band its gig and set totals", async () => {
        await updateSetlist(BL_LEAD, { id: "bl-gig", gig: { venue: "The Pageant", setTargets: [{ headerRowId: "bl-h1", minutes: 5 }] } }, BL)
        await updateSetlistTrack(BL_LEAD, { setlistId: "bl-gig", trackId: "bl-a", patch: { durationSec: 240 } }, BL)
        await updateSetlistTrack(BL_LEAD, { setlistId: "bl-gig", trackId: "bl-b", patch: { durationSec: 120, segue: true } }, BL)

        const got = (await getSetlist(BL_LEAD, { id: "bl-gig" }, BL)) as Record<string, unknown> & {
            setTotals: Array<{ seconds: number; untimed: number; targetMinutes?: number; overUnderSec?: number }>
            tracks: Array<Record<string, unknown>>
        }
        expect(got.gig).toMatchObject({ venue: "The Pageant" })
        expect(got.setTotals).toEqual([
            { header: { id: "bl-h1", title: "Set 1" }, seconds: 360, untimed: 0, targetMinutes: 5, overUnderSec: 60 },
            { header: { id: "bl-h2", title: "Set 2" }, seconds: 0, untimed: 1 },
        ])
        expect(got.tracks.find((t) => t.id === "bl-b")).toMatchObject({ durationSec: 120, segue: true })

        const rb = (await readBackSetlistTool(BL_LEAD, { setlistId: "bl-gig" }, BL)) as { ok: true; setTotals: unknown[] }
        expect(rb.setTotals).toHaveLength(2)
    })

    it("a CRC setlist without the new fields reads exactly as before", async () => {
        const got = (await getSetlist(CRC_ADMIN, { id: "crc-svc" }, CRC)) as Record<string, unknown> & { tracks: Array<Record<string, unknown>> }
        expect(got).not.toHaveProperty("setTotals")
        for (const f of ["durationSec", "segue", "singerKeys"]) expect(got.tracks[0]).not.toHaveProperty(f)
        const rb = (await readBackSetlistTool(CRC_ADMIN, { setlistId: "crc-svc" }, CRC)) as unknown as Record<string, unknown>
        expect(rb).not.toHaveProperty("setTotals")
    })

    it("Brothers Lazaroff cannot read CRC's gig data by id", async () => {
        expect(await getSetlist(BL_LEAD, { id: "crc-svc" }, BL)).toBeNull()
        expect(((await readBackSetlistTool(BL_LEAD, { setlistId: "crc-svc" }, BL)) as Err).error.machine_code).toBe("setlist_not_found")
        expect(((await draftServiceTool(BL_LEAD, { date: "2026-11-07", basedOnSetlistId: "crc-svc" }, BL)) as Err).error.machine_code).toBe(
            "setlist_not_found",
        )
        expect(((await generateGigPacket(BL_LEAD, { setlistId: "crc-svc" }, BL)) as Err).error.machine_code).toBe("setlist_not_found")
        // And CRC cannot write BL's.
        expect(((await updateSetlist(CRC_ADMIN, { id: "bl-gig", gig: { venue: "x" } }, CRC)) as Err).ok).toBe(false)
        expect((await db().collection("setlists").doc("bl-gig").get()).data()!.gig).toBeUndefined()
    })

    it("update_song stores a length on both catalog surfaces and a new row copies it", async () => {
        await db().collection("library_index").doc("f-bl-song").set({ orgId: BL, name: "Song X" })
        await db().collection("songs").doc("f-bl-song").set({ orgId: BL, title: "Song X.pdf" })
        const res = (await updateSong(BL_LEAD, { id: "f-bl-song", durationSec: 210 }, BL)) as { ok: true; fieldsChanged: string[] }
        expect(res.fieldsChanged).toEqual(["durationSec"])
        expect((await db().collection("songs").doc("f-bl-song").get()).data()!.defaults.durationSec).toBe(210)
        expect((await db().collection("library_index").doc("f-bl-song").get()).data()!.durationSec).toBe(210)
        expect(((await updateSong(BL_LEAD, { id: "f-bl-song", durationSec: 99999 }, BL)) as Err).error.machine_code).toBe("invalid_argument")

        const added = (await addTrackToSetlist(BL_LEAD, { setlistId: "bl-gig", songId: "f-bl-song", force: true }, BL)) as { ok: true; trackId: string }
        expect((await db().collection("tracks").doc(added.trackId).get()).data()!.durationSec).toBe(210)
    })

    it("a contact's part is transposed by its transposition, in its own tenant only", async () => {
        const c = (await createContact(BL_LEAD, { name: "Sub Sax", email: "sub@example.com", instrument: "alto sax", transposition: "Eb" }, BL)) as {
            ok: true
            contact: { id: string; transposition?: string; instrument?: string }
        }
        expect(c.contact).toMatchObject({ transposition: "Eb", instrument: "alto sax" })
        expect(((await createContact(BL_LEAD, { name: "Bad", email: "b@example.com", transposition: "G" }, BL)) as Err).error.machine_code).toBe(
            "invalid_argument",
        )
        // A repeat create records a new part on the existing contact.
        const again = (await createContact(BL_LEAD, { name: "Sub Sax", email: "SUB@example.com", transposition: "Bb" }, BL)) as {
            created: boolean
            contact: { id: string; transposition?: string }
        }
        expect(again).toMatchObject({ created: false, contact: { id: c.contact.id, transposition: "Bb" } })

        await db().collection("tracks").doc("bl-a").update({ transposition: 1 })
        const part = (await generateGigPacket(BL_LEAD, { setlistId: "bl-gig", contactId: c.contact.id }, BL)) as {
            ok: true
            downloadUrl: string
            part: { transposition: string; semitones: number }
        }
        expect(part.ok).toBe(true)
        expect(part.part).toMatchObject({ transposition: "Bb", semitones: 2 })
        expect(part.downloadUrl).toBe("https://signed.example/part.pdf")
        const req = printCalls[0]
        expect(req.musicianName).toContain("Sub Sax")
        expect(req.tracks.find((t) => t.title === "Tune A")?.transposition).toBe(3)
        expect(req.tracks.find((t) => t.title === "Tune B")?.transposition).toBe(2)

        // CRC cannot build a part from BL's contact.
        const cross = (await generateGigPacket(CRC_ADMIN, { setlistId: "crc-svc", contactId: c.contact.id }, CRC)) as Err
        expect(cross.error.machine_code).toBe("contact_not_found")
    })

    it("a band drafts from a past gig: order kept, only the kept song filled, created as a set", async () => {
        // "Keep it" on Tune A at the Pageant show.
        await setStandingChoiceTool(BL_LEAD, { setlistId: "bl-gig", trackId: "bl-a" }, BL)
        const draft = (await draftServiceTool(BL_LEAD, { date: "2026-11-07", basedOnSetlistId: "bl-gig", name: "Blueberry Hill" }, BL)) as {
            ok: true
            draftId: string
            origin: { kind: string; setlistId: string }
            rows: Array<{ index: number; label: string; tier: string | null; fileId?: string; recall?: { fileId: string } }>
            openIndexes: number[]
            readback: { text: string }
        }
        expect(draft.ok).toBe(true)
        expect(draft.origin).toMatchObject({ kind: "gig", setlistId: "bl-gig" })
        expect(draft.rows.map((r) => r.label)).toEqual(["Set 1", "Tune A", "Tune B", "Set 2", "Tune C"])
        expect(draft.rows[1]).toMatchObject({ tier: "standard", fileId: "f-bl-a" })
        expect(draft.rows[2].fileId).toBeUndefined()
        expect(draft.rows[2].recall?.fileId).toBe("f-bl-b")
        expect(draft.openIndexes).toEqual([2, 4])
        expect(draft.readback.text).not.toMatch(/rabbi/i)

        const created = (await createSetlistFromDraftTool(BL_LEAD, { draftId: draft.draftId, choices: [{ index: 2, useRecall: true }] }, BL)) as {
            ok: true
            setlistId: string
        }
        expect(created.ok).toBe(true)
        const tracks = (await db().collection("tracks").where("setlistId", "==", created.setlistId).get()).docs
            .map((d) => d.data())
            .sort((a, b) => a.order - b.order)
        expect(tracks.map((t) => t.title)).toEqual(["Set 1", "Tune A", "Tune B", "Set 2", "Tune C"])
        expect(tracks[2].fileId).toBe("f-bl-b")
        expect(tracks.every((t) => t.orgId === BL)).toBe(true)
        const setlist = (await db().collection("setlists").doc(created.setlistId).get()).data()!
        expect(setlist.orgId).toBe(BL)
        expect(setlist.name).toBe("Blueberry Hill")
    })

    it("a congregation cannot use basedOnSetlistId; a band without it is told to pass one", async () => {
        expect(((await draftServiceTool(CRC_ADMIN, { date: "2026-11-07", basedOnSetlistId: "crc-svc" }, CRC)) as Err).error.machine_code).toBe(
            "invalid_argument",
        )
        expect(((await draftServiceTool(BL_LEAD, { date: "2026-11-07" }, BL)) as Err).error.machine_code).toBe("invalid_argument")
    })
})
