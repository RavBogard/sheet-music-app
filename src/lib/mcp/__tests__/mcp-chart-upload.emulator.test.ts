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

// Storage + Gemini stubs. Real Firestore via the emulator handles dedup,
// library_index + songs writes — the parts most likely to drift. The two
// external dependencies above don't have a local emulator, so we stand them
// in. (Mocks must be declared with vi.mock BEFORE importing the SUT.)
const mockUploadToStorage = vi.fn()
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
}))

const mockGenerateContent = vi.fn()
vi.mock("@/lib/gemini", () => ({
    geminiFlash: () => ({ generateContent: mockGenerateContent }),
    geminiFlashWithSearch: () => ({ generateContent: mockGenerateContent }),
}))

import {
    uploadChart,
    saveScrapedChart,
    scrapeChartFromUrl,
} from "../tools/library-upload"

/**
 * MCP chart-upload tools against the Firebase emulator.
 *
 * Real Firestore. Mocked Storage (uploadToStorage) and Gemini.
 *
 * Covers:
 *  - Upload permission gate (admin / band_leader / musician / canUpload flag /
 *    pending user denied)
 *  - Dedup: exact nameLower match + fuzzy Levenshtein guard
 *  - Collection selection: 'core' | 'supplemental' | 'uploads', default 'uploads',
 *    invalid value rejected
 *  - Successful upload writes library_index + songs and Storage is called once
 *  - Empty / oversize buffer rejection
 *  - saveScrapedChart packages content as .txt and lands in library_index+songs
 *  - scrape_chart_from_url returns Gemini's parsed payload + propagates errors
 */
describe("MCP chart-upload tools (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const LEADER = "randy-leader"
    const MUSICIAN = "alex-musician"
    const PENDING_WITH_FLAG = "uploader-flagged" // pending role + canUpload:true
    const PENDING_NO_FLAG = "guest-pending" // pending role, no flag

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-chart-upload" })

        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", email: "daniel@centralreform.org" })
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ role: "band_leader", email: "randy@example.com" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ role: "musician", email: "alex@example.com" })
        await db()
            .collection("users")
            .doc(PENDING_WITH_FLAG)
            .set({ role: "pending", canUpload: true, email: "flagged@example.com" })
        await db()
            .collection("users")
            .doc(PENDING_NO_FLAG)
            .set({ role: "pending", email: "pending@example.com" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        mockUploadToStorage.mockReset()
        mockUploadToStorage.mockResolvedValue(undefined)
        mockGenerateContent.mockReset()

        for (const col of ["library_index", "songs"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
    })

    function b64(text: string): string {
        return Buffer.from(text, "utf-8").toString("base64")
    }

    // ─── upload_chart ───────────────────────────────────────────────────────

    it("admin uploads a PDF — writes library_index + songs, Storage called once", async () => {
        const result = (await uploadChart(ADMIN, {
            title: "Lecha Dodi",
            fileBase64: b64("%PDF-1.4 fake pdf bytes"),
            mimeType: "application/pdf",
            fileName: "lecha-dodi.pdf",
        })) as { ok: true; fileId: string; title: string; collection: string }

        expect(result.ok).toBe(true)
        expect(result.fileId).toMatch(/^upload-/)
        expect(result.title).toBe("Lecha Dodi")
        expect(result.collection).toBe("uploads")

        const idx = (
            await db().collection("library_index").doc(result.fileId).get()
        ).data()!
        expect(idx).toMatchObject({
            name: "Lecha Dodi",
            nameLower: "lecha dodi",
            mimeType: "application/pdf",
            source: "upload",
            collection: "uploads",
            status: "active",
            uploadedBy: ADMIN,
            uploadedByEmail: "daniel@centralreform.org",
        })

        const song = (
            await db().collection("songs").doc(result.fileId).get()
        ).data()!
        expect(song).toMatchObject({
            title: "Lecha Dodi",
            normalizedTitle: "lecha dodi",
            status: "active",
        })

        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
        expect(mockUploadToStorage).toHaveBeenCalledWith(
            expect.stringMatching(/^upload-/),
            expect.any(Buffer),
            "application/pdf",
        )
    })

    it("respects the collection arg and defaults to 'uploads'", async () => {
        const core = (await uploadChart(ADMIN, {
            title: "Adon Olam (Core)",
            fileBase64: b64("%PDF-1.4 a"),
            mimeType: "application/pdf",
            collection: "core",
        })) as { ok: true; fileId: string; collection: string }
        expect(core.collection).toBe("core")

        const supplemental = (await uploadChart(ADMIN, {
            title: "Shireinu Song",
            fileBase64: b64("%PDF-1.4 b"),
            mimeType: "application/pdf",
            collection: "supplemental",
        })) as { ok: true; collection: string }
        expect(supplemental.collection).toBe("supplemental")

        const defaulted = (await uploadChart(ADMIN, {
            title: "User Upload",
            fileBase64: b64("%PDF-1.4 c"),
            mimeType: "application/pdf",
        })) as { ok: true; collection: string }
        expect(defaulted.collection).toBe("uploads")
    })

    it("permission gate: pending user without canUpload denied; with flag allowed", async () => {
        expect(
            await uploadChart(PENDING_NO_FLAG, {
                title: "Should Fail",
                fileBase64: b64("%PDF-1.4"),
                mimeType: "application/pdf",
            }),
        ).toEqual({
            error: expect.stringContaining("Upload permission required"),
        })

        const ok = await uploadChart(PENDING_WITH_FLAG, {
            title: "Flagged Uploader Chart",
            fileBase64: b64("%PDF-1.4 ok"),
            mimeType: "application/pdf",
        })
        expect(ok).toMatchObject({ ok: true })
    })

    it("musician + band_leader roles can upload by default", async () => {
        const r1 = await uploadChart(MUSICIAN, {
            title: "Musician Chart",
            fileBase64: b64("%PDF-1.4 m"),
            mimeType: "application/pdf",
        })
        expect(r1).toMatchObject({ ok: true })
        const r2 = await uploadChart(LEADER, {
            title: "Leader Chart",
            fileBase64: b64("%PDF-1.4 l"),
            mimeType: "application/pdf",
        })
        expect(r2).toMatchObject({ ok: true })
    })

    it("rejects an empty payload and an unsupported mime type", async () => {
        expect(
            await uploadChart(ADMIN, {
                title: "Empty",
                fileBase64: "",
                mimeType: "application/pdf",
            }),
        ).toEqual({ error: "Decoded file is empty" })

        expect(
            await uploadChart(ADMIN, {
                title: "Wrong Type",
                fileBase64: b64("garbage"),
                mimeType: "application/zip",
                fileName: "weird.zip",
            }),
        ).toEqual({
            error: expect.stringContaining("PDF, MusicXML, MuseScore"),
        })

        expect(mockUploadToStorage).not.toHaveBeenCalled()
    })

    it("dedup: exact nameLower match is rejected before Storage write", async () => {
        const first = (await uploadChart(ADMIN, {
            title: "Oseh Shalom",
            fileBase64: b64("%PDF-1.4 first"),
            mimeType: "application/pdf",
        })) as { ok: true }
        expect(first.ok).toBe(true)

        const second = await uploadChart(LEADER, {
            title: "oseh shalom", // case-insensitive nameLower match
            fileBase64: b64("%PDF-1.4 second"),
            mimeType: "application/pdf",
        })
        expect(second).toEqual({
            error: expect.stringContaining("already exists"),
        })

        // Only the first upload reached Storage.
        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
    })

    it("dedup: fuzzy Levenshtein match is rejected", async () => {
        await uploadChart(ADMIN, {
            title: "Hashkiveinu",
            fileBase64: b64("%PDF-1.4"),
            mimeType: "application/pdf",
        })
        // Levenshtein-similar (one-char typo): "Hashkiveynu" vs "Hashkiveinu".
        const sim = await uploadChart(ADMIN, {
            title: "Hashkiveynu",
            fileBase64: b64("%PDF-1.4 b"),
            mimeType: "application/pdf",
        })
        expect(sim).toEqual({
            error: expect.stringContaining("similar name"),
        })
    })

    // ─── save_scraped_chart ─────────────────────────────────────────────────

    it("save_scraped_chart packages content as .txt and lands in library_index+songs", async () => {
        const r = (await saveScrapedChart(MUSICIAN, {
            title: "Carnival",
            content: "[Verse]\nG       D     Em\nCarnival of love",
            artist: "Natalie Merchant",
            collection: "uploads",
        })) as { ok: true; fileId: string; title: string }
        expect(r.ok).toBe(true)

        const idx = (
            await db().collection("library_index").doc(r.fileId).get()
        ).data()!
        expect(idx.mimeType).toBe("text/plain")
        expect(idx.name).toBe("Carnival")
        expect(idx.collection).toBe("uploads")

        const song = (
            await db().collection("songs").doc(r.fileId).get()
        ).data()!
        expect(song.title).toBe("Carnival")
        expect(song.status).toBe("active")

        // Storage got the assembled text payload (title + artist + content).
        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
        const [, buf] = mockUploadToStorage.mock.calls[0]
        expect((buf as Buffer).toString("utf-8")).toContain("Natalie Merchant")
        expect((buf as Buffer).toString("utf-8")).toContain("Carnival of love")
    })

    it("save_scraped_chart requires title + content", async () => {
        expect(
            await saveScrapedChart(ADMIN, {
                title: "",
                content: "x",
            }),
        ).toEqual({ error: "title is required" })
        expect(
            await saveScrapedChart(ADMIN, {
                title: "x",
                content: "",
            }),
        ).toEqual({ error: "content is required" })
    })

    // ─── scrape_chart_from_url ──────────────────────────────────────────────

    it("scrape_chart_from_url returns Gemini's parsed payload (rawText path)", async () => {
        mockGenerateContent.mockResolvedValue({
            response: {
                text: () =>
                    JSON.stringify({
                        title: "Wonderful Tonight",
                        artist: "Eric Clapton",
                        content: "[Intro]\nG D/F# Em7 C\n",
                    }),
            },
        })

        const r = await scrapeChartFromUrl(MUSICIAN, {
            rawText: "<html>fake page with chords</html>",
        })
        expect(r).toEqual({
            ok: true,
            title: "Wonderful Tonight",
            artist: "Eric Clapton",
            content: "[Intro]\nG D/F# Em7 C\n",
        })
    })

    it("scrape_chart_from_url surfaces a Gemini error as a user-facing error", async () => {
        mockGenerateContent.mockRejectedValue(new Error("rate limit exceeded"))
        const r = await scrapeChartFromUrl(MUSICIAN, {
            rawText: "<html>...</html>",
        })
        expect(r).toEqual({
            error: expect.stringContaining("Failed to scrape chart"),
        })
    })

    it("scrape_chart_from_url requires url OR rawText", async () => {
        expect(await scrapeChartFromUrl(ADMIN, {})).toEqual({
            error: "Either url or rawText is required",
        })
    })

    it("scrape_chart_from_url respects the upload permission gate", async () => {
        const r = await scrapeChartFromUrl(PENDING_NO_FLAG, {
            rawText: "<html>x</html>",
        })
        expect(r).toEqual({
            error: expect.stringContaining("Upload permission required"),
        })
        // Gemini should NOT have been called.
        expect(mockGenerateContent).not.toHaveBeenCalled()
    })
})
