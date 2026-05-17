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
 * GAP-002 — cycle-3 cowork instrumentation MCP tool tests.
 *
 * Covered:
 *  - admin-gate refusal on band_leader + musician callers (forbidden_role)
 *  - non-upload-uuid fileId refusal (Drive id, malformed prefix)
 *  - row_not_found when no library_index row exists
 *  - not_test_row when row exists but isTest:true is missing/false
 *  - storage_delete_failed when no Storage object backs the row
 *  - happy path: row + Storage object → delete Storage; library_index intact
 */

// In-test Storage state mirrors mcp-chart-upload's pattern. Map of path →
// byteSize so `fileExistsInStorage` + `deleteStorageObjectAtPath` + the
// bucket-level `file().exists() / .delete()` calls all share state.
const storageState = new Map<string, number>()

function pathFor(fileId: string, mime?: string): string {
    let ext = mime?.includes("pdf")
        ? ".pdf"
        : mime?.includes("xml")
          ? ".xml"
          : mime?.includes("audio")
            ? ".mp3"
            : ""
    if (ext && fileId.toLowerCase().endsWith(ext)) ext = ""
    return `library/${fileId}${ext}`
}

const mockFileExistsInStorage = vi.fn(
    async (fileId: string, mime?: string) => {
        const candidates = mime
            ? [pathFor(fileId, mime)]
            : [
                  pathFor(fileId),
                  pathFor(fileId, "application/pdf"),
                  pathFor(fileId, "application/xml"),
                  pathFor(fileId, "audio/mpeg"),
              ]
        for (const path of candidates) {
            if (storageState.has(path)) {
                return { success: true as const, data: true as const }
            }
        }
        return { success: true as const, data: false as const }
    },
)

const mockDeleteStorageObjectAtPath = vi.fn(async (path: string) => {
    if (!storageState.has(path)) {
        throw new Error(`Object not found at ${path}`)
    }
    storageState.delete(path)
})

vi.mock("@/lib/firebase-storage", () => ({
    fileExistsInStorage: (...args: unknown[]) =>
        mockFileExistsInStorage(...(args as [string, string | undefined])),
    deleteStorageObjectAtPath: (...args: unknown[]) =>
        mockDeleteStorageObjectAtPath(...(args as [string])),
}))

// Bucket-level mock for the inline path resolution. `bucket.file(path).exists()`
// is called once per candidate; we just check storageState membership.
const mockBucketFileExists = vi.fn((path: string) => async () => [
    storageState.has(path),
])
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: (path: string) => ({
                exists: mockBucketFileExists(path),
            }),
        }),
    }),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { testDeleteStorageObject } from "../tools/test-delete-storage-object"

describe("MCP __test_delete_storage_object (emulator)", () => {
    let app: App
    const ADMIN = "rabbi-daniel"
    const BAND_LEADER = "david-lazaroff"
    const MUSICIAN = "alex-musician"

    function db() {
        return getFirestore(app)
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app =
            getApps()[0] ??
            initializeApp({ projectId: "demo-mcp-test-delete-storage" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of ["library_index", "users"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storageState.clear()
        mockFileExistsInStorage.mockClear()
        mockDeleteStorageObjectAtPath.mockClear()
        mockBucketFileExists.mockClear()
        await db()
            .collection("users")
            .doc(ADMIN)
            .set({ role: "admin", displayName: "Daniel" })
        await db()
            .collection("users")
            .doc(BAND_LEADER)
            .set({ role: "band_leader", displayName: "David" })
        await db()
            .collection("users")
            .doc(MUSICIAN)
            .set({ role: "musician", displayName: "Alex" })
    })

    const TEST_UUID = "upload-deadbeef-cafe-1234-5678-9abcdef01234"

    async function seedTestRow(
        fileId: string,
        fields: Record<string, unknown> = {},
    ): Promise<void> {
        await db()
            .collection("library_index")
            .doc(fileId)
            .set({
                fileId,
                title: "Test Chart",
                isTest: true,
                mimeType: "application/pdf",
                ...fields,
            })
    }

    function seedStorage(fileId: string, mime = "application/pdf") {
        storageState.set(pathFor(fileId, mime), 4096)
    }

    it("refuses band_leader caller with forbidden_role", async () => {
        await seedTestRow(TEST_UUID)
        seedStorage(TEST_UUID)
        const r = await testDeleteStorageObject(BAND_LEADER, {
            fileId: TEST_UUID,
        })
        expect(r).toMatchObject({
            ok: false,
            error: "forbidden_role",
            callerRole: "band_leader",
        })
        // Storage object MUST still exist after a refused call.
        expect(storageState.has(pathFor(TEST_UUID, "application/pdf"))).toBe(true)
    })

    it("refuses musician caller with forbidden_role", async () => {
        await seedTestRow(TEST_UUID)
        seedStorage(TEST_UUID)
        const r = await testDeleteStorageObject(MUSICIAN, {
            fileId: TEST_UUID,
        })
        expect(r).toMatchObject({
            ok: false,
            error: "forbidden_role",
            callerRole: "musician",
        })
        expect(storageState.has(pathFor(TEST_UUID, "application/pdf"))).toBe(true)
    })

    it("refuses Drive-id fileId with invalid_argument", async () => {
        const r = await testDeleteStorageObject(ADMIN, {
            fileId: "1abcDEF_12345xyz",
        })
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
            field: "fileId",
        })
    })

    it("refuses malformed upload-prefix with invalid_argument", async () => {
        const r = await testDeleteStorageObject(ADMIN, {
            fileId: "upload-not-a-uuid",
        })
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
            field: "fileId",
        })
    })

    it("refuses empty fileId with invalid_argument", async () => {
        const r = await testDeleteStorageObject(ADMIN, { fileId: "   " })
        expect(r).toMatchObject({
            ok: false,
            error: "invalid_argument",
            field: "fileId",
        })
    })

    it("refuses with row_not_found when no library_index row exists", async () => {
        const r = await testDeleteStorageObject(ADMIN, { fileId: TEST_UUID })
        expect(r).toMatchObject({
            ok: false,
            error: "row_not_found",
            fileId: TEST_UUID,
        })
    })

    it("refuses with not_test_row when row exists but isTest is not true", async () => {
        await db().collection("library_index").doc(TEST_UUID).set({
            fileId: TEST_UUID,
            title: "Real Chart",
            isTest: false,
            mimeType: "application/pdf",
        })
        seedStorage(TEST_UUID)
        const r = await testDeleteStorageObject(ADMIN, { fileId: TEST_UUID })
        expect(r).toMatchObject({
            ok: false,
            error: "not_test_row",
            fileId: TEST_UUID,
        })
        // Storage object MUST still exist.
        expect(storageState.has(pathFor(TEST_UUID, "application/pdf"))).toBe(true)
    })

    it("refuses with not_test_row when row lacks isTest field entirely", async () => {
        await db().collection("library_index").doc(TEST_UUID).set({
            fileId: TEST_UUID,
            title: "Pre-SEC-004 Chart",
            mimeType: "application/pdf",
            // No isTest field at all (pre-cycle-2 b2 rows).
        })
        seedStorage(TEST_UUID)
        const r = await testDeleteStorageObject(ADMIN, { fileId: TEST_UUID })
        expect(r).toMatchObject({
            ok: false,
            error: "not_test_row",
        })
        expect(storageState.has(pathFor(TEST_UUID, "application/pdf"))).toBe(true)
    })

    it("refuses with storage_delete_failed when no Storage object backs the row", async () => {
        await seedTestRow(TEST_UUID)
        // No seedStorage — row claims a fileId but Storage is empty.
        const r = await testDeleteStorageObject(ADMIN, { fileId: TEST_UUID })
        expect(r).toMatchObject({
            ok: false,
            error: "storage_delete_failed",
            fileId: TEST_UUID,
        })
    })

    it("happy path: admin + isTest:true row + Storage object → deletes Storage, leaves library_index intact", async () => {
        await seedTestRow(TEST_UUID)
        seedStorage(TEST_UUID)
        const beforePath = pathFor(TEST_UUID, "application/pdf")
        expect(storageState.has(beforePath)).toBe(true)

        const r = await testDeleteStorageObject(ADMIN, { fileId: TEST_UUID })
        expect(r).toMatchObject({
            ok: true,
            fileId: TEST_UUID,
            deletedPath: beforePath,
            libraryIndexUntouched: true,
        })
        expect(storageState.has(beforePath)).toBe(false)

        // The library_index row MUST still exist with the same fields —
        // the whole point of GAP-002 is to construct the asymmetric state.
        const rowSnap = await db().collection("library_index").doc(TEST_UUID).get()
        expect(rowSnap.exists).toBe(true)
        expect(rowSnap.data()?.fileId).toBe(TEST_UUID)
        expect(rowSnap.data()?.isTest).toBe(true)
    })
})
