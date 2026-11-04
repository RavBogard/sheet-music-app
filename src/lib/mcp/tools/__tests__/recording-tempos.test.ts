import { describe, it, expect, vi, beforeEach } from "vitest"
import { fakeDb } from "@/lib/recordings/__tests__/fake-db"

let db = fakeDb()
const roles: Record<string, string> = {}
const maintainSetlist = vi.fn()
vi.mock("server-only", () => ({}))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/org/access", () => ({ readTenantRole: async (_db: unknown, uid: string, org: string) => roles[`${org}__${uid}`] }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
const { MaintenanceError } = vi.hoisted(() => ({
    MaintenanceError: class MaintenanceError extends Error {
        constructor(readonly code: string) {
            super(code)
        }
    },
}))
vi.mock("@/lib/setlist-ops", () => ({ maintainSetlist: (...a: unknown[]) => maintainSetlist(...a), MaintenanceError, MAX_TRANSACTION_WRITES: 500 }))

import { applyRecordingTemposTool, type ApplyRecordingTemposResult } from "../recording-tempos"

const T = (bpm: number, confidence: number) => ({ bpm, alt: bpm / 2, confidence, confident: confidence >= 0.5, method: "m" })
const take = (songId: string, org: string, extra: Record<string, unknown> = {}) => ({
    orgId: org, songId, title: "t", storagePath: "recordings/x.mp3", createdBy: "u", createdAt: "2026-01-01T00:00:00Z", ...extra,
})
const code = (r: unknown) => (r as { error?: { machine_code?: string } }).error?.machine_code

beforeEach(() => {
    maintainSetlist.mockReset()
    for (const k of Object.keys(roles)) delete roles[k]
    roles["crc__lead"] = "band_leader"
    roles["crc__mus"] = "musician"
    roles["brotherslazaroff__bl"] = "admin"
    db = fakeDb({
        setlists: { sl: { orgId: "crc", name: "Shabbat" }, "sl-bl": { orgId: "brotherslazaroff", name: "Gig" } },
        tracks: {
            empty: { setlistId: "sl", orgId: "crc", type: "song", songId: "s1" },
            typed: { setlistId: "sl", orgId: "crc", type: "song", songId: "s1", bpm: 120 },
            legacy: { setlistId: "sl", type: "song", fileId: "s1" },
            orphan: { setlistId: "gone", orgId: "crc", type: "song", songId: "s1" },
            header: { setlistId: "sl", orgId: "crc", type: "header", songId: "s1" },
            "bl-row": { setlistId: "sl-bl", orgId: "brotherslazaroff", type: "song", songId: "s1" },
        },
        songs: { s1: { title: "Lecha Dodi", orgId: "crc", defaults: { bpm: 88 } } },
        library_index: { s1: { name: "Lecha Dodi", orgId: "crc" } },
        recordings: {
            "r-crc": take("s1", "crc", { tempo: T(96.4, 0.8) }),
            "r-bl": take("s1", "brotherslazaroff", { tempo: T(150, 0.9) }),
        },
    })
})

describe("apply_recording_tempos", () => {
    it("dryRun (the default) reports each field and writes nothing", async () => {
        const before = JSON.stringify(db.store)
        const r = (await applyRecordingTemposTool("lead", {}, "crc")) as ApplyRecordingTemposResult
        expect(r).toMatchObject({ ok: true, dryRun: true, applied: false })
        expect(r.recordings.map((x) => x.recordingId)).toEqual(["r-crc"])
        const fields = Object.fromEntries(r.recordings[0].fields!.map((f) => [`${f.target}:${f.doc ?? f.id}`, f]))
        // Each catalog doc is decided on its own field: the index is empty, the song default typed.
        expect(fields["song:library_index"]).toMatchObject({ action: "fill", after: 96 })
        expect(fields["song:songs"]).toMatchObject({ action: "skip", before: 88 })
        expect(fields["row:empty"]).toMatchObject({ action: "fill", after: 96, setlistId: "sl" })
        expect(fields["row:legacy"]).toMatchObject({ action: "fill" })
        expect(fields["row:typed"]).toMatchObject({ action: "skip", before: 120 })
        expect(fields["row:orphan"]).toMatchObject({ action: "skip" })
        expect(fields["row:header"]).toBeUndefined()
        expect(r.summary).toMatchObject({ fill: 3, skip: 3 })
        expect(JSON.stringify(db.store)).toBe(before)
        expect(maintainSetlist).not.toHaveBeenCalled()
    })

    it("is tenant-scoped: another tenant's recordings and rows are never seen", async () => {
        const crc = (await applyRecordingTemposTool("lead", {}, "crc")) as ApplyRecordingTemposResult
        const ids = crc.recordings.flatMap((x) => x.fields ?? []).map((f) => f.id)
        expect(ids).not.toContain("bl-row")
        const bl = (await applyRecordingTemposTool("bl", {}, "brotherslazaroff")) as ApplyRecordingTemposResult
        expect(bl.recordings.map((x) => x.recordingId)).toEqual(["r-bl"])
        const blFields = bl.recordings[0].fields!
        // BL's take reaches BL's own row only; CRC's chart is not BL's to change.
        expect(blFields.filter((f) => f.target === "row").map((f) => f.id)).toEqual(["bl-row"])
        expect(blFields.find((f) => f.target === "song")).toMatchObject({ action: "skip" })
    })

    it("a real write needs force; only admins and band leaders may run it", async () => {
        expect(code(await applyRecordingTemposTool("lead", { dryRun: false }, "crc"))).toBe("force_required")
        expect(maintainSetlist).not.toHaveBeenCalled()
        expect(code(await applyRecordingTemposTool("mus", {}, "crc"))).toBe("forbidden_role")
    })

    it("a setlist that fails mid-run is reported as a skip and the run goes on", async () => {
        db.store.setlists.sl2 = { orgId: "crc", name: "Friday" }
        db.store.tracks.other = { setlistId: "sl2", orgId: "crc", type: "song", songId: "s1" }
        maintainSetlist.mockImplementation(async (_db: unknown, _org: string, setlistId: string) => {
            if (setlistId === "sl") throw new MaintenanceError("not-found")
            return 1
        })
        const r = (await applyRecordingTemposTool("lead", { dryRun: false, force: true }, "crc")) as ApplyRecordingTemposResult
        expect(r.applied).toBe(true)
        expect(r.skippedSetlists).toEqual([{ setlistId: "sl", reason: "not-found" }])
        expect(r.written).toEqual({ songs: 1, rows: 1, setlists: 1 })
        expect(db.store.library_index.s1).toMatchObject({ bpm: 96, bpmSource: "recording" })
        expect((db.store.songs.s1.defaults as Record<string, unknown>).bpm).toBe(88)
    })
})
