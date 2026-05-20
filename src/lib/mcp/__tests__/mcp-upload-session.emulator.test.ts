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
const mockStagedFile = vi.fn(() => ({
    getSignedUrl: mockGetSignedUrl,
    exists: mockStagedExists,
    download: mockStagedDownload,
    delete: mockStagedDelete,
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
} from "../tools/library-upload-session"

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
})
