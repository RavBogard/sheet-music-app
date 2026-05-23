import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
import type { Firestore } from "firebase-admin/firestore"
import {
    runStorageBackup,
    md5Base64ToHex,
    backupFileName,
    fileIdFromBackupName,
    sanitizeStem,
    type StorageBackupDeps,
} from "@/lib/storage-backup/mirror"

/**
 * storage-phase2 — Storage→Drive mirror logic (pure: fake db + mock Drive + mock
 * Storage readers via DI). Covers absent→create, match→skip (no download),
 * differ→update, pointer-on-row write, md5 base64↔hex, per-run cap, missing
 * Storage object, and fileId-keyed lookup surviving a stem rename.
 */

const md5b64 = (b: Buffer) => createHash("md5").update(b).digest("base64")
const md5hex = (b: Buffer) => createHash("md5").update(b).digest("hex")

// ── Fake Firestore (only the surface runStorageBackup touches) ──
interface Row {
    id: string
    data: Record<string, unknown>
}
function makeFakeDb(rows: Row[]) {
    return {
        collection(name: string) {
            if (name !== "library_index") throw new Error(`unexpected collection ${name}`)
            return {
                where(field: string, _op: string, val: unknown) {
                    return {
                        async get() {
                            const docs = rows
                                .filter((r) => r.data[field] === val)
                                .map((r) => ({ id: r.id, data: () => r.data }))
                            return { size: docs.length, docs }
                        },
                    }
                },
                doc(id: string) {
                    return {
                        async set(payload: Record<string, unknown>) {
                            const row = rows.find((r) => r.id === id)
                            if (row) Object.assign(row.data, payload)
                        },
                    }
                },
            }
        },
    } as unknown as Firestore
}

// ── Mock Drive (deterministic folder ids so the test can pre-seed backups) ──
const BK = "BK-shared-drive-root"
function folderIdFor(parentId: string, name: string) {
    return `folder:${parentId}::${name}`
}
function collectionFolderId(collection: string) {
    return folderIdFor(folderIdFor(BK, "charts"), collection)
}

function makeMockDrive() {
    // folderId → backup files
    const filesByFolder = new Map<string, Array<{ id: string; name: string; md5Checksum?: string }>>()
    const created: Array<Record<string, unknown>> = []
    const updated: Array<{ fileId: string; size: number }> = []
    const downloadCalls: string[] = []
    let seq = 0

    const drive: StorageBackupDeps["drive"] = {
        async ensureFolder({ name, parentId }) {
            return folderIdFor(parentId, name)
        },
        async listFilesByQuery({ q }) {
            const m = q.match(/'([^']+)'\s+in\s+parents/)
            const folderId = m?.[1]
            const files = (folderId && filesByFolder.get(folderId)) || []
            return {
                files: files.map((f) => ({ id: f.id, name: f.name, md5Checksum: f.md5Checksum })),
                nextPageToken: null,
            }
        },
        async uploadBinaryFile({ name, buffer, parents, appProperties }) {
            const id = `drivefile-${++seq}`
            const folderId = parents?.[0] ?? "?"
            const arr = filesByFolder.get(folderId) ?? []
            arr.push({ id, name, md5Checksum: md5hex(buffer) })
            filesByFolder.set(folderId, arr)
            created.push({ id, name, parents, appProperties, size: buffer.byteLength })
            return { id, name, md5Checksum: md5hex(buffer), size: String(buffer.byteLength) }
        },
        async updateFileMedia(fileId, buffer) {
            for (const arr of filesByFolder.values()) {
                const f = arr.find((x) => x.id === fileId)
                if (f) f.md5Checksum = md5hex(buffer)
            }
            updated.push({ fileId, size: buffer.byteLength })
            return { id: fileId, md5Checksum: md5hex(buffer), size: String(buffer.byteLength) }
        },
    }

    function seedBackup(collection: string, fileEntry: { id: string; name: string; md5Checksum: string }) {
        const folderId = collectionFolderId(collection)
        const arr = filesByFolder.get(folderId) ?? []
        arr.push(fileEntry)
        filesByFolder.set(folderId, arr)
    }

    return { drive, created, updated, downloadCalls, seedBackup, filesByFolder }
}

// ── Mock Storage readers ──
function makeStorageReaders(objects: Map<string, Buffer>, downloadCalls: string[]) {
    const getStorageMd5: StorageBackupDeps["getStorageMd5"] = async (fileId) => {
        const buf = objects.get(fileId)
        if (!buf) return null
        return { md5Base64: md5b64(buf), size: buf.byteLength, path: `library/${fileId}` }
    }
    const downloadStoragePath: StorageBackupDeps["downloadStoragePath"] = async (path) => {
        downloadCalls.push(path)
        const fileId = path.replace(/^library\//, "")
        const buf = objects.get(fileId)
        if (!buf) return null
        return { buffer: buf, contentType: "application/pdf" }
    }
    return { getStorageMd5, downloadStoragePath }
}

function makeDeps(opts: {
    rows: Row[]
    objects: Map<string, Buffer>
    backupFolderId?: string | undefined
    maxMirrorsPerRun?: number
    mock: ReturnType<typeof makeMockDrive>
}): { deps: StorageBackupDeps; rows: Row[] } {
    const readers = makeStorageReaders(opts.objects, opts.mock.downloadCalls)
    const deps: StorageBackupDeps = {
        db: makeFakeDb(opts.rows),
        drive: opts.mock.drive,
        getStorageMd5: readers.getStorageMd5,
        downloadStoragePath: readers.downloadStoragePath,
        now: () => new Date("2026-05-23T05:00:00.000Z"),
        backupFolderId: opts.backupFolderId === undefined ? BK : opts.backupFolderId,
        maxMirrorsPerRun: opts.maxMirrorsPerRun,
    }
    return { deps, rows: opts.rows }
}

describe("storage-backup pure helpers", () => {
    it("md5Base64ToHex matches the hex digest of the same bytes (Storage b64 → Drive hex)", () => {
        const buf = Buffer.from("some chart bytes")
        expect(md5Base64ToHex(md5b64(buf))).toBe(md5hex(buf))
    })

    it("backupFileName builds <stem>__<fileId><ext>", () => {
        expect(backupFileName("Adon Olam", "upload-abc", "application/pdf")).toBe("Adon Olam__upload-abc.pdf")
        expect(backupFileName("Kedusha", "1xY", "application/xml")).toBe("Kedusha__1xY.xml")
        expect(backupFileName("Niggun", "id9", "audio/mpeg")).toBe("Niggun__id9.mp3")
    })

    it("fileIdFromBackupName extracts the fileId after the last __ (survives stems with no delimiter)", () => {
        expect(fileIdFromBackupName("Adon Olam__upload-abc.pdf")).toBe("upload-abc")
        expect(fileIdFromBackupName("Some Song__1AbC.xml")).toBe("1AbC")
        expect(fileIdFromBackupName("nodelim.pdf")).toBeNull()
    })

    it("sanitizeStem strips path/control chars and caps length", () => {
        expect(sanitizeStem("a/b\\c")).toBe("a-b-c")
        expect(sanitizeStem("  multi   space  ")).toBe("multi space")
        expect(sanitizeStem("")).toBe("chart")
        expect(sanitizeStem("x".repeat(200)).length).toBe(120)
    })
})

describe("runStorageBackup", () => {
    let mock: ReturnType<typeof makeMockDrive>
    beforeEach(() => {
        mock = makeMockDrive()
    })

    it("is a graceful no-op when backupFolderId is unset", async () => {
        const objects = new Map([["upload-1", Buffer.from("%PDF a")]])
        const { deps } = makeDeps({
            rows: [{ id: "upload-1", data: { status: "active", collection: "uploads", mimeType: "application/pdf" } }],
            objects,
            backupFolderId: "", // explicit empty → dormant
            mock,
        })
        const res = await runStorageBackup(deps)
        expect(res.ran).toBe(false)
        expect(mock.created).toHaveLength(0)
    })

    it("absent → CREATE: streams bytes, stamps crcBackup, writes backupDriveId pointer", async () => {
        const buf = Buffer.from("%PDF-1.4 Adon Olam")
        const objects = new Map([["upload-1", buf]])
        const rows: Row[] = [
            { id: "upload-1", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Adon Olam" } },
        ]
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res).toMatchObject({ ran: true, scanned: 1, created: 1, mirrored: 1, updated: 0, skipped: 0, failed: 0 })
        expect(res.bytesMirrored).toBe(buf.byteLength)
        expect(mock.created).toHaveLength(1)
        expect(mock.created[0]).toMatchObject({
            name: "Adon Olam__upload-1.pdf",
            appProperties: { crcBackup: "1" },
            parents: [collectionFolderId("uploads")],
        })
        // pointer-on-row recorded
        expect(rows[0].data.backupDriveId).toBe(mock.created[0].id)
    })

    it("match → SKIP: identical md5 means no download and no Drive write (pointer healed if missing)", async () => {
        const buf = Buffer.from("%PDF-1.4 identical")
        const objects = new Map([["upload-2", buf]])
        const rows: Row[] = [
            { id: "upload-2", data: { status: "active", collection: "core", mimeType: "application/pdf", stem: "Barchu" } },
        ]
        mock.seedBackup("core", { id: "existing-drive-id", name: "Barchu__upload-2.pdf", md5Checksum: md5hex(buf) })
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res).toMatchObject({ created: 0, updated: 0, skipped: 1, mirrored: 0 })
        expect(mock.downloadCalls).toHaveLength(0) // steady-state: zero downloads
        expect(mock.updated).toHaveLength(0)
        // pointer healed to the existing backup file
        expect(rows[0].data.backupDriveId).toBe("existing-drive-id")
    })

    it("differ → UPDATE media (keeps revision), keeps the same Drive id, sets pointer", async () => {
        const newBytes = Buffer.from("%PDF-1.4 v2 re-uploaded")
        const objects = new Map([["upload-3", newBytes]])
        const rows: Row[] = [
            { id: "upload-3", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Mizmor" } },
        ]
        mock.seedBackup("uploads", { id: "drive-old", name: "Mizmor__upload-3.pdf", md5Checksum: md5hex(Buffer.from("old v1")) })
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res).toMatchObject({ created: 0, updated: 1, mirrored: 1, skipped: 0 })
        expect(mock.updated).toEqual([{ fileId: "drive-old", size: newBytes.byteLength }])
        expect(mock.downloadCalls).toHaveLength(1)
        expect(rows[0].data.backupDriveId).toBe("drive-old")
    })

    it("finds an existing backup by embedded fileId even after a stem rename (no duplicate create)", async () => {
        const buf = Buffer.from("%PDF-1.4 stable bytes")
        const objects = new Map([["upload-4", buf]])
        // Row stem is now "New Title" but the backup was made under "Old Title".
        const rows: Row[] = [
            { id: "upload-4", data: { status: "active", collection: "core", mimeType: "application/pdf", stem: "New Title" } },
        ]
        mock.seedBackup("core", { id: "drive-keep", name: "Old Title__upload-4.pdf", md5Checksum: md5hex(buf) })
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res).toMatchObject({ created: 0, skipped: 1 })
        expect(mock.created).toHaveLength(0)
        expect(rows[0].data.backupDriveId).toBe("drive-keep")
    })

    it("skips active rows that have no Storage object (reconcile's job, not backup's)", async () => {
        const objects = new Map<string, Buffer>() // empty: no bytes
        const rows: Row[] = [
            { id: "upload-5", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Ghost" } },
        ]
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res).toMatchObject({ created: 0, skipped: 1, failed: 0 })
        expect(res.errors.some((e) => e.includes("no Storage object"))).toBe(true)
    })

    it("honors maxMirrorsPerRun, deferring the rest for the next tick", async () => {
        const objects = new Map<string, Buffer>()
        const rows: Row[] = []
        for (let i = 0; i < 3; i++) {
            objects.set(`u${i}`, Buffer.from(`%PDF ${i}`))
            rows.push({ id: `u${i}`, data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: `S${i}` } })
        }
        const { deps } = makeDeps({ rows, objects, maxMirrorsPerRun: 2, mock })

        const res = await runStorageBackup(deps)

        expect(res.created).toBe(2)
        expect(res.deferred).toBe(1)
        expect(res.scanned).toBe(3)
    })

    it("ignores non-active rows in the scan", async () => {
        const objects = new Map([["u-active", Buffer.from("%PDF a")]])
        const rows: Row[] = [
            { id: "u-active", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Live" } },
            { id: "u-orphan", data: { status: "orphaned", collection: "uploads", mimeType: "application/pdf", stem: "Dead" } },
        ]
        const { deps } = makeDeps({ rows, objects, mock })

        const res = await runStorageBackup(deps)

        expect(res.scanned).toBe(1)
        expect(res.created).toBe(1)
    })
})
