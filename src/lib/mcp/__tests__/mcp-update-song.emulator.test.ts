import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Storage stub — save_scraped_chart runs through processChartUpload's
// atomic-guard (upload → read-verify by size). Mirror the path computation
// the real getStoragePath uses (text/plain → no extension).
const storageState = new Map<string, number>()
function pathFor(fileId: string, mime: string): string {
    const ext = mime.includes("pdf")
        ? ".pdf"
        : mime.includes("xml")
            ? ".xml"
            : mime.includes("audio")
                ? ".mp3"
                : ""
    return `library/${fileId}${ext}`
}
const mockUploadToStorage = vi.fn(
    async (fileId: string, buffer: Buffer, mime: string) => {
        storageState.set(pathFor(fileId, mime), buffer.byteLength)
        return `gs://test/${pathFor(fileId, mime)}`
    },
)
const mockGetStorageObjectSize = vi.fn(async (path: string) =>
    storageState.has(path) ? storageState.get(path)! : null,
)
const mockDeleteStorageObjectAtPath = vi.fn(async (path: string) => {
    storageState.delete(path)
})
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: (...args: unknown[]) =>
        mockUploadToStorage(...(args as [string, Buffer, string])),
    getStorageObjectSize: (...args: unknown[]) =>
        mockGetStorageObjectSize(...(args as [string])),
    deleteStorageObjectAtPath: (...args: unknown[]) =>
        mockDeleteStorageObjectAtPath(...(args as [string])),
}))

// Bypass per-user rate limiting — module-global state across many writes.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

import { updateSong, applySongMetadata } from "../tools/song-metadata"
import { saveScrapedChart } from "../tools/library-upload"
import { getSong, listLibrary } from "../tools/library"
import type { RichErrorEnvelope } from "@/lib/mcp/error-envelopes"

/**
 * Cowork #3 (save_scraped_chart key/bpm/leadMusician parity) + #5 (update_song)
 * + #9 (list_library enrichmentCoverage) against the Firebase emulator.
 *
 * Real Firestore; mocked Storage + rate-limit. Asserts metadata lands on BOTH
 * catalog surfaces (songs/{id}.defaults + library_index/{id}) so a fix sticks
 * across get_song / search_library / list_library and bond resolution.
 */
describe("MCP update_song + save_scraped_chart parity + enrichment coverage (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "randy-leader"
    const MUSICIAN = "alex-musician"
    const PENDING_NO_FLAG = "guest-pending"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-mcp-update-song" })

        await db().collection("users").doc(ADMIN).set({ role: "admin", email: "daniel@crc.org" })
        await db().collection("users").doc(LEADER).set({ role: "band_leader", email: "randy@x.com" })
        await db().collection("users").doc(MUSICIAN).set({ role: "musician", email: "alex@x.com" })
        await db().collection("users").doc(PENDING_NO_FLAG).set({ role: "pending", email: "guest@x.com" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        storageState.clear()
        mockUploadToStorage.mockClear()
        mockGetStorageObjectSize.mockClear()
        mockDeleteStorageObjectAtPath.mockClear()
        for (const col of ["library_index", "songs", "library_signals"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    async function seedChart(
        fileId: string,
        extra: Record<string, unknown> = {},
        songExtra: Record<string, unknown> = {},
    ) {
        await db().collection("library_index").doc(fileId).set({
            name: `Chart ${fileId}`,
            nameLower: `chart ${fileId}`.toLowerCase(),
            mimeType: "application/pdf",
            collection: "uploads",
            status: "active",
            uploadedAt: "2026-05-20T00:00:00.000Z",
            uploadedBy: ADMIN,
            ...extra,
        })
        await db()
            .collection("songs")
            .doc(fileId)
            .set({ title: `Chart ${fileId}`, status: "active", ...songExtra })
    }

    // ─── update_song (#5) ────────────────────────────────────────────────────

    it("admin sets key + bpm — writes BOTH library_index and songs.defaults", async () => {
        await seedChart("upload-aaa")
        const res = (await updateSong(ADMIN, {
            id: "upload-aaa",
            key: "Em",
            bpm: 96,
        })) as { ok: true; fieldsChanged: string[]; songWritten: boolean; indexWritten: boolean; after: { key: string | null; bpm: number | null } }

        expect(res.ok).toBe(true)
        expect(res.fieldsChanged.sort()).toEqual(["bpm", "key"])
        expect(res.songWritten).toBe(true)
        expect(res.indexWritten).toBe(true)
        expect(res.after).toMatchObject({ key: "Em", bpm: 96 })

        const idx = (await db().collection("library_index").doc("upload-aaa").get()).data()!
        expect(idx.key).toBe("Em")
        expect(idx.bpm).toBe(96)

        const song = (await db().collection("songs").doc("upload-aaa").get()).data()!
        expect(song.defaults).toMatchObject({ key: "Em", bpm: 96 })

        // get_song reads songs.defaults → reflects the fix (the bonded-row path).
        const got = await getSong(ADMIN, { id: "upload-aaa" })
        expect(got?.key).toBe("Em")
        expect(got?.bpm).toBe(96)
    })

    it("a musician (not just admin/band_leader) may fix a key", async () => {
        await seedChart("upload-mus")
        const res = (await updateSong(MUSICIAN, { id: "upload-mus", key: "A" })) as { ok: true }
        expect(res.ok).toBe(true)
        const song = (await db().collection("songs").doc("upload-mus").get()).data()!
        expect(song.defaults.key).toBe("A")
    })

    it("a band_leader may fix bpm", async () => {
        await seedChart("upload-bl")
        const res = (await updateSong(LEADER, { id: "upload-bl", bpm: 72 })) as { ok: true }
        expect(res.ok).toBe(true)
        const idx = (await db().collection("library_index").doc("upload-bl").get()).data()!
        expect(idx.bpm).toBe(72)
    })

    it("a pending user without canUpload is forbidden", async () => {
        await seedChart("upload-deny")
        const res = (await updateSong(PENDING_NO_FLAG, {
            id: "upload-deny",
            key: "C",
        })) as RichErrorEnvelope
        expect(res.ok).toBe(false)
        expect(res.error.machine_code).toBe("forbidden_role")
    })

    it("unknown id → song_not_found", async () => {
        const res = (await updateSong(ADMIN, { id: "upload-nope", key: "C" })) as RichErrorEnvelope
        expect(res.ok).toBe(false)
        expect(res.error.machine_code).toBe("song_not_found")
    })

    it("rejects a call with no key and no bpm", async () => {
        await seedChart("upload-empty")
        const res = (await updateSong(ADMIN, { id: "upload-empty" })) as RichErrorEnvelope
        expect(res.ok).toBe(false)
        expect(res.error.machine_code).toBe("invalid_argument")
    })

    it("rejects a non-positive bpm", async () => {
        await seedChart("upload-badbpm")
        const res = (await updateSong(ADMIN, { id: "upload-badbpm", bpm: 0 })) as RichErrorEnvelope
        expect(res.ok).toBe(false)
        expect(res.error.machine_code).toBe("invalid_field")
    })

    it("dryRun returns the before/after plan WITHOUT writing", async () => {
        await seedChart("upload-dry", { key: "G" }, { defaults: { key: "G" } })
        const res = (await updateSong(ADMIN, {
            id: "upload-dry",
            key: "D",
            dryRun: true,
        })) as { ok: true; dryRun: boolean; before: { key: string | null }; after: { key: string | null } }
        expect(res.ok).toBe(true)
        expect(res.dryRun).toBe(true)
        expect(res.before.key).toBe("G")
        expect(res.after.key).toBe("D")
        // No write happened.
        const idx = (await db().collection("library_index").doc("upload-dry").get()).data()!
        expect(idx.key).toBe("G")
    })

    it("is idempotent — re-applying the same value succeeds", async () => {
        await seedChart("upload-idem")
        await updateSong(ADMIN, { id: "upload-idem", key: "Bb" })
        const res = (await updateSong(ADMIN, { id: "upload-idem", key: "Bb" })) as { ok: true }
        expect(res.ok).toBe(true)
        const idx = (await db().collection("library_index").doc("upload-idem").get()).data()!
        expect(idx.key).toBe("Bb")
    })

    // ─── applySongMetadata (shared helper) ───────────────────────────────────

    it("applySongMetadata writes leadMusician to library_index AND songs.defaults.lead", async () => {
        await seedChart("upload-lead")
        const r = await applySongMetadata(db(), "upload-lead", {
            leadMusician: "Cantor Sarah",
        })
        expect(r.existed).toBe(true)
        expect(r.fieldsChanged).toEqual(["leadMusician"])
        const idx = (await db().collection("library_index").doc("upload-lead").get()).data()!
        expect(idx.leadMusician).toBe("Cantor Sarah")
        const song = (await db().collection("songs").doc("upload-lead").get()).data()!
        expect(song.defaults.lead).toBe("Cantor Sarah")
    })

    // ─── save_scraped_chart parity (#3) ──────────────────────────────────────

    it("save_scraped_chart persists key/bpm/leadMusician to both surfaces", async () => {
        const res = (await saveScrapedChart(ADMIN, {
            title: "Walkdown Chart",
            content: "C   G   Am   F\nlyrics here",
            key: "Em",
            bpm: 84,
            leadMusician: "David",
        })) as { ok: true; fileId: string }
        expect(res.ok).toBe(true)

        const idx = (await db().collection("library_index").doc(res.fileId).get()).data()!
        expect(idx.key).toBe("Em")
        expect(idx.bpm).toBe(84)
        expect(idx.leadMusician).toBe("David")

        const song = (await db().collection("songs").doc(res.fileId).get()).data()!
        expect(song.defaults).toMatchObject({ key: "Em", bpm: 84, lead: "David" })

        // get_song (songs.defaults path used by bonds) reflects the metadata.
        const got = await getSong(ADMIN, { id: res.fileId })
        expect(got?.key).toBe("Em")
        expect(got?.bpm).toBe(84)
        expect(got?.lead).toBe("David")
    })

    it("save_scraped_chart with no metadata still works (omitted fields untouched)", async () => {
        const res = (await saveScrapedChart(ADMIN, {
            title: "Bare Chart",
            content: "G  D  Em  C",
        })) as { ok: true; fileId: string }
        expect(res.ok).toBe(true)
        const idx = (await db().collection("library_index").doc(res.fileId).get()).data()!
        expect(idx.key).toBeUndefined()
        expect(idx.bpm).toBeUndefined()
    })

    // ─── list_library enrichment coverage (#9) ───────────────────────────────

    it("list_library surfaces enrichmentCoverage + pendingEnrichmentCount", async () => {
        await seedChart("upload-c1", { enrichmentStatus: "pending" })
        await seedChart("upload-c2", { enrichmentStatus: "review_pending" })
        await seedChart("upload-c3", {
            enrichmentStatus: "enriched",
            enrichmentRanAt: "2026-05-22T18:00:00.000Z",
        })
        await seedChart("upload-c4", { enrichmentStatus: "failed" })
        await seedChart("upload-c5") // no enrichmentStatus → unenriched
        await seedChart("upload-c6", { enrichmentStatus: "human_curated" })

        const res = (await listLibrary(ADMIN, {})) as Awaited<
            ReturnType<typeof listLibrary>
        > & { enrichmentCoverage: { byStatus: Record<string, number>; pendingEnrichmentCount: number } }

        expect("enrichmentCoverage" in res).toBe(true)
        const cov = res.enrichmentCoverage
        expect(cov.byStatus.pending).toBe(1)
        expect(cov.byStatus.review_pending).toBe(1)
        expect(cov.byStatus.enriched).toBe(1)
        expect(cov.byStatus.failed).toBe(1)
        expect(cov.byStatus.unenriched).toBe(1)
        expect(cov.byStatus.human_curated).toBe(1)
        // pending + review_pending + failed + unenriched = 4 (enriched + human_curated excluded)
        expect(cov.pendingEnrichmentCount).toBe(4)
    })

    it("list_library rows carry enrichmentRanAt (age/lag signal)", async () => {
        await seedChart("upload-ran", {
            enrichmentStatus: "enriched",
            enrichmentRanAt: "2026-05-22T18:00:00.000Z",
        })
        const res = (await listLibrary(ADMIN, {})) as {
            rows: Array<{ fileId: string; enrichmentRanAt: string | null }>
        }
        const row = res.rows.find((r) => r.fileId === "upload-ran")
        expect(row?.enrichmentRanAt).toBe("2026-05-22T18:00:00.000Z")
    })
})
