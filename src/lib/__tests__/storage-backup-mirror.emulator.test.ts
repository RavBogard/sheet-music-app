import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { createHash } from "node:crypto"
import {
    runStorageBackup,
    recordStorageBackupRun,
    type StorageBackupDeps,
} from "@/lib/storage-backup/mirror"

/**
 * storage-phase2 — Storage→Drive mirror against the Firebase emulator.
 *
 * Real Firestore drives the `library_index` `status=='active'` query, the
 * `backupDriveId` pointer-on-row write, and the `config/storageBackup` +
 * `storageBackups/{date}` audit docs. Drive + Storage are injected in-memory
 * (no real API calls). Higher fidelity than the pure test for the Firestore
 * contract; the pure test owns exhaustive branch coverage.
 */

const md5b64 = (b: Buffer) => createHash("md5").update(b).digest("base64")
const md5hex = (b: Buffer) => createHash("md5").update(b).digest("hex")

const BK = "BK-shared-drive"
const folderIdFor = (parentId: string, name: string) => `folder:${parentId}::${name}`

function makeMockDrive() {
    const filesByFolder = new Map<string, Array<{ id: string; name: string; md5Checksum?: string }>>()
    const created: Array<Record<string, unknown>> = []
    const updated: Array<{ fileId: string }> = []
    let seq = 0
    const drive: StorageBackupDeps["drive"] = {
        async ensureFolder({ name, parentId }) {
            return folderIdFor(parentId, name)
        },
        async listFilesByQuery({ q }) {
            const folderId = q.match(/'([^']+)'\s+in\s+parents/)?.[1]
            const files = (folderId && filesByFolder.get(folderId)) || []
            return {
                files: files.map((f) => ({ id: f.id, name: f.name, md5Checksum: f.md5Checksum })),
                nextPageToken: null,
            }
        },
        async uploadBinaryFile({ name, buffer, parents }) {
            const id = `drivefile-${++seq}`
            const folderId = parents?.[0] ?? "?"
            const arr = filesByFolder.get(folderId) ?? []
            arr.push({ id, name, md5Checksum: md5hex(buffer) })
            filesByFolder.set(folderId, arr)
            created.push({ id, name })
            return { id, name, md5Checksum: md5hex(buffer), size: String(buffer.byteLength) }
        },
        async updateFileMedia(fileId, buffer) {
            for (const arr of filesByFolder.values()) {
                const f = arr.find((x) => x.id === fileId)
                if (f) f.md5Checksum = md5hex(buffer)
            }
            updated.push({ fileId })
            return { id: fileId, md5Checksum: md5hex(buffer), size: String(buffer.byteLength) }
        },
    }
    return { drive, created, updated }
}

describe("storage-backup mirror (emulator)", () => {
    let app: App
    const storageObjects = new Map<string, Buffer>()
    const db = () => getFirestore(app)

    function makeDeps(mock: ReturnType<typeof makeMockDrive>): StorageBackupDeps {
        return {
            db: db(),
            drive: mock.drive,
            getStorageMd5: async (fileId) => {
                const buf = storageObjects.get(fileId)
                return buf ? { md5Base64: md5b64(buf), size: buf.byteLength, path: `library/${fileId}` } : null
            },
            downloadStoragePath: async (path) => {
                const buf = storageObjects.get(path.replace(/^library\//, ""))
                return buf ? { buffer: buf, contentType: "application/pdf" } : null
            },
            now: () => new Date("2026-05-23T05:00:00.000Z"),
            backupFolderId: BK,
        }
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-storage-backup" })
    })
    afterAll(async () => {
        await deleteApp(app)
    })
    beforeEach(async () => {
        for (const col of ["library_index", "config", "storageBackups"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        storageObjects.clear()
    })

    it("mirrors active rows to Drive and records backupDriveId on each row (real Firestore)", async () => {
        const a = Buffer.from("%PDF-1.4 Adon Olam")
        const b = Buffer.from("%PDF-1.4 Barchu")
        storageObjects.set("upload-a", a)
        storageObjects.set("upload-b", b)
        await db().collection("library_index").doc("upload-a").set({ status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Adon Olam" })
        await db().collection("library_index").doc("upload-b").set({ status: "active", collection: "core", mimeType: "application/pdf", stem: "Barchu" })
        // a non-active row that must be ignored
        await db().collection("library_index").doc("upload-orphan").set({ status: "orphaned", collection: "uploads", mimeType: "application/pdf", stem: "Dead" })

        const mock = makeMockDrive()
        const res = await runStorageBackup(makeDeps(mock))

        expect(res).toMatchObject({ ran: true, scanned: 2, created: 2, failed: 0 })
        const aDoc = (await db().collection("library_index").doc("upload-a").get()).data()
        const bDoc = (await db().collection("library_index").doc("upload-b").get()).data()
        expect(typeof aDoc?.backupDriveId).toBe("string")
        expect(typeof bDoc?.backupDriveId).toBe("string")
        // orphan untouched
        const orphan = (await db().collection("library_index").doc("upload-orphan").get()).data()
        expect(orphan?.backupDriveId).toBeUndefined()
    })

    it("is idempotent: a second run with unchanged bytes skips everything (md5 match)", async () => {
        const a = Buffer.from("%PDF-1.4 stable")
        storageObjects.set("upload-a", a)
        await db().collection("library_index").doc("upload-a").set({ status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Stable" })

        const mock = makeMockDrive()
        const first = await runStorageBackup(makeDeps(mock))
        expect(first.created).toBe(1)

        const second = await runStorageBackup(makeDeps(mock))
        expect(second).toMatchObject({ created: 0, updated: 0, skipped: 1 })
    })

    it("recordStorageBackupRun writes config/storageBackup pointer + dated audit doc", async () => {
        const result = {
            ran: true, scanned: 5, mirrored: 2, created: 2, updated: 0,
            skipped: 3, deferred: 0, failed: 0, bytesMirrored: 1234, errors: [], lastError: null,
            partial: false, bailedAt: null,
        }
        await recordStorageBackupRun(db(), result, new Date("2026-05-23T05:00:00.000Z"))

        const pointer = (await db().collection("config").doc("storageBackup").get()).data()
        expect(pointer?.scanned).toBe(5)
        expect(pointer?.mirrored).toBe(2)
        expect(pointer?.lastBackupAt).toBeTruthy()
        const audit = (await db().collection("storageBackups").doc("2026-05-23").get()).data()
        expect(audit?.bytesMirrored).toBe(1234)
        expect(audit?.skipped).toBe(3)
    })
})
