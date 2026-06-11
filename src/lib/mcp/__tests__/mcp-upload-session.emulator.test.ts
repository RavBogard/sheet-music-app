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

vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

// Storage interactions are mocked — the signed-URL ceremony needs real
// service-account credentials, which the emulator doesn't simulate.
// We assert on the session/Firestore side-effects and on processChartUpload
// being called with the staged bytes.
const mockGetSignedUrl = vi.fn()
const mockStagedExists = vi.fn()
const mockStagedDownload = vi.fn()
const mockStagedDelete = vi.fn().mockResolvedValue(undefined)
// v11.3-02-02: path-keyed in-memory Storage so the chunked flow's real
// save→exists→download→delete round-trips faithfully (begin/append/commit write
// distinct chunk objects + a reassembled `raw`). Paths that were never .save()d
// fall back to the legacy queued mocks — the signed-URL + heal tests below queue
// exists/download instead of saving, so they stay unchanged.
const stagedStore = new Map<string, Buffer>()
const mockStagedFile = vi.fn((path: string) => ({
    getSignedUrl: mockGetSignedUrl,
    save: async (data: Buffer) => {
        stagedStore.set(path, Buffer.from(data))
    },
    exists: async () =>
        stagedStore.has(path) ? [true] : await mockStagedExists(),
    download: async () =>
        stagedStore.has(path)
            ? [stagedStore.get(path)]
            : await mockStagedDownload(),
    delete: async () => {
        stagedStore.delete(path)
        return mockStagedDelete()
    },
}))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({ bucket: () => ({ file: mockStagedFile }) }),
}))

// processChartUpload is the canonical pipeline — we don't re-test its
// behavior here, just confirm finalize wires the staged bytes into it.
const mockProcessChartUpload = vi.fn()
vi.mock("@/lib/library-upload", async () => {
    const actual = await vi.importActual<
        typeof import("@/lib/library-upload")
    >("@/lib/library-upload")
    return {
        ...actual,
        processChartUpload: (...args: unknown[]) =>
            mockProcessChartUpload(...args),
    }
})

// HEAL mode (targetFileId) writes through @/lib/chart-heal → @/lib/firebase-storage.
// Mock the Storage seam (same posture as the salvage test) so the heal path runs
// against the emulator Firestore but a fake Storage.
const healStorage = {
    uploaded: new Map<string, { bytes: number; mime: string }>(),
    deletedPaths: [] as string[],
}
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: vi.fn(async (fileId: string, buffer: Buffer, mime: string) => {
        healStorage.uploaded.set(fileId, { bytes: buffer.byteLength, mime })
        return `gs://mock/library/${fileId}`
    }),
    getStorageObjectSize: vi.fn(async (path: string) => {
        const fileId = path.replace(/^library\//, "").replace(/\.[a-z0-9]+$/, "")
        return healStorage.uploaded.get(fileId)?.bytes ?? null
    }),
    deleteStorageObjectAtPath: vi.fn(async (path: string) => {
        healStorage.deletedPaths.push(path)
        const fileId = path.replace(/^library\//, "").replace(/\.[a-z0-9]+$/, "")
        healStorage.uploaded.delete(fileId)
    }),
    fileExistsInStorage: vi.fn(async () => ({ success: true as const, data: false })),
    downloadFromStorage: vi.fn(),
    getStorageUrl: vi.fn(),
    getRecordingStoragePath: vi.fn(),
    uploadRecordingToStorage: vi.fn(),
    downloadFromStoragePath: vi.fn(),
}))

import {
    requestChartUploadUrl,
    finalizeChartUpload,
    beginChunkedChartUpload,
    appendChartUploadChunk,
    commitChunkedChartUpload,
} from "../tools/library-upload-session"
import { bareStem, titleSpecificity } from "@/lib/mcp/title-specificity"
import {
    onLibraryRowCreated,
    __resetLibraryEventHandlersForTesting,
    type LibraryRowCreatedEvent,
} from "@/lib/library/library-events"

describe("MCP chunked-upload session tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const MUSICIAN = "alex-musician"
    const NONUPLOADER = "guest-member"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-upload-session" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["users", "upload_sessions", "library_index", "songs", "tracks"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        healStorage.uploaded.clear()
        healStorage.deletedPaths.length = 0
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", email: "daniel@example.com" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ role: "musician", email: "alex@example.com" })
        await db().collection("users").doc(NONUPLOADER).set({ role: "member" })
        mockGetSignedUrl.mockReset()
        mockStagedExists.mockReset()
        mockStagedDownload.mockReset()
        mockStagedDelete.mockClear()
        mockProcessChartUpload.mockReset()
        stagedStore.clear()
        __resetLibraryEventHandlersForTesting()
    })

    it("request_chart_upload_url issues a session + signed PUT URL for an authorized uploader", async () => {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/put-1"])

        const r = await requestChartUploadUrl(ADMIN, {
            title: "Shalom Rav",
            mimeType: "application/pdf",
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return

        expect(r.uploadSessionId).toMatch(/^usess-/)
        expect(r.uploadUrl).toBe("https://signed.example/put-1")
        expect(r.method).toBe("PUT")
        expect(r.requiredHeaders["Content-Type"]).toBe("application/pdf")

        const session = (
            await db().collection("upload_sessions").doc(r.uploadSessionId).get()
        ).data()!
        expect(session.ownerUid).toBe(ADMIN)
        expect(session.title).toBe("Shalom Rav")
        expect(session.status).toBe("awaiting-upload")
        expect(session.stagedPath).toBe(
            `upload-sessions/${r.uploadSessionId}/raw`,
        )

        // Signed-url options forwarded — version v4, write, mime, 10-min expiry.
        const opts = mockGetSignedUrl.mock.calls[0][0] as {
            action: string
            version: string
            contentType: string
            expires: number
        }
        expect(opts.action).toBe("write")
        expect(opts.version).toBe("v4")
        expect(opts.contentType).toBe("application/pdf")
        expect(opts.expires).toBeGreaterThan(Date.now())
        expect(opts.expires).toBeLessThanOrEqual(Date.now() + 11 * 60 * 1000)
    })

    it("denies request_chart_upload_url for a member-only role", async () => {
        const r = await requestChartUploadUrl(NONUPLOADER, {
            title: "Sneaky",
            mimeType: "application/pdf",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("Upload permission") },
        })
    })

    it("enforces curated-catalog gate on request_chart_upload_url (musician → uploads only)", async () => {
        const r = await requestChartUploadUrl(MUSICIAN, {
            title: "Locked Out",
            mimeType: "application/pdf",
            collection: "core",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("admin or band leader") },
        })
    })

    it("rejects sizeBytes above the 25 MB cap at request time", async () => {
        const r = await requestChartUploadUrl(ADMIN, {
            title: "Too Big",
            mimeType: "application/pdf",
            sizeBytes: 30 * 1024 * 1024,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("exceeds") },
        })
    })

    it("finalize_chart_upload reads staged bytes and pipes them into processChartUpload", async () => {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/put-2"])
        const init = await requestChartUploadUrl(ADMIN, {
            title: "Hashkivenu (Klepper-Freelander)",
            mimeType: "application/pdf",
            collection: "supplemental",
        })
        if (!("ok" in init) || !init.ok) throw new Error("init failed")

        const staged = Buffer.from("%PDF-1.4 staged bytes here")
        mockStagedExists.mockResolvedValueOnce([true])
        mockStagedDownload.mockResolvedValueOnce([staged])
        mockProcessChartUpload.mockResolvedValueOnce({
            ok: true,
            fileId: "upload-new-1",
            title: "Hashkivenu (Klepper-Freelander)",
            collection: "supplemental",
            mimeType: "application/pdf",
            storageUrl: "gs://example/library/upload-new-1.pdf",
        })

        const r = await finalizeChartUpload(ADMIN, {
            uploadSessionId: init.uploadSessionId,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return
        expect(r.fileId).toBe("upload-new-1")
        expect(r.sizeBytes).toBe(staged.byteLength)

        // processChartUpload received the staged buffer + session metadata.
        expect(mockProcessChartUpload).toHaveBeenCalledTimes(1)
        const call = mockProcessChartUpload.mock.calls[0][0] as {
            buffer: Buffer
            mimeType: string
            title: string
            collection: string
            uploaderUid: string
        }
        expect(call.buffer.equals(staged)).toBe(true)
        expect(call.mimeType).toBe("application/pdf")
        expect(call.title).toBe("Hashkivenu (Klepper-Freelander)")
        expect(call.collection).toBe("supplemental")
        expect(call.uploaderUid).toBe(ADMIN)

        // Staged blob deleted after success.
        expect(mockStagedDelete).toHaveBeenCalledTimes(1)

        // Session marked finalized.
        const session = (
            await db()
                .collection("upload_sessions")
                .doc(init.uploadSessionId)
                .get()
        ).data()!
        expect(session.status).toBe("finalized")
        expect(session.resultFileId).toBe("upload-new-1")
    })

    it("finalize refuses if no bytes were staged at the path", async () => {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/put-3"])
        const init = await requestChartUploadUrl(ADMIN, {
            title: "No Bytes",
            mimeType: "application/pdf",
        })
        if (!("ok" in init) || !init.ok) throw new Error("init failed")

        mockStagedExists.mockResolvedValueOnce([false])

        const r = await finalizeChartUpload(ADMIN, {
            uploadSessionId: init.uploadSessionId,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("No bytes found") },
        })
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
    })

    it("finalize rejects cross-session caller", async () => {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/put-4"])
        const init = await requestChartUploadUrl(ADMIN, {
            title: "Mine",
            mimeType: "application/pdf",
        })
        if (!("ok" in init) || !init.ok) throw new Error("init failed")

        const r = await finalizeChartUpload(MUSICIAN, {
            uploadSessionId: init.uploadSessionId,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("does not belong to caller") },
        })
    })

    it("finalize threads force: true through to processChartUpload (H-3 override)", async () => {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/put-5"])
        const init = await requestChartUploadUrl(ADMIN, {
            title: "Hashkivenu (Friedman)",
            mimeType: "application/pdf",
        })
        if (!("ok" in init) || !init.ok) throw new Error("init failed")

        mockStagedExists.mockResolvedValueOnce([true])
        mockStagedDownload.mockResolvedValueOnce([Buffer.from("%PDF")])
        mockProcessChartUpload.mockResolvedValueOnce({
            ok: true,
            fileId: "upload-forced-1",
            title: "Hashkivenu (Friedman)",
            collection: "uploads",
            mimeType: "application/pdf",
            storageUrl: "x",
        })

        await finalizeChartUpload(ADMIN, {
            uploadSessionId: init.uploadSessionId,
            force: true,
        })
        const call = mockProcessChartUpload.mock.calls[0][0] as {
            force?: boolean
        }
        expect(call.force).toBe(true)
    })

    it("finalize refuses on a missing session id", async () => {
        const r = await finalizeChartUpload(ADMIN, {
            uploadSessionId: "usess-nonexistent",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("not found") },
        })
    })

    // ─── HEAL mode (targetFileId) — storage-recovery Lane B ──────────────────

    async function stageSession(uid: string, mimeType = "application/pdf") {
        mockGetSignedUrl.mockResolvedValueOnce(["https://signed.example/heal"])
        // collection omitted → defaults to 'uploads' (no curated-catalog gate),
        // so a musician can open a session; heal ignores session.collection and
        // uses the target row's collection.
        const init = await requestChartUploadUrl(uid, {
            title: "Adon Olam (Folk)",
            mimeType,
        })
        if (!("ok" in init) || !init.ok) throw new Error("init failed")
        return init.uploadSessionId
    }

    it("heal mode writes staged bytes onto an EXISTING orphan, preserving the bond", async () => {
        const ORPHAN = "upload-orphan-heal-1"
        // Seed the orphaned row + its songs mirror + a setlist track bonded to it.
        await db().collection("library_index").doc(ORPHAN).set({
            name: "Adon Olam (Folk).pdf",
            status: "orphaned",
            source: "local_upload",
            orphanedReason: "B-006",
            collection: "supplemental",
            key: "G",
            bpm: 96,
        })
        await db().collection("songs").doc(ORPHAN).set({ status: "orphaned" })
        await db().collection("tracks").doc("track-1").set({
            setlistId: "setlist-1",
            fileId: ORPHAN,
            title: "Adon Olam",
        })

        const sessionId = await stageSession(ADMIN)
        const staged = Buffer.from("%PDF-1.4 healed adon olam bytes")
        mockStagedExists.mockResolvedValueOnce([true])
        mockStagedDownload.mockResolvedValueOnce([staged])

        // Capture the library.row.created emit (re-arms AI enrichment on heal).
        const healEvents: LibraryRowCreatedEvent[] = []
        onLibraryRowCreated((e) => {
            healEvents.push(e)
        })

        const r = await finalizeChartUpload(ADMIN, {
            uploadSessionId: sessionId,
            targetFileId: ORPHAN,
        })
        expect("ok" in r && r.ok).toBe(true)
        if (!("ok" in r) || !r.ok) return
        expect(r.fileId).toBe(ORPHAN)
        expect(r.healed).toBe(true)
        expect(r.sizeBytes).toBe(staged.byteLength)

        // processChartUpload NOT used in heal mode (no new fileId).
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
        // Bytes landed at the EXISTING fileId.
        expect(healStorage.uploaded.get(ORPHAN)?.bytes).toBe(staged.byteLength)

        // Row healed in place: status active, source salvage, mime+size set,
        // curation fields (key/bpm) preserved, fileId unchanged.
        const row = (await db().collection("library_index").doc(ORPHAN).get()).data()!
        expect(row.status).toBe("active")
        expect(row.source).toBe("salvage")
        expect(row.salvagedFrom).toBe("upload-session")
        expect(row.mimeType).toBe("application/pdf")
        expect(row.fileSize).toBe(staged.byteLength)
        expect(row.key).toBe("G")
        expect(row.bpm).toBe(96)

        // Derived dedup/search fields recomputed from the title + enrichment
        // re-armed (coder-1 §3 delta fix). chart-heal strips the trailing
        // ".pdf" before deriving keys, so they reflect "Adon Olam (Folk)"
        // (→ stem "adon olam", a generic liturgical stem). siblingsInCatalog
        // === 1 (the orphan had no stem at compute time).
        const HEAL_NAME = "Adon Olam (Folk).pdf"
        const CLEAN = "Adon Olam (Folk)"
        expect(row.normalizedName).toBe(
            CLEAN.toLowerCase().replace(/[^a-z0-9]/g, ""),
        )
        expect(row.stem).toBe(bareStem(CLEAN))
        expect(row.titleSpecificity).toBe(titleSpecificity(CLEAN, 1))
        expect(row.enrichmentStatus).toBe("pending")

        // library.row.created emitted with the target row's collection. The
        // event title carries the row's actual name (extension not stripped).
        expect(healEvents).toHaveLength(1)
        expect(healEvents[0].fileId).toBe(ORPHAN)
        expect(healEvents[0].title).toBe(HEAL_NAME)
        expect(healEvents[0].collection).toBe("supplemental")
        expect(healEvents[0].contentHash).toMatch(/^[0-9a-f]{64}$/)

        // songs mirror flipped; bonded track untouched (bond preserved).
        const song = (await db().collection("songs").doc(ORPHAN).get()).data()!
        expect(song.status).toBe("active")
        const track = (await db().collection("tracks").doc("track-1").get()).data()!
        expect(track.fileId).toBe(ORPHAN)

        // Session finalized against the target; staged blob deleted.
        const session = (await db().collection("upload_sessions").doc(sessionId).get()).data()!
        expect(session.status).toBe("finalized")
        expect(session.resultFileId).toBe(ORPHAN)
        expect(session.healedTarget).toBe(true)
        expect(mockStagedDelete).toHaveBeenCalled()
    })

    it("heal mode is admin-only (musician → forbidden_role)", async () => {
        const ORPHAN = "upload-orphan-heal-2"
        await db().collection("library_index").doc(ORPHAN).set({
            name: "Locked.pdf",
            status: "orphaned",
        })
        // musician CAN open a session, but heal is admin-only.
        const sessionId = await stageSession(MUSICIAN)
        mockStagedExists.mockResolvedValueOnce([true])
        mockStagedDownload.mockResolvedValueOnce([Buffer.from("%PDF")])

        const r = await finalizeChartUpload(MUSICIAN, {
            uploadSessionId: sessionId,
            targetFileId: ORPHAN,
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("admin-only") },
        })
        // No write happened — row stays orphaned.
        const row = (await db().collection("library_index").doc(ORPHAN).get()).data()!
        expect(row.status).toBe("orphaned")
        expect(healStorage.uploaded.has(ORPHAN)).toBe(false)
    })

    it("heal mode refuses when the target row does not exist", async () => {
        const sessionId = await stageSession(ADMIN)
        mockStagedExists.mockResolvedValueOnce([true])
        mockStagedDownload.mockResolvedValueOnce([Buffer.from("%PDF")])

        const r = await finalizeChartUpload(ADMIN, {
            uploadSessionId: sessionId,
            targetFileId: "upload-does-not-exist",
        })
        expect(r).toMatchObject({
            ok: false,
            error: { message: expect.stringContaining("does not exist") },
        })
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
    })

    // ─── chunked inline upload (begin/append/commit) ─────────────────────────
    // v11.3-02-02 — BUG-cowork-chart-upload-2026-06-10 (David's report): the
    // inline-through-tool-args path for environments where the signed-URL PUT is
    // blocked (Cowork sandbox egress proxy) and inline base64 exceeds the token cap.
    describe("chunked inline upload (begin/append/commit)", () => {
        const b64 = (s: string) => Buffer.from(s).toString("base64")

        it("AC-1: begin → append N chunks → commit reassembles in order and pipes to processChartUpload", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "Chunked Chart",
                mimeType: "application/pdf",
            })
            expect("ok" in begin && begin.ok).toBe(true)
            if (!("ok" in begin) || !begin.ok) return
            const sid = begin.uploadSessionId
            expect(begin.status).toBe("awaiting-chunks")

            const parts = ["%PDF-1.4 part-zero ", "middle-part ", "tail-part-END"]
            for (let i = 0; i < parts.length; i++) {
                const a = await appendChartUploadChunk(ADMIN, {
                    uploadSessionId: sid,
                    chunkIndex: i,
                    dataBase64: b64(parts[i]),
                })
                expect("ok" in a && a.ok).toBe(true)
                if ("ok" in a && a.ok) expect(a.receivedChunks).toBe(i + 1)
            }
            const original = Buffer.concat(parts.map((p) => Buffer.from(p)))

            mockProcessChartUpload.mockResolvedValueOnce({
                ok: true,
                fileId: "upload-chunked-1",
                title: "Chunked Chart",
                collection: "uploads",
                mimeType: "application/pdf",
                storageUrl: "gs://x/library/upload-chunked-1.pdf",
            })

            const commit = await commitChunkedChartUpload(ADMIN, {
                uploadSessionId: sid,
            })
            expect("ok" in commit && commit.ok).toBe(true)
            if (!("ok" in commit) || !commit.ok) return
            expect(commit.fileId).toBe("upload-chunked-1")

            // The reassembled bytes (in index order) reached processChartUpload.
            expect(mockProcessChartUpload).toHaveBeenCalledTimes(1)
            const call = mockProcessChartUpload.mock.calls[0][0] as {
                buffer: Buffer
                mimeType: string
            }
            expect(call.buffer.equals(original)).toBe(true)
            expect(call.mimeType).toBe("application/pdf")

            const session = (
                await db().collection("upload_sessions").doc(sid).get()
            ).data()!
            expect(session.status).toBe("finalized")
        })

        it("AC-2: commit org-stamps the new chart row with the caller's resolved org", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "BL Chunked Chart",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin) || !begin.ok) throw new Error("begin failed")
            await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 0,
                dataBase64: b64("%PDF-1.4 broslaz bytes"),
            })

            // Seed the row processChartUpload "would" have written, so stampOrg
            // (which only updates existing docs) has something to stamp.
            await db()
                .collection("library_index")
                .doc("upload-bl-1")
                .set({ name: "BL Chunked Chart", status: "active" })
            await db().collection("songs").doc("upload-bl-1").set({ status: "active" })
            mockProcessChartUpload.mockResolvedValueOnce({
                ok: true,
                fileId: "upload-bl-1",
                title: "BL Chunked Chart",
                collection: "uploads",
                mimeType: "application/pdf",
                storageUrl: "gs://x/library/upload-bl-1.pdf",
            })

            const commit = await commitChunkedChartUpload(
                ADMIN,
                { uploadSessionId: begin.uploadSessionId },
                "brotherslazaroff",
            )
            expect("ok" in commit && commit.ok).toBe(true)

            const row = (
                await db().collection("library_index").doc("upload-bl-1").get()
            ).data()!
            expect(row.orgId).toBe("brotherslazaroff")
            const song = (
                await db().collection("songs").doc("upload-bl-1").get()
            ).data()!
            expect(song.orgId).toBe("brotherslazaroff")
        })

        it("AC-3a: append by a non-owner is rejected (upload_session_owner_mismatch)", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "Owned",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin) || !begin.ok) throw new Error("begin failed")
            const r = await appendChartUploadChunk(MUSICIAN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 0,
                dataBase64: b64("x"),
            })
            expect(r).toMatchObject({
                ok: false,
                error: { message: expect.stringContaining("does not belong to caller") },
            })
        })

        it("AC-3b: commit with a gap in chunk indices → missing_chunk, no upload", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "Gappy",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin) || !begin.ok) throw new Error("begin failed")
            await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 0,
                dataBase64: b64("zero"),
            })
            // Skip index 1; append index 2 → gap at 1.
            await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 2,
                dataBase64: b64("two"),
            })
            const r = await commitChunkedChartUpload(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
            })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "missing_chunk" },
                missingIndex: 1,
            })
            expect(mockProcessChartUpload).not.toHaveBeenCalled()
        })

        it("AC-3c: a non-base64 chunk is rejected (invalid_base64)", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "Bad b64",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin) || !begin.ok) throw new Error("begin failed")
            const r = await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 0,
                dataBase64: "!!! not base64 !!!",
            })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "invalid_base64" },
            })
        })

        it("AC-3d: cumulative size over the 25 MB cap is rejected (size_exceeds_cap)", async () => {
            const begin = await beginChunkedChartUpload(ADMIN, {
                title: "Too Big Cumulative",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin) || !begin.ok) throw new Error("begin failed")
            // Seed the session's per-index byte map to just under the cap, then a
            // small append should push cumulative over — exercises the cumulative
            // guard without 100 real 256 KB appends.
            await db()
                .collection("upload_sessions")
                .doc(begin.uploadSessionId)
                .update({
                    chunkBytes: { "0": 25 * 1024 * 1024 - 10 },
                    receivedBytes: 25 * 1024 * 1024 - 10,
                })
            const r = await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin.uploadSessionId,
                chunkIndex: 1,
                dataBase64: b64("this small chunk pushes it over the cap"),
            })
            expect(r).toMatchObject({
                ok: false,
                error: { machine_code: "size_exceeds_cap" },
            })
        })

        it("AC-4 auth: a member-only (non-uploader) role cannot begin a chunked upload", async () => {
            const r = await beginChunkedChartUpload(NONUPLOADER, {
                title: "Sneaky",
                mimeType: "application/pdf",
            })
            expect(r).toMatchObject({
                ok: false,
                error: { message: expect.stringContaining("Upload permission") },
            })
        })

        it("AC-4 dedup: commit surfaces duplicate_detected_in_library (409); force bypasses", async () => {
            // First commit: processChartUpload reports an exact dedup hit.
            const begin1 = await beginChunkedChartUpload(ADMIN, {
                title: "Mi Chamocha",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin1) || !begin1.ok) throw new Error("begin failed")
            await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin1.uploadSessionId,
                chunkIndex: 0,
                dataBase64: b64("%PDF dup"),
            })
            mockProcessChartUpload.mockResolvedValueOnce({
                ok: false,
                code: "duplicate_exact",
                status: 409,
                error: "A chart named 'Mi Chamocha' already exists.",
            })
            const dup = await commitChunkedChartUpload(ADMIN, {
                uploadSessionId: begin1.uploadSessionId,
            })
            expect(dup).toMatchObject({
                ok: false,
                error: { machine_code: "duplicate_detected_in_library", code: 409 },
                matchKind: "exact",
            })

            // Second commit with force:true → processChartUpload succeeds.
            const begin2 = await beginChunkedChartUpload(ADMIN, {
                title: "Mi Chamocha",
                mimeType: "application/pdf",
            })
            if (!("ok" in begin2) || !begin2.ok) throw new Error("begin failed")
            await appendChartUploadChunk(ADMIN, {
                uploadSessionId: begin2.uploadSessionId,
                chunkIndex: 0,
                dataBase64: b64("%PDF dup forced"),
            })
            mockProcessChartUpload.mockResolvedValueOnce({
                ok: true,
                fileId: "upload-forced-chunked",
                title: "Mi Chamocha",
                collection: "uploads",
                mimeType: "application/pdf",
                storageUrl: "x",
            })
            const forced = await commitChunkedChartUpload(ADMIN, {
                uploadSessionId: begin2.uploadSessionId,
                force: true,
            })
            expect("ok" in forced && forced.ok).toBe(true)
            const call = mockProcessChartUpload.mock.calls.at(-1)![0] as {
                force?: boolean
            }
            expect(call.force).toBe(true)
        })
    })
})
