import { describe, it, expect, vi, beforeEach } from "vitest"
import { fakeDb } from "@/lib/recordings/__tests__/fake-db"

let db = fakeDb()
const roles: Record<string, string> = {}
vi.mock("server-only", () => ({}))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/org/access", () => ({ readTenantRole: async (_db: unknown, uid: string, org: string) => roles[`${org}__${uid}`] }))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: async (_db: unknown, setlistId: string) =>
        Object.entries(db.store.tracks ?? {})
            .filter(([, t]) => t.setlistId === setlistId)
            .map(([id, t]) => ({ id, ...t })),
}))
vi.mock("@/lib/constants", () => ({ baseUrlFor: (org: string) => `https://${org}.test` }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { listRecordingsTool, updateRecordingTool } from "../recordings"

const take = (songId: string, org: string, extra: Record<string, unknown> = {}) => ({
    orgId: org, songId, title: "t", storagePath: "recordings/x.mp3", createdBy: "u", createdAt: "2026-01-01T00:00:00Z", ...extra,
})
const code = (r: unknown) => (r as { error?: { machine_code?: string } }).error?.machine_code

beforeEach(() => {
    for (const k of Object.keys(roles)) delete roles[k]
    roles["crc__lead"] = "band_leader"
    roles["crc__mus"] = "musician"
    roles["brotherslazaroff__bl"] = "band_leader"
    db = fakeDb({
        setlists: { sl: { orgId: "crc", name: "Shabbat" } },
        tracks: {
            t0: { setlistId: "sl", order: 0, type: "song", title: "Barchu", fileId: "s-barchu", songId: "s-barchu" },
            t1: { setlistId: "sl", order: 1, type: "song", title: "Oseh", fileId: "s-oseh", songId: "s-oseh" },
        },
        songs: { "s-barchu": { title: "Barchu (Walkdown)", orgId: "crc" }, "s-oseh": { title: "Oseh Shalom", orgId: "crc" }, "s-new": { title: "New", orgId: "crc" } },
        library_index: { "s-new": { name: "New", orgId: "crc" }, "s-bl": { name: "BL", orgId: "brotherslazaroff" } },
        recordings: {
            "r-lo": take("s-barchu", "crc", { source: { file: "a", serviceDate: "2026-01-10", startSec: 0, endSec: 9, confidence: 0.5 } }),
            "r-hi": take("s-barchu", "crc", { source: { file: "a", serviceDate: "2026-01-10", startSec: 10, endSec: 19, confidence: 0.9 } }),
            "r-held": take("s-oseh", "crc", { status: "held", source: { file: "a", serviceDate: "2026-01-10", startSec: 20, endSec: 29, confidence: 0.3 } }),
            "r-hidden": take("s-oseh", "crc", { status: "hidden" }),
            "r-bl": take("s-barchu", "brotherslazaroff"),
        },
    })
})

describe("list_recordings", () => {
    it("list by setlistId returns each song's takes, featured first", async () => {
        const r = (await listRecordingsTool("mus", { setlistId: "sl", status: "all" }, "crc")) as {
            recordings: Array<{ id: string; songId: string; featured: boolean; status: string; url: string }>
            counts: Record<string, number>
        }
        // Held first (spot-check), then songs in setlist order, featured first within a song.
        expect(r.recordings.map((x) => x.id)).toEqual(["r-held", "r-hi", "r-lo", "r-hidden"])
        expect(r.recordings.find((x) => x.id === "r-hi")!.featured).toBe(true)
        expect(r.recordings.find((x) => x.id === "r-lo")!.featured).toBe(false)
        expect(r.recordings.find((x) => x.id === "r-hi")!.url).toBe("https://crc.test/api/recordings/file/r-hi")
        expect(r.counts).toEqual({ live: 2, held: 1, hidden: 1 })
        // Another tenant's take on the same song id is never listed.
        expect(r.recordings.map((x) => x.id)).not.toContain("r-bl")
    })

    it("defaults to live takes", async () => {
        const r = (await listRecordingsTool("mus", { songId: "s-oseh" }, "crc")) as { recordings: unknown[] }
        expect(r.recordings).toEqual([])
    })
})

describe("update_recording", () => {
    it("dryRun reports without writing", async () => {
        const r = (await updateRecordingTool("lead", { recordingId: "r-lo", featured: true }, "crc")) as { applied: boolean; after: { featured: boolean } }
        expect(r).toMatchObject({ applied: false, after: { featured: true } })
        expect(db.store.recordings["r-lo"].featured).toBeUndefined()
    })

    it("a real featured write needs no force and moves featured off the others", async () => {
        db.store.recordings["r-hi"].featured = true
        const r = await updateRecordingTool("lead", { recordingId: "r-lo", featured: true, dryRun: false }, "crc")
        expect(r).toMatchObject({ applied: true })
        expect(db.store.recordings["r-lo"].featured).toBe(true)
        expect(db.store.recordings["r-hi"].featured).toBe(false)
    })

    it("reattach without force refuses", async () => {
        const r = await updateRecordingTool("lead", { recordingId: "r-lo", songId: "s-new", dryRun: false }, "crc")
        expect(code(r)).toBe("force_required")
        expect(db.store.recordings["r-lo"].songId).toBe("s-barchu")
        const ok = await updateRecordingTool("lead", { recordingId: "r-hi", songId: "s-new", dryRun: false, force: true }, "crc")
        expect(ok).toMatchObject({ applied: true, after: { songId: "s-new", featured: false } })
        expect(db.store.recordings["r-hi"].songId).toBe("s-new")
    })

    it("reattach to another tenant's chart is refused", async () => {
        const r = await updateRecordingTool("lead", { recordingId: "r-lo", songId: "s-bl", dryRun: false, force: true }, "crc")
        expect(code(r)).toBe("song_not_found")
    })

    it("other org's recording is not found", async () => {
        expect(code(await updateRecordingTool("bl", { recordingId: "r-lo", status: "hidden", dryRun: false }, "brotherslazaroff"))).toBe("recording_not_found")
        expect(db.store.recordings["r-lo"].status).toBeUndefined()
    })

    it("a musician cannot write", async () => {
        expect(code(await updateRecordingTool("mus", { recordingId: "r-lo", status: "hidden", dryRun: false }, "crc"))).toBe("forbidden_role")
    })

    it("hidden take can be set live again", async () => {
        const r = await updateRecordingTool("lead", { recordingId: "r-hidden", status: "live", dryRun: false }, "crc")
        expect(r).toMatchObject({ applied: true, before: { status: "hidden" }, after: { status: "live" } })
        expect(db.store.recordings["r-hidden"].status).toBe("live")
    })

    it("hiding the featured take un-features it", async () => {
        db.store.recordings["r-hi"].featured = true
        await updateRecordingTool("lead", { recordingId: "r-hi", status: "hidden", dryRun: false }, "crc")
        expect(db.store.recordings["r-hi"]).toMatchObject({ status: "hidden", featured: false })
    })
})
