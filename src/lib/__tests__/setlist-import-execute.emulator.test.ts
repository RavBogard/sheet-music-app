import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

/**
 * F-3 + F-5 (setlist-import-via-pcu-with-defaults-mirror lane) — coverage for
 * `executeSetlistImport`, the testable core of POST /api/setlists/import/execute.
 *
 * Pre-fix the route wrote `library_index/{newLibraryId}` directly via 11-field
 * literal — diverging from PCU's 18+ field shape, skipping enrichment-emit,
 * and writing no `songs/{id}.defaults`. The drive-id-write-symmetry fix at
 * master `0c0392a72` patched ONE field (`driveFileId`) onto the divergent
 * shape; THIS lane closes the divergence entirely.
 *
 * Tests assert:
 *  (a) new rows have full PCU 18+ field shape (incl. `nameLower`,
 *      `normalizedName`, `stem`, `titleSpecificity`,
 *      `bondCorrectionHistory`, `enrichmentStatus: 'pending'`, `driveFileId`,
 *      `collection: 'uploads'`)
 *  (b) `songs/{id}.defaults.{key,lead}` is populated when the parsed row
 *      carried `item.key` / `item.performer` (F-5 mirror)
 *  (c) a `duplicate_exact` or `duplicate_similar` collision in the middle of
 *      a multi-chart import returns a per-row outcome and does NOT abort the
 *      whole import (auditor's specific call-out for this lane)
 *  (d) `emitLibraryRowCreated` fires for every new row (AI enrichment
 *      subscriber gate)
 */

// ─── Mock Firebase Storage (mirror drive-sync.emulator.test.ts pattern) ───
const storageState = new Map<string, number>()
function storagePathFor(fileId: string, mime: string): string {
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
        storageState.set(storagePathFor(fileId, mime), buffer.byteLength)
        return `gs://test/${storagePathFor(fileId, mime)}`
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

// Spy on emitLibraryRowCreated — assert (d). The real implementation is a
// fire-and-forget event bus; spying lets us verify it was called once per
// successful PCU write without exercising any subscriber.
const mockEmit = vi.fn()
vi.mock("@/lib/library/library-events", async (orig) => {
    const real =
        (await orig()) as typeof import("@/lib/library/library-events")
    return {
        ...real,
        emitLibraryRowCreated: (e: unknown) => {
            mockEmit(e)
        },
    }
})

// PCU's safelyDeleteLibraryObject uses bond-aware logic that pokes Firestore
// + Storage; in this test we never need to exercise the compensating-delete
// path, but if PCU's batch fails we don't want a phantom call to fail the
// test setup. Stub it as a no-op.
vi.mock("@/lib/library/safely-delete-library-object", () => ({
    safelyDeleteLibraryObject: vi.fn(async () => ({
        ok: true,
        deletedPath: null,
    })),
}))

// Rate limit always passes in tests.
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
    checkRateLimit: vi.fn().mockResolvedValue(null),
}))

// Mock fetch — seeded Drive file id → bytes.
const driveFiles = new Map<string, Buffer>()
const originalFetch = globalThis.fetch
function mockFetch(url: string): Response {
    const idMatch = url.match(/[?&]id=([A-Za-z0-9_-]+)/)
    const id = idMatch?.[1]
    if (!id || !driveFiles.has(id)) {
        return new Response(null, {
            status: 404,
            headers: { "content-type": "text/plain" },
        })
    }
    const bytes = driveFiles.get(id)!
    // Slice into a fresh ArrayBuffer (TS DOM `BodyInit` accepts ArrayBuffer
    // cleanly; Node's `Buffer` / `Uint8Array<ArrayBufferLike>` triggers a
    // typing mismatch with the lib.dom Response constructor signature even
    // though both run fine at runtime).
    const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    return new Response(ab, {
        status: 200,
        headers: { "content-type": "application/pdf" },
    })
}

// ─── SUT (imported AFTER mocks) ─────────────────────────────────────────
import { executeSetlistImport } from "@/lib/setlist-import-execute"

describe("executeSetlistImport — F-3 + F-5 (emulator)", () => {
    let app: App
    const UPLOADER_UID = "test-uploader-uid"
    const UPLOADER_EMAIL = "test@centralreform.org"

    function db() {
        return getFirestore(app)
    }

    function makePdf(label: string): Buffer {
        // PCU's content-type check accepts application/pdf; size-matching
        // matters for the atomic-guard read-verify.
        return Buffer.from(`%PDF-1.4 ${label}`)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({
                projectId: "demo-setlist-import-execute",
            })
        // Hook fetch.
        globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
            const u = typeof url === "string" ? url : url.toString()
            return mockFetch(u)
        }) as unknown as typeof fetch
    })

    afterAll(async () => {
        globalThis.fetch = originalFetch
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "library_index",
            "songs",
            "library_signals",
            "setlists",
            "tracks",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storageState.clear()
        driveFiles.clear()
        mockEmit.mockClear()
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    function driveUrl(id: string): string {
        return `https://drive.google.com/file/d/${id}/view`
    }

    // ────────────────────────────────────────────────────────────────────
    // (a) — new rows minted via setlist-import now have full PCU shape
    // ────────────────────────────────────────────────────────────────────
    it("(a) new row has full PCU 18+ field shape incl. driveFileId + collection + enrichmentStatus", async () => {
        const driveId = "drive-id-a1"
        driveFiles.set(driveId, makePdf(driveId))

        const result = await executeSetlistImport({
            db: db(),
            setName: "F-3/F-5 shape test",
            uploaderUid: UPLOADER_UID,
            uploaderEmail: UPLOADER_EMAIL,
            items: [
                {
                    type: "song",
                    title: "Lecha Dodi",
                    chartUrl: driveUrl(driveId),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
            ],
        })

        expect(result.importOutcomes).toHaveLength(1)
        const outcome = result.importOutcomes[0]
        expect(outcome.status).toBe("imported")
        expect(outcome.fileId).toBeTruthy()

        const row = await db()
            .collection("library_index")
            .doc(outcome.fileId!)
            .get()
        const data = row.data()!
        expect(data.name).toBe("Lecha Dodi")
        expect(data.nameLower).toBe("lecha dodi")
        expect(data.normalizedName).toBe("lechadodi")
        expect(data.stem).toBeTruthy()
        expect(typeof data.titleSpecificity).toBe("number")
        expect(data.bondCorrectionHistory).toEqual({
            correctedTo: 0,
            correctedAwayFrom: 0,
        })
        expect(data.enrichmentStatus).toBe("pending")
        expect(data.collection).toBe("uploads")
        expect(data.driveFileId).toBe(driveId) // coder-3 F-1 preserved through PCU route
        expect(data.source).toBe("upload")
        expect(data.status).toBe("active")
        expect(data.mimeType).toBe("application/pdf")
        expect(data.storageUrl).toBe(`library/${outcome.fileId}.pdf`)
        expect(typeof data.fileSize).toBe("number")
        expect(data.uploadedBy).toBe(UPLOADER_UID)
        expect(data.uploadedByEmail).toBe(UPLOADER_EMAIL)
    })

    // ────────────────────────────────────────────────────────────────────
    // (b) — F-5 mirror: songs/{id}.defaults dual-written
    // ────────────────────────────────────────────────────────────────────
    it("(b) songs/{id}.defaults.{key,lead} populated when item.key + item.performer supplied", async () => {
        const driveId = "drive-id-b1"
        driveFiles.set(driveId, makePdf(driveId))

        const result = await executeSetlistImport({
            db: db(),
            setName: "F-5 defaults mirror test",
            uploaderUid: UPLOADER_UID,
            uploaderEmail: UPLOADER_EMAIL,
            items: [
                {
                    type: "song",
                    title: "Hashkivenu",
                    chartUrl: driveUrl(driveId),
                    key: "D",
                    performer: "Klepper-Freelander",
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
            ],
        })

        expect(result.importOutcomes[0].status).toBe("imported")
        const fileId = result.importOutcomes[0].fileId!

        // songs/{id}.defaults must reflect both key + lead (F-5 fix).
        const songDoc = await db().collection("songs").doc(fileId).get()
        const songData = songDoc.data()!
        expect(songData.defaults?.key).toBe("D")
        expect(songData.defaults?.lead).toBe("Klepper-Freelander")

        // library_index must ALSO carry the dual-write fields (applySongMetadata
        // updates both surfaces). The performer composition lands in the
        // chart name; the leadMusician field carries the structured value.
        const indexDoc = await db()
            .collection("library_index")
            .doc(fileId)
            .get()
        const indexData = indexDoc.data()!
        expect(indexData.key).toBe("D")
        expect(indexData.leadMusician).toBe("Klepper-Freelander")
        // Title still composed with the parenthetical performer suffix —
        // preserves the legacy import behavior.
        expect(indexData.name).toBe("Hashkivenu (Klepper-Freelander)")
    })

    // ────────────────────────────────────────────────────────────────────
    // (c) — multi-chart import with one duplicate: no abort, per-row outcomes
    // ────────────────────────────────────────────────────────────────────
    it("(c) duplicate_exact in the middle of a 3-row import: 2 imported, 1 duplicate outcome, no abort", async () => {
        // Pre-seed an existing chart so PCU's exact-dedup fires on row 2.
        const existingFileId = "upload-existing-adon-olam"
        await db()
            .collection("library_index")
            .doc(existingFileId)
            .set({
                name: "Adon Olam",
                nameLower: "adon olam",
                normalizedName: "adonolam",
                stem: "adon olam",
                status: "active",
                collection: "uploads",
                source: "upload",
            })

        // Three Drive files; row 2 will collide on the exact-name dedup.
        const idA = "drive-id-c1"
        const idB = "drive-id-c2"
        const idC = "drive-id-c3"
        driveFiles.set(idA, makePdf(idA))
        driveFiles.set(idB, makePdf(idB))
        driveFiles.set(idC, makePdf(idC))

        const result = await executeSetlistImport({
            db: db(),
            setName: "F-3 dedup-mid-import test",
            uploaderUid: UPLOADER_UID,
            uploaderEmail: UPLOADER_EMAIL,
            items: [
                {
                    type: "song",
                    title: "Lecha Dodi",
                    chartUrl: driveUrl(idA),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
                {
                    // Duplicate of the seeded "Adon Olam".
                    type: "song",
                    title: "Adon Olam",
                    chartUrl: driveUrl(idB),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
                {
                    type: "song",
                    title: "Hashkivenu",
                    chartUrl: driveUrl(idC),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
            ],
        })

        // Three per-row outcomes — the loop did NOT abort.
        expect(result.importOutcomes).toHaveLength(3)
        expect(result.importOutcomes[0].status).toBe("imported")
        expect(result.importOutcomes[0].title).toBe("Lecha Dodi")
        expect(result.importOutcomes[1].status).toBe("duplicate")
        expect(result.importOutcomes[1].title).toBe("Adon Olam")
        expect(result.importOutcomes[1].code).toBe("duplicate_exact")
        expect(result.importOutcomes[1].fileId).toBeUndefined()
        expect(result.importOutcomes[2].status).toBe("imported")
        expect(result.importOutcomes[2].title).toBe("Hashkivenu")

        // Library has 3 rows total: 1 pre-seeded + 2 new from the import
        // (the dupe did NOT mint a sibling — pre-fix it would have).
        const lib = await db().collection("library_index").get()
        expect(lib.size).toBe(3)

        // Setlist has 3 song tracks; the duplicate row is unbonded.
        // setlist-write.ts writes top-level `tracks/{id}` docs with a
        // `setlistId` FK, not an inline tracks array on the parent.
        const tracks = await db()
            .collection("tracks")
            .where("setlistId", "==", result.setlistId)
            .get()
        const trackData = tracks.docs.map((d) => d.data())
        const songTracks = trackData.filter((t) => t.type === "song")
        expect(songTracks).toHaveLength(3)
        const bondedTracks = songTracks.filter((t) => !!t.fileId)
        expect(bondedTracks).toHaveLength(2) // dupe stayed unbonded
    })

    // ────────────────────────────────────────────────────────────────────
    // (d) — emitLibraryRowCreated fires for each new row (AI subscriber gate)
    // ────────────────────────────────────────────────────────────────────
    it("(d) emitLibraryRowCreated fires once per successful PCU write (AI enrichment subscriber gate)", async () => {
        const idA = "drive-id-d1"
        const idB = "drive-id-d2"
        driveFiles.set(idA, makePdf(idA))
        driveFiles.set(idB, makePdf(idB))

        const result = await executeSetlistImport({
            db: db(),
            setName: "F-3 emit test",
            uploaderUid: UPLOADER_UID,
            uploaderEmail: UPLOADER_EMAIL,
            items: [
                {
                    type: "song",
                    title: "Mi Shebeirach",
                    chartUrl: driveUrl(idA),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
                {
                    type: "song",
                    title: "Shalom Rav",
                    chartUrl: driveUrl(idB),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
            ],
        })

        expect(result.importOutcomes.every((o) => o.status === "imported")).toBe(
            true,
        )
        // 2 successful writes → 2 emits. Pre-fix the legacy direct-write
        // path never called emitLibraryRowCreated, so enrichment never ran.
        expect(mockEmit).toHaveBeenCalledTimes(2)
        const emitArgs = mockEmit.mock.calls.map((c) => c[0])
        const fileIds = emitArgs.map((e) => e.fileId).sort()
        const outcomeIds = result.importOutcomes
            .map((o) => o.fileId!)
            .sort()
        expect(fileIds).toEqual(outcomeIds)
    })

    // ────────────────────────────────────────────────────────────────────
    // Coverage extra — multi-chart import where row 2 fails Drive download
    // ────────────────────────────────────────────────────────────────────
    it("drive-failed row is surfaced + does not abort subsequent imports", async () => {
        const idA = "drive-id-e1"
        const idC = "drive-id-e3"
        driveFiles.set(idA, makePdf(idA))
        // idB is NOT seeded → 404 on fetch
        driveFiles.set(idC, makePdf(idC))

        const result = await executeSetlistImport({
            db: db(),
            setName: "drive-failed mid-import",
            uploaderUid: UPLOADER_UID,
            uploaderEmail: UPLOADER_EMAIL,
            items: [
                {
                    type: "song",
                    title: "Yedid Nefesh",
                    chartUrl: driveUrl(idA),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
                {
                    type: "song",
                    title: "Missing Chart",
                    chartUrl: driveUrl("drive-id-e2-missing"),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
                {
                    type: "song",
                    title: "Oseh Shalom",
                    chartUrl: driveUrl(idC),
                    key: null,
                    performer: null,
                    referenceLink: null,
                    chartError: null,
                    libraryMatchId: null,
                    libraryMatchName: null,
                },
            ],
        })

        expect(result.importOutcomes).toHaveLength(3)
        expect(result.importOutcomes[0].status).toBe("imported")
        expect(result.importOutcomes[1].status).toBe("drive-failed")
        expect(result.importOutcomes[2].status).toBe("imported")
        // Only 2 rows minted in library_index (the failed one didn't write).
        const lib = await db().collection("library_index").get()
        expect(lib.size).toBe(2)
    })
})
