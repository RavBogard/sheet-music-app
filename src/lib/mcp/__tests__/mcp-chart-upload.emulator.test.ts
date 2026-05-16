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
// In-test Storage state: every `uploadToStorage` write records the (path, size)
// so the atomic-guard's `getStorageObjectSize` read-verify reports the right
// size, and `deleteStorageObjectAtPath` can drop the entry on rollback. Path
// is reconstructed the same way library-upload's `getStoragePath` does — pdf
// → `library/{fileId}.pdf`, text → `library/{fileId}` (no ext for non-
// pdf/xml/audio), etc. Keep this in sync with firebase-storage.ts.
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
        mockUploadToStorage(
            ...(args as [string, Buffer, string]),
        ),
    getStorageObjectSize: (...args: unknown[]) =>
        mockGetStorageObjectSize(...(args as [string])),
    deleteStorageObjectAtPath: (...args: unknown[]) =>
        mockDeleteStorageObjectAtPath(...(args as [string])),
}))

const mockGenerateContent = vi.fn()
vi.mock("@/lib/gemini", () => ({
    geminiFlash: () => ({ generateContent: mockGenerateContent }),
    geminiFlashWithSearch: () => ({ generateContent: mockGenerateContent }),
}))

// Bypass per-user rate limiting in tests — the in-memory limiter is module-
// global state, and ADMIN runs many uploads/deletes in one process which
// would exhaust the 10/min bucket. Production behavior is unchanged.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

// Storage Admin SDK stub — delete_chart calls getStorage().bucket().file(p).delete().
const mockStorageFileDelete = vi.fn().mockResolvedValue(undefined)
const mockStorageBucketFile = vi.fn(() => ({ delete: mockStorageFileDelete }))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({ bucket: () => ({ file: mockStorageBucketFile }) }),
}))

// Google Drive stub — import_chart_from_drive calls
// new DriveClient().getFileMetadata + .getFile. Real Drive requires service-
// account credentials that the test environment doesn't have, so stand in
// the network surface with a controllable mock.
const mockDriveGetFileMetadata = vi.fn()
const mockDriveGetFile = vi.fn()
vi.mock("@/lib/google-drive", () => ({
    DriveClient: class {
        getFileMetadata = mockDriveGetFileMetadata
        getFile = mockDriveGetFile
    },
}))

import {
    uploadChart,
    saveScrapedChart,
    scrapeChartFromUrl,
    deleteChart,
    importChartFromDrive,
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
        // Reset the in-memory Storage state (but keep the mock impl —
        // tests rely on the upload→read-verify round-trip working).
        storageState.clear()
        mockUploadToStorage.mockClear()
        mockGetStorageObjectSize.mockClear()
        mockDeleteStorageObjectAtPath.mockClear()
        mockGenerateContent.mockReset()
        mockStorageFileDelete.mockReset()
        mockStorageFileDelete.mockResolvedValue(undefined)
        mockStorageBucketFile.mockClear()
        mockDriveGetFileMetadata.mockReset()
        mockDriveGetFile.mockReset()

        for (const col of ["library_index", "songs", "tracks", "setlists"]) {
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
            error: expect.stringContaining("Unsupported mimeType"),
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

    it("dedup: fuzzy match fires for emoji-prefixed titles (G-5)", async () => {
        await uploadChart(ADMIN, {
            title: "⚠️ STRESS TEST 2026-05-15 — Adon Olam",
            fileBase64: b64("%PDF-1.4 first"),
            mimeType: "application/pdf",
        })
        // One-char typo on a non-leading word; the original prefix-range query
        // would have skipped this because both titles start with "⚠️".
        const sim = await uploadChart(ADMIN, {
            title: "⚠️ STRESS TEST 2026-05-15 — Adon Olamx",
            fileBase64: b64("%PDF-1.4 second"),
            mimeType: "application/pdf",
        })
        expect(sim).toEqual({
            error: expect.stringContaining("similar name"),
        })

        // A clearly different title under the same prefix passes.
        const ok = await uploadChart(ADMIN, {
            title: "⚠️ STRESS TEST 2026-05-15 — Hinei Ma Tov",
            fileBase64: b64("%PDF-1.4 third"),
            mimeType: "application/pdf",
        })
        expect(ok).toMatchObject({ ok: true })
    })

    it("force: true bypasses exact + fuzzy dedup (H-3 override)", async () => {
        // Daniel call 2026-05-15: keep 0.85 threshold strict, but legitimate
        // variants (key/arrangement/composer suffix) need an explicit escape
        // hatch. Caller passes force: true to commit anyway.
        const first = (await uploadChart(ADMIN, {
            title: "Adon Olam",
            fileBase64: b64("%PDF-1.4 base"),
            mimeType: "application/pdf",
        })) as { ok: true; fileId: string }
        expect(first.ok).toBe(true)

        // Without force: fuzzy similarity > 0.85 → rejected.
        const blocked = await uploadChart(ADMIN, {
            title: "Adon Olamx",
            fileBase64: b64("%PDF-1.4 typo"),
            mimeType: "application/pdf",
        })
        expect(blocked).toEqual({
            error: expect.stringContaining("similar name"),
        })

        // With force: same payload commits anyway.
        const forced = (await uploadChart(ADMIN, {
            title: "Adon Olamx",
            fileBase64: b64("%PDF-1.4 forced"),
            mimeType: "application/pdf",
            force: true,
        })) as { ok: true; fileId: string }
        expect(forced.ok).toBe(true)
        expect(forced.fileId).not.toBe(first.fileId)

        // Exact-match dedup is also overridable — same title, force: true.
        // Caller has decided the duplicate is intentional (e.g. re-upload
        // because the existing one's broken). Error message names force.
        const exactBlocked = await uploadChart(ADMIN, {
            title: "Adon Olam",
            fileBase64: b64("%PDF-1.4 dup"),
            mimeType: "application/pdf",
        })
        expect(exactBlocked).toEqual({
            error: expect.stringContaining("force: true"),
        })
        const exactForced = (await uploadChart(ADMIN, {
            title: "Adon Olam",
            fileBase64: b64("%PDF-1.4 dup-forced"),
            mimeType: "application/pdf",
            force: true,
        })) as { ok: true; fileId: string }
        expect(exactForced.ok).toBe(true)
    })

    it("library_index entries carry normalizedName for prefix range queries (G-5)", async () => {
        const r = (await uploadChart(ADMIN, {
            title: "Lecha Dodi (Take 2)",
            fileBase64: b64("%PDF-1.4 norm"),
            mimeType: "application/pdf",
        })) as { ok: true; fileId: string }
        const idx = (
            await db().collection("library_index").doc(r.fileId).get()
        ).data()!
        expect(idx.normalizedName).toBe("lechadoditake2")
    })

    it("upload_chart rejects octet-stream and any non-allowed mime (G-7)", async () => {
        expect(
            await uploadChart(ADMIN, {
                title: "Bad Mime Probe",
                fileBase64: b64("%PDF-1.4 bytes"),
                mimeType: "application/octet-stream",
                fileName: "probe.pdf",
            }),
        ).toEqual({
            error: expect.stringContaining("application/octet-stream"),
        })

        expect(
            await uploadChart(ADMIN, {
                title: "Zip Probe",
                fileBase64: b64("PK garbage"),
                mimeType: "application/x-zip-compressed",
                fileName: "probe.zip",
            }),
        ).toEqual({
            error: expect.stringContaining("Unsupported mimeType"),
        })

        expect(mockUploadToStorage).not.toHaveBeenCalled()
    })

    it("upload_chart format-validates fileBase64 (G-8)", async () => {
        expect(
            await uploadChart(ADMIN, {
                title: "Garbage",
                fileBase64: "!!!not base64!!!",
                mimeType: "application/pdf",
            }),
        ).toEqual({
            error: expect.stringContaining("RFC 4648"),
        })

        // Non-padded length (not a multiple of 4).
        expect(
            await uploadChart(ADMIN, {
                title: "Bad Length",
                fileBase64: "abc",
                mimeType: "application/pdf",
            }),
        ).toEqual({
            error: expect.stringContaining("multiple of 4"),
        })

        // Whitespace inside is tolerated (newlines/spaces stripped before check).
        const ok = await uploadChart(ADMIN, {
            title: "Good Padding",
            fileBase64:
                "JVBERi0xLjQKJcfsj6IKNSAwIG9iaiAg\nPDwKL0xlbmd0aCAyOTcgL0ZpbHRlciAv\nRmxhdGVEZWNvZGUK",
            mimeType: "application/pdf",
        })
        expect(ok).toMatchObject({ ok: true })

        expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
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

    it("scrape_chart_from_url detects Gemini negative-result patterns (G-6)", async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () =>
                    JSON.stringify({
                        title: "Song Not Found",
                        artist: "",
                        content: "",
                    }),
            },
        })
        const r1 = await scrapeChartFromUrl(MUSICIAN, {
            rawText: "<html>generic 404 page</html>",
        })
        expect(r1).toEqual({
            error: expect.stringContaining("No chord chart detected"),
        })

        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () =>
                    JSON.stringify({
                        title: "Plausible Title",
                        artist: "Unknown",
                        content: "This page does not contain a chord chart.",
                    }),
            },
        })
        const r2 = await scrapeChartFromUrl(MUSICIAN, {
            rawText: "<html>generic page</html>",
        })
        expect(r2).toEqual({
            error: expect.stringContaining("No chord chart detected"),
        })

        // Genuine content still goes through.
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () =>
                    JSON.stringify({
                        title: "Real Song",
                        artist: "Real Artist",
                        content: "G  D  Em\nLine of lyrics",
                    }),
            },
        })
        const r3 = await scrapeChartFromUrl(MUSICIAN, {
            rawText: "<html>...</html>",
        })
        expect(r3).toMatchObject({ ok: true, title: "Real Song" })
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

    // ─── G-3: curated-catalog admin gate ───────────────────────────────────

    describe("curated-catalog gate (G-3)", () => {
        it("admin may write to core and supplemental", async () => {
            const core = await uploadChart(ADMIN, {
                title: "Core Chart",
                fileBase64: b64("%PDF-1.4 c"),
                mimeType: "application/pdf",
                collection: "core",
            })
            expect(core).toMatchObject({ ok: true, collection: "core" })

            const supp = await uploadChart(ADMIN, {
                title: "Supplemental Chart",
                fileBase64: b64("%PDF-1.4 s"),
                mimeType: "application/pdf",
                collection: "supplemental",
            })
            expect(supp).toMatchObject({ ok: true, collection: "supplemental" })
        })

        it("band_leader may also write to core and supplemental (G-3 widened)", async () => {
            const core = await uploadChart(LEADER, {
                title: "Leader Core Chart",
                fileBase64: b64("%PDF-1.4 lc"),
                mimeType: "application/pdf",
                collection: "core",
            })
            expect(core).toMatchObject({ ok: true, collection: "core" })

            const supp = await uploadChart(LEADER, {
                title: "Leader Supplemental Chart",
                fileBase64: b64("%PDF-1.4 ls"),
                mimeType: "application/pdf",
                collection: "supplemental",
            })
            expect(supp).toMatchObject({ ok: true, collection: "supplemental" })
        })

        it("musician (and below) still blocked from core and supplemental", async () => {
            const core = await uploadChart(MUSICIAN, {
                title: "Probe core musician",
                fileBase64: b64("%PDF-1.4 x"),
                mimeType: "application/pdf",
                collection: "core",
            })
            expect(core).toEqual({
                error: expect.stringContaining(
                    "requires an admin or band leader",
                ),
            })

            const supp = await uploadChart(MUSICIAN, {
                title: "Probe supp musician",
                fileBase64: b64("%PDF-1.4 y"),
                mimeType: "application/pdf",
                collection: "supplemental",
            })
            expect(supp).toEqual({
                error: expect.stringContaining(
                    "requires an admin or band leader",
                ),
            })
            // No storage writes attempted on rejected uploads.
            expect(mockUploadToStorage).not.toHaveBeenCalled()
        })

        it("musicians (non-leaders) may still write to uploads (default)", async () => {
            const r = await uploadChart(MUSICIAN, {
                title: "Musician Default Upload",
                fileBase64: b64("%PDF-1.4 d"),
                mimeType: "application/pdf",
            })
            expect(r).toMatchObject({ ok: true, collection: "uploads" })
        })

        it("save_scraped_chart enforces the same widened gate", async () => {
            // Musician blocked on curated.
            const denied = await saveScrapedChart(MUSICIAN, {
                title: "Scraped Core Probe",
                content: "G   D   Em\nlyrics",
                collection: "core",
            })
            expect(denied).toEqual({
                error: expect.stringContaining(
                    "requires an admin or band leader",
                ),
            })

            // band_leader now allowed on curated.
            const leaderOk = await saveScrapedChart(LEADER, {
                title: "Scraped Core Leader",
                content: "G   D   Em\nleader-lyrics",
                collection: "core",
            })
            expect(leaderOk).toMatchObject({ ok: true, collection: "core" })

            // Admin still allowed.
            const adminOk = await saveScrapedChart(ADMIN, {
                title: "Scraped Core Admin",
                content: "G   D   Em\nadmin-lyrics",
                collection: "core",
            })
            expect(adminOk).toMatchObject({ ok: true, collection: "core" })
        })
    })

    // ─── delete_chart ──────────────────────────────────────────────────────

    describe("delete_chart", () => {
        async function seedChart(
            uid: string,
            title: string,
            collection?: "core" | "supplemental" | "uploads",
        ): Promise<string> {
            const r = (await uploadChart(uid, {
                title,
                fileBase64: b64(`%PDF-1.4 ${title}`),
                mimeType: "application/pdf",
                collection,
            })) as { ok: true; fileId: string }
            expect(r.ok).toBe(true)
            return r.fileId
        }

        it("happy path: uploader deletes their own upload; library + songs gone; storage cleaned", async () => {
            const fileId = await seedChart(MUSICIAN, "To Be Deleted")

            const r = await deleteChart(MUSICIAN, { fileId })
            expect(r).toEqual({ ok: true, deletedTracks: 0 })

            const idx = await db().collection("library_index").doc(fileId).get()
            expect(idx.exists).toBe(false)
            const song = await db().collection("songs").doc(fileId).get()
            expect(song.exists).toBe(false)

            // Best-effort storage cleanup happened.
            expect(mockStorageBucketFile).toHaveBeenCalled()
            expect(mockStorageFileDelete).toHaveBeenCalled()
        })

        it("returns 'Chart not found' for an unknown fileId", async () => {
            const r = await deleteChart(ADMIN, { fileId: "upload-does-not-exist" })
            expect(r).toEqual({ error: "Chart not found" })
        })

        it("only the uploader OR an admin may delete", async () => {
            const fileId = await seedChart(MUSICIAN, "Musician's Chart")

            // Different musician cannot delete.
            const otherMusician = "alex-other"
            await db()
                .collection("users")
                .doc(otherMusician)
                .set({ role: "musician", email: "other@example.com" })
            const denied = await deleteChart(otherMusician, { fileId })
            expect(denied).toEqual({
                error: expect.stringContaining("uploader or an admin"),
            })

            // Admin can delete it.
            const ok = await deleteChart(ADMIN, { fileId })
            expect(ok).toEqual({ ok: true, deletedTracks: 0 })
        })

        it("refuses to delete a chart bonded to any setlist track", async () => {
            const fileId = await seedChart(ADMIN, "Bonded Chart")

            await db().collection("tracks").doc("trk-1").set({
                setlistId: "set-1",
                fileId,
                title: "Bonded Chart",
                order: 0,
            })

            const refused = await deleteChart(ADMIN, { fileId })
            expect(refused).toEqual({
                error: expect.stringContaining("bonded to 1 setlist"),
            })

            // Chart still exists.
            const idx = await db().collection("library_index").doc(fileId).get()
            expect(idx.exists).toBe(true)

            // After removing the bond, delete succeeds.
            await db().collection("tracks").doc("trk-1").delete()
            const ok = await deleteChart(ADMIN, { fileId })
            expect(ok).toEqual({ ok: true, deletedTracks: 0 })
        })

        it("curated-catalog delete is admin-only (even for the uploader)", async () => {
            // Seed a core-collection chart whose uploadedBy is LEADER — a
            // historical state that's no longer possible to create post-G-3
            // (the gate prevents new non-admin core writes), but tests the
            // delete-side curated gate independently of the ownership gate.
            const fileId = "upload-test-core-leader"
            await db().collection("library_index").doc(fileId).set({
                name: "Pre-G-3 Core Chart",
                nameLower: "pre-g-3 core chart",
                collection: "core",
                uploadedBy: LEADER,
                status: "active",
                storageUrl: `library/${fileId}.pdf`,
            })
            await db().collection("songs").doc(fileId).set({
                title: "Pre-G-3 Core Chart",
                status: "active",
            })

            const denied = await deleteChart(LEADER, { fileId })
            expect(denied).toEqual({
                error: expect.stringContaining("requires an admin account"),
            })

            const ok = await deleteChart(ADMIN, { fileId })
            expect(ok).toEqual({ ok: true, deletedTracks: 0 })
        })

        it("rejects callers without upload permission", async () => {
            const fileId = await seedChart(ADMIN, "Admin Upload")
            const r = await deleteChart(PENDING_NO_FLAG, { fileId })
            expect(r).toEqual({
                error: expect.stringContaining("Upload permission required"),
            })
        })
    })

    // ─── import_chart_from_drive ────────────────────────────────────────────

    describe("import_chart_from_drive", () => {
        it("happy path: admin imports a Drive PDF — writes index + songs, Storage called", async () => {
            mockDriveGetFileMetadata.mockResolvedValue({
                name: "Bina in G.pdf",
                mimeType: "application/pdf",
            })
            mockDriveGetFile.mockResolvedValue(
                Buffer.from("%PDF-1.4 Bina drive bytes"),
            )

            const result = (await importChartFromDrive(ADMIN, {
                driveFileId: "1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS",
            })) as {
                ok: true
                fileId: string
                title: string
                collection: string
            }
            expect(result.ok).toBe(true)
            expect(result.fileId).toMatch(/^upload-/)
            expect(result.title).toBe("Bina in G")
            expect(result.collection).toBe("uploads")

            expect(mockDriveGetFileMetadata).toHaveBeenCalledWith(
                "1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS",
            )
            expect(mockDriveGetFile).toHaveBeenCalledWith(
                "1uj3isd0RJoAYoETx4QFwjQQgwjaO4DTS",
            )

            const idx = (
                await db().collection("library_index").doc(result.fileId).get()
            ).data()!
            expect(idx).toMatchObject({
                name: "Bina in G",
                nameLower: "bina in g",
                mimeType: "application/pdf",
                source: "upload",
                collection: "uploads",
                status: "active",
                uploadedBy: ADMIN,
            })

            expect(mockUploadToStorage).toHaveBeenCalledTimes(1)
            expect(mockUploadToStorage).toHaveBeenCalledWith(
                expect.stringMatching(/^upload-/),
                expect.any(Buffer),
                "application/pdf",
            )
        })

        it("caller title override wins over the Drive file name", async () => {
            mockDriveGetFileMetadata.mockResolvedValue({
                name: "scan-final-v2.pdf",
                mimeType: "application/pdf",
            })
            mockDriveGetFile.mockResolvedValue(Buffer.from("%PDF-1.4 x"))

            const result = (await importChartFromDrive(ADMIN, {
                driveFileId: "abc123",
                title: "Hinei Ma Tov",
            })) as { ok: true; title: string }
            expect(result.title).toBe("Hinei Ma Tov")
        })

        it("rejects empty driveFileId before touching Drive", async () => {
            const r = await importChartFromDrive(ADMIN, { driveFileId: "  " })
            expect(r).toEqual({ error: "driveFileId is required" })
            expect(mockDriveGetFileMetadata).not.toHaveBeenCalled()
            expect(mockDriveGetFile).not.toHaveBeenCalled()
        })

        it("permission gate: pending user without canUpload denied", async () => {
            const r = await importChartFromDrive(PENDING_NO_FLAG, {
                driveFileId: "any",
            })
            expect(r).toEqual({
                error: expect.stringContaining("Upload permission required"),
            })
            expect(mockDriveGetFileMetadata).not.toHaveBeenCalled()
        })

        it("curated-catalog gate: musician blocked from 'core'", async () => {
            const r = await importChartFromDrive(MUSICIAN, {
                driveFileId: "abc",
                collection: "core",
            })
            expect(r).toEqual({
                error: expect.stringContaining("'core' catalog"),
            })
            // Gate fires before any Drive call — request body stays tiny.
            expect(mockDriveGetFileMetadata).not.toHaveBeenCalled()
        })

        it("band_leader can import to curated 'core' (widened gate)", async () => {
            mockDriveGetFileMetadata.mockResolvedValue({
                name: "Adon Olam.pdf",
                mimeType: "application/pdf",
            })
            mockDriveGetFile.mockResolvedValue(Buffer.from("%PDF-1.4 a"))

            const r = (await importChartFromDrive(LEADER, {
                driveFileId: "drv-1",
                collection: "core",
            })) as { ok: true; collection: string }
            expect(r.ok).toBe(true)
            expect(r.collection).toBe("core")
        })

        it("surfaces Drive metadata fetch error", async () => {
            mockDriveGetFileMetadata.mockRejectedValue(
                new Error("File not found"),
            )
            const r = await importChartFromDrive(ADMIN, {
                driveFileId: "missing",
            })
            expect(r).toEqual({
                error: expect.stringContaining("metadata"),
            })
            expect(mockDriveGetFile).not.toHaveBeenCalled()
        })

        it("rejects native Google Docs mime types with export hint", async () => {
            mockDriveGetFileMetadata.mockResolvedValue({
                name: "My Song",
                mimeType: "application/vnd.google-apps.document",
            })
            const r = await importChartFromDrive(ADMIN, {
                driveFileId: "gdoc-1",
            })
            expect(r).toEqual({
                error: expect.stringContaining("export it to PDF"),
            })
            expect(mockDriveGetFile).not.toHaveBeenCalled()
        })

        it("rejects empty Drive payload", async () => {
            mockDriveGetFileMetadata.mockResolvedValue({
                name: "empty.pdf",
                mimeType: "application/pdf",
            })
            mockDriveGetFile.mockResolvedValue(Buffer.alloc(0))
            const r = await importChartFromDrive(ADMIN, {
                driveFileId: "empty",
            })
            expect(r).toEqual({
                error: expect.stringContaining("empty"),
            })
        })

        it("respects same dedup pipeline as upload_chart (exact match)", async () => {
            // Seed via upload_chart, then try to import a Drive file with the
            // same title — should hit the exact-name dedup, not write twice.
            await uploadChart(ADMIN, {
                title: "Mi Chamocha",
                fileBase64: b64("%PDF-1.4 first"),
                mimeType: "application/pdf",
            })
            mockUploadToStorage.mockClear()

            mockDriveGetFileMetadata.mockResolvedValue({
                name: "Mi Chamocha.pdf",
                mimeType: "application/pdf",
            })
            mockDriveGetFile.mockResolvedValue(Buffer.from("%PDF-1.4 second"))

            const r = await importChartFromDrive(LEADER, {
                driveFileId: "dup-1",
            })
            expect(r).toEqual({
                error: expect.stringContaining("already exists"),
            })
            expect(mockUploadToStorage).not.toHaveBeenCalled()
        })
    })
})
