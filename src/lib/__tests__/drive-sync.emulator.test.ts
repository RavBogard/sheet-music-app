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

/**
 * Cycle-3 NEW-1 — Drive-sync poller against the Firebase emulator.
 *
 * Real Firestore drives the state-store contract (`driveWatchState`,
 * `chartImportQueue`, `library_index`, `library_signals`). DriveClient
 * + firebase-storage are stubbed with in-memory state so the test can
 * model new / rename / replace / move / delete / permission-lost /
 * dedup-blocked semantics deterministically.
 *
 * Standing memory: `processChartUpload`'s atomic-guard contract
 * (read-verify + compensating-delete + library_signals broadcast) MUST
 * be preserved through this refactor. The poller calls processor with
 * driveMetadata; the processor still owns the guard.
 */

// ─── Mock Firebase Storage (mirror of mcp-chart-upload.emulator.test.ts) ───
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

// Drive in-memory: file id → bytes + metadata.
interface MockDriveFile {
    id: string
    name: string
    mimeType: string
    modifiedTime: string
    parents: string[]
    md5Checksum?: string
    bytes: Buffer
    /** When true, getFile throws a 404; for permission_lost simulate 403. */
    fault?: "404" | "403"
}
const driveFiles = new Map<string, MockDriveFile>()

const mockListFilesByQuery = vi.fn(
    async (params: {
        q: string
        fields?: string
        pageSize?: number
        pageToken?: string
        orderBy?: string
    }) => {
        // Tiny query parser: extract parent IDs ('xxx' in parents) + modifiedTime > 'iso'.
        const inParentsRe = /'([^']+)'\s+in\s+parents/g
        const parents = new Set<string>()
        for (const m of params.q.matchAll(inParentsRe)) parents.add(m[1])
        const modifiedMatch = params.q.match(/modifiedTime\s*>\s*'([^']+)'/)
        const sinceIso = modifiedMatch?.[1]
        const wantFolders = /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(
            params.q,
        )
        const excludeFolders = /mimeType\s*!=\s*'application\/vnd\.google-apps\.folder'/.test(
            params.q,
        )
        const files = Array.from(driveFiles.values()).filter((f) => {
            if (!f.parents.some((p) => parents.has(p))) return false
            if (wantFolders && f.mimeType !== "application/vnd.google-apps.folder") {
                return false
            }
            if (excludeFolders && f.mimeType === "application/vnd.google-apps.folder") {
                return false
            }
            if (sinceIso && f.modifiedTime <= sinceIso) return false
            return true
        })
        return {
            files: files.map((f) => ({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType,
                modifiedTime: f.modifiedTime,
                parents: f.parents,
                md5Checksum: f.md5Checksum,
            })),
            nextPageToken: null,
        }
    },
)
const mockGetFile = vi.fn(async (fileId: string) => {
    const f = driveFiles.get(fileId)
    if (!f) throw Object.assign(new Error("File not found: 404"), { status: 404 })
    if (f.fault === "404") {
        throw Object.assign(new Error("File not found: 404"), { status: 404 })
    }
    if (f.fault === "403") {
        throw Object.assign(new Error("permission denied: 403"), { status: 403 })
    }
    return f.bytes
})
const mockGetFileMetadata = vi.fn(async (fileId: string) => {
    const f = driveFiles.get(fileId)
    if (!f) throw Object.assign(new Error("File not found: 404"), { status: 404 })
    return { id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents }
})

vi.mock("@/lib/google-drive", () => ({
    DriveClient: class {
        listFilesByQuery = mockListFilesByQuery
        getFile = mockGetFile
        getFileMetadata = mockGetFileMetadata
    },
}))

vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

// ─── SUT (imported AFTER mocks) ─────────────────────────────────────────
import { runDriveSync } from "@/lib/drive-sync/poller"
import { processChartUpload } from "@/lib/library-upload"
import { DriveClient } from "@/lib/google-drive"

describe("Drive-sync poller (emulator)", () => {
    let app: App
    const PARENT = "drop-root-id"
    const FRIDAY_SUB = "friday-sub-id"
    const SHIREINU_SUB = "shireinu-sub-id"

    function db() {
        return getFirestore(app)
    }

    function makePdf(label: string): Buffer {
        // Tiny synthetic PDF — content doesn't have to be a real PDF for the
        // processor; only mimeType + byteLength + atomic-guard size-match
        // matters. The processor's content-type check accepts application/pdf.
        return Buffer.from(`%PDF-1.4 ${label}`)
    }

    function seedDriveFile(partial: Partial<MockDriveFile> & { id: string }) {
        const full: MockDriveFile = {
            name: `${partial.id}.pdf`,
            mimeType: "application/pdf",
            modifiedTime: "2026-05-17T20:00:00.000Z",
            parents: [PARENT],
            md5Checksum: `md5-${partial.id}-v1`,
            bytes: makePdf(partial.id),
            ...partial,
        } as MockDriveFile
        driveFiles.set(full.id, full)
    }

    function makeDeps(now: Date) {
        return {
            drive: new DriveClient() as unknown as Parameters<
                typeof runDriveSync
            >[0]["deps"]["drive"],
            db: db(),
            processor: processChartUpload,
            now: () => now,
        }
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-drive-sync-poller" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [
            "library_index",
            "songs",
            "library_signals",
            "driveWatchState",
            "chartImportQueue",
        ]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storageState.clear()
        driveFiles.clear()
        // Seed the subfolder list.
        seedDriveFile({
            id: FRIDAY_SUB,
            name: "Friday Evening",
            mimeType: "application/vnd.google-apps.folder",
            parents: [PARENT],
            modifiedTime: "2026-05-01T00:00:00.000Z",
            md5Checksum: undefined,
        })
        seedDriveFile({
            id: SHIREINU_SUB,
            name: "Shireinu",
            mimeType: "application/vnd.google-apps.folder",
            parents: [PARENT],
            modifiedTime: "2026-05-01T00:00:00.000Z",
            md5Checksum: undefined,
        })
    })

    it("first tick: initializes driveWatchState and imports nothing", async () => {
        // Drop one file that exists historically — the first-tick guard
        // should keep lastPollAt at now() and refuse to backfill.
        seedDriveFile({
            id: "historical-1",
            name: "Old Chart.pdf",
            parents: [PARENT],
            modifiedTime: "2024-01-01T00:00:00.000Z",
        })
        const now = new Date("2026-05-17T23:50:00.000Z")
        const r = await runDriveSync({
            deps: makeDeps(now),
            parentFolderId: PARENT,
        })
        expect(r.watching).toBe(true)
        expect(r.imported).toBe(0)
        expect(r.filesScanned).toBe(0)
        const stateDoc = (
            await db().collection("driveWatchState").doc(PARENT).get()
        ).data()!
        expect(stateDoc.lastPollAt).toBe(now.toISOString())
        // Subfolder discovery happened on first tick.
        expect((stateDoc.subfolderIds as string[]).sort()).toEqual(
            [FRIDAY_SUB, SHIREINU_SUB].sort(),
        )
        // Default collection mapping = 'supplemental' for both.
        const cm = stateDoc.collectionMap as Record<
            string,
            { name: string; collection: string }
        >
        expect(cm[FRIDAY_SUB].collection).toBe("supplemental")
        expect(cm[SHIREINU_SUB].name).toBe("Shireinu")
    })

    it("imports a new file from a subfolder; resolves collection from collectionMap", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })
        // Operator (or NEW-4 future UI) curates Friday Evening → 'core'.
        await db().collection("driveWatchState").doc(PARENT).update({
            [`collectionMap.${FRIDAY_SUB}.collection`]: "core",
        })

        seedDriveFile({
            id: "drive-friday-shalom",
            name: "Shalom Rav.pdf",
            parents: [FRIDAY_SUB],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-shalom-v1",
        })
        const t1 = new Date("2026-05-18T00:00:00.000Z")
        const r = await runDriveSync({
            deps: makeDeps(t1),
            parentFolderId: PARENT,
        })

        expect(r.imported).toBe(1)
        expect(r.queued).toBe(0)
        const rowSnap = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-friday-shalom")
            .get()
        expect(rowSnap.size).toBe(1)
        const row = rowSnap.docs[0].data()
        expect(row.collection).toBe("core")
        expect(row.driveFileId).toBe("drive-friday-shalom")
        expect(row.driveMd5).toBe("md5-shalom-v1")
        expect(row.source).toBe("drive-sync")
        expect(row.name).toBe("Shalom Rav") // ext stripped

        // library_signals broadcast happened (atomic-guard contract).
        const sig = (
            await db().collection("library_signals").doc("latest").get()
        ).data()!
        expect(sig.fileId).toBe(rowSnap.docs[0].id)
    })

    it("rename: same md5 + different name → updates library row name; no Storage rewrite", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "drive-rename-1",
            name: "Hashkivenu.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-hashk-v1",
        })
        await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        const initial = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-rename-1")
            .get()
        expect(initial.size).toBe(1)
        const initialDocId = initial.docs[0].id
        const uploadCallsBefore = mockUploadToStorage.mock.calls.length

        // Rename in Drive (same md5, new name, bumped modifiedTime).
        const f = driveFiles.get("drive-rename-1")!
        f.name = "Hashkivenu (Israeli).pdf"
        f.modifiedTime = "2026-05-18T00:05:00.000Z"

        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:10:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.renamed).toBe(1)
        expect(r.imported).toBe(0)
        expect(r.replaced).toBe(0)
        expect(mockUploadToStorage.mock.calls.length).toBe(uploadCallsBefore)

        const after = (
            await db().collection("library_index").doc(initialDocId).get()
        ).data()!
        expect(after.name).toBe("Hashkivenu (Israeli)")
        expect(after.driveMd5).toBe("md5-hashk-v1")
    })

    it("replace: advanced md5 → rewrites Storage, version-bump, library_signals broadcast", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "drive-replace-1",
            name: "Adon Olam.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-adon-v1",
        })
        await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        const initial = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-replace-1")
            .get()
        const initialDocId = initial.docs[0].id
        const uploadCallsBefore = mockUploadToStorage.mock.calls.length

        // Replace in Drive: advance md5 + bump bytes.
        const f = driveFiles.get("drive-replace-1")!
        f.md5Checksum = "md5-adon-v2"
        f.bytes = Buffer.from("%PDF-1.4 adon-replaced-larger-bytes")
        f.modifiedTime = "2026-05-18T00:05:00.000Z"

        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:10:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.replaced).toBe(1)
        // Storage was rewritten with the new bytes (one extra uploadToStorage call).
        expect(mockUploadToStorage.mock.calls.length).toBeGreaterThan(
            uploadCallsBefore,
        )
        const after = (
            await db().collection("library_index").doc(initialDocId).get()
        ).data()!
        expect(after.driveMd5).toBe("md5-adon-v2")
        expect(after.fileSize).toBe(f.bytes.byteLength)
        const sig = (
            await db().collection("library_signals").doc("latest").get()
        ).data()!
        expect(sig.op).toBe("drive-sync:replace")
        expect(sig.fileId).toBe(initialDocId)
    })

    it("permission_lost: writes chartImportQueue row, library untouched", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "drive-perm-lost",
            name: "Yedid Nefesh.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-yedid-v1",
            fault: "403",
        })
        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.queued).toBe(1)
        expect(r.imported).toBe(0)
        const q = (
            await db()
                .collection("chartImportQueue")
                .doc("drive-perm-lost")
                .get()
        ).data()!
        expect(q.status).toBe("permission_lost")
        expect(q.driveFileId).toBe("drive-perm-lost")
        const libSnap = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-perm-lost")
            .get()
        expect(libSnap.empty).toBe(true)
    })

    it("delete in Drive does NOT propagate: library row stays after subsequent tick", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "drive-delete-test",
            name: "Lcha Dodi.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-lcha-v1",
        })
        await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        const beforeSnap = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-delete-test")
            .get()
        expect(beforeSnap.size).toBe(1)

        // Drive deletes the file; subsequent tick sees no event.
        driveFiles.delete("drive-delete-test")
        await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:10:00.000Z")),
            parentFolderId: PARENT,
        })

        const afterSnap = await db()
            .collection("library_index")
            .where("driveFileId", "==", "drive-delete-test")
            .get()
        expect(afterSnap.size).toBe(1)
        const after = afterSnap.docs[0].data()
        // Library row still active — Storage stays canonical.
        expect(after.status).toBe("active")
    })

    it("Google-native doc: queued as google_doc_skipped, never imported", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "google-doc-1",
            name: "Liturgy Notes",
            mimeType: "application/vnd.google-apps.document",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: undefined,
        })
        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.queued).toBe(1)
        expect(r.imported).toBe(0)
        const q = (
            await db().collection("chartImportQueue").doc("google-doc-1").get()
        ).data()!
        expect(q.status).toBe("google_doc_skipped")
    })

    it("dedup_blocked: existing library row by same nameLower → queued, not imported", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        // An MCP user previously uploaded the same-named chart manually —
        // exact-name dedup must fire and chartImportQueue must explain it.
        await db().collection("library_index").doc("upload-existing").set({
            name: "Mi Chamocha",
            nameLower: "mi chamocha",
            normalizedName: "michamocha",
            status: "active",
            collection: "supplemental",
        })

        seedDriveFile({
            id: "drive-mi-chamocha",
            name: "Mi Chamocha.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-17T23:55:00.000Z",
            md5Checksum: "md5-mc-v1",
        })
        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:00:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.queued).toBe(1)
        expect(r.imported).toBe(0)
        const q = (
            await db()
                .collection("chartImportQueue")
                .doc("drive-mi-chamocha")
                .get()
        ).data()!
        expect(q.status).toBe("dedup_blocked")
    })

    it("advances lastPollAt to the latest modifiedTime processed", async () => {
        const t0 = new Date("2026-05-17T23:50:00.000Z")
        await runDriveSync({ deps: makeDeps(t0), parentFolderId: PARENT })

        seedDriveFile({
            id: "drive-newer",
            name: "Newer.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-18T00:08:00.000Z",
            md5Checksum: "md5-newer-v1",
        })
        seedDriveFile({
            id: "drive-older",
            name: "Older.pdf",
            parents: [PARENT],
            modifiedTime: "2026-05-18T00:02:00.000Z",
            md5Checksum: "md5-older-v1",
        })
        const r = await runDriveSync({
            deps: makeDeps(new Date("2026-05-18T00:10:00.000Z")),
            parentFolderId: PARENT,
        })
        expect(r.imported).toBe(2)
        expect(r.advancedLastPollAt).toBe("2026-05-18T00:08:00.000Z")
        const state = (
            await db().collection("driveWatchState").doc(PARENT).get()
        ).data()!
        expect(state.lastPollAt).toBe("2026-05-18T00:08:00.000Z")
    })
})
