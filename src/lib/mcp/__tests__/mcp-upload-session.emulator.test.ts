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
        for (const col of ["users", "upload_sessions"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
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
            message: expect.stringContaining("Upload permission"),
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
            message: expect.stringContaining("admin or band leader"),
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
            message: expect.stringContaining("exceeds"),
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
            message: expect.stringContaining("No bytes found"),
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
            message: expect.stringContaining("does not belong to caller"),
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
            message: expect.stringContaining("not found"),
        })
    })
})
