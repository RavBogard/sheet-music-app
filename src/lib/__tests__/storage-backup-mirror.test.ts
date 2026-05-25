import { beforeEach, describe, expect, it, vi } from "vitest"
import { createHash } from "node:crypto"
import type { Firestore } from "firebase-admin/firestore"
import {
    runStorageBackup,
    md5Base64ToHex,
    backupFileName,
    fileIdFromBackupName,
    sanitizeStem,
    recordStorageBackupRun,
    writeStorageBackupDormantHeartbeat,
    writeStorageBackupError,
    writeStorageBackupTickStart,
    type StorageBackupDeps,
    type StorageBackupResult,
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

// ── Fail-loud catch path ────────────────────────────────────────────────
//
// `runStorageBackup` wraps its body in a top-level try/catch that writes the
// real exception text into `storageBackups/{date}.error` + sets
// `config/storageBackup.lastError`, then re-throws so the route still 500s.
// Closes the silent-failure gap that hid storage-phase2's first prod 500.
//
// Tests use a broader fake DB that tracks writes to ALL collections (the
// success-path fake is library_index-only — see makeFakeDb above).

interface DocWrite {
    payload: Record<string, unknown>
    merge: boolean
}
function makeMultiCollectionFakeDb(opts?: { failWrites?: Set<string> }) {
    const writes = new Map<string, DocWrite[]>()
    const fail = opts?.failWrites ?? new Set<string>()
    const get = (k: string) => writes.get(k) ?? []

    const db = {
        collection(name: string) {
            return {
                where(_field: string, _op: string, _val: unknown) {
                    return {
                        async get() {
                            // No active rows — keep the test focused on the
                            // pre-loop crash path (ensureFolder throws).
                            return { size: 0, docs: [] as Array<{ id: string; data: () => Record<string, unknown> }> }
                        },
                    }
                },
                doc(id: string) {
                    return {
                        async set(payload: Record<string, unknown>, options?: { merge?: boolean }) {
                            const key = `${name}/${id}`
                            if (fail.has(key)) throw new Error(`fake: write blocked at ${key}`)
                            const arr = writes.get(key) ?? []
                            arr.push({ payload, merge: !!options?.merge })
                            writes.set(key, arr)
                        },
                    }
                },
            }
        },
    } as unknown as Firestore

    return { db, writes, get }
}

function makeThrowingMockDriveOnEnsureFolder(boom: Error) {
    const drive: StorageBackupDeps["drive"] = {
        async ensureFolder() {
            throw boom
        },
        async listFilesByQuery() {
            return { files: [], nextPageToken: null }
        },
        async uploadBinaryFile() {
            throw new Error("should not reach uploadBinaryFile")
        },
        async updateFileMedia() {
            throw new Error("should not reach updateFileMedia")
        },
    }
    return drive
}

describe("runStorageBackup — fail-loud catch", () => {
    const NOW = new Date("2026-05-23T05:00:00.000Z")
    const DATE_KEY = "2026-05-23"

    function makeFailLoudDeps(overrides?: {
        db?: Firestore
        drive?: StorageBackupDeps["drive"]
    }): StorageBackupDeps {
        return {
            db: overrides?.db ?? makeMultiCollectionFakeDb().db,
            drive:
                overrides?.drive ??
                makeThrowingMockDriveOnEnsureFolder(new Error("Drive: insufficient scope")),
            getStorageMd5: async () => null,
            downloadStoragePath: async () => null,
            now: () => NOW,
            backupFolderId: "BK-shared-drive-root",
        }
    }

    it("top-level throw writes storageBackups/{date}.error + config/storageBackup.lastError + re-throws original", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const boom = new Error("Drive: insufficient scope")
        const deps = makeFailLoudDeps({
            db,
            drive: makeThrowingMockDriveOnEnsureFolder(boom),
        })

        await expect(runStorageBackup(deps)).rejects.toThrowError(boom)

        // storageBackups/{date} written with ran:false + the real exception
        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated).toHaveLength(1)
        expect(dated[0].merge).toBe(true)
        expect(dated[0].payload).toMatchObject({
            ran: false,
            lastError: "Drive: insufficient scope",
            error: {
                message: "Drive: insufficient scope",
                name: "Error",
                httpStatus: null,
            },
            timestamp: NOW.toISOString(),
        })
        expect(typeof (dated[0].payload.error as { stack: string }).stack).toBe("string")

        // config/storageBackup additive lastError pointer
        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(1)
        expect(cfg[0].merge).toBe(true)
        expect(cfg[0].payload).toMatchObject({
            lastError: "Drive: insufficient scope",
        })
        expect(cfg[0].payload.lastErrorAt).toBeInstanceOf(Date)
    })

    it("captures err.response.status as httpStatus (axios-style)", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const httpErr = Object.assign(new Error("Forbidden"), {
            response: { status: 403 },
        })
        const deps = makeFailLoudDeps({
            db,
            drive: makeThrowingMockDriveOnEnsureFolder(httpErr),
        })

        await expect(runStorageBackup(deps)).rejects.toThrow()

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated[0].payload).toMatchObject({
            error: { message: "Forbidden", httpStatus: 403 },
        })
    })

    it("captures err.code as httpStatus when present (googleapis-style)", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const gErr = Object.assign(new Error("Not Found"), { code: 404 })
        const deps = makeFailLoudDeps({
            db,
            drive: makeThrowingMockDriveOnEnsureFolder(gErr),
        })

        await expect(runStorageBackup(deps)).rejects.toThrow()

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated[0].payload).toMatchObject({
            error: { httpStatus: 404 },
        })
    })

    it("truncates very long stacks to 2000 chars", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const bigErr = new Error("boom")
        bigErr.stack = "stack-prefix\n" + "x".repeat(5000)
        const deps = makeFailLoudDeps({
            db,
            drive: makeThrowingMockDriveOnEnsureFolder(bigErr),
        })

        await expect(runStorageBackup(deps)).rejects.toThrow()

        const dated = get(`storageBackups/${DATE_KEY}`)
        const stack = (dated[0].payload.error as { stack: string }).stack
        expect(stack.length).toBe(2000)
    })

    it("catch-write failure does NOT double-fault — original error still re-thrown", async () => {
        // Block the breadcrumb writes so the catch's own .set() throws.
        const { db, get } = makeMultiCollectionFakeDb({
            failWrites: new Set([
                `storageBackups/${DATE_KEY}`,
                "config/storageBackup",
            ]),
        })
        const original = new Error("original cause")
        const deps = makeFailLoudDeps({
            db,
            drive: makeThrowingMockDriveOnEnsureFolder(original),
        })

        // The ORIGINAL error must propagate, not the secondary write failure.
        await expect(runStorageBackup(deps)).rejects.toThrowError(original)

        // No writes recorded (both blocked).
        expect(get(`storageBackups/${DATE_KEY}`)).toHaveLength(0)
        expect(get("config/storageBackup")).toHaveLength(0)
    })

    it("successful run does NOT write the error doc (unregressed)", async () => {
        // Reuse the success-path fake (library_index-only) but observe that
        // runStorageBackup itself never writes storageBackups/* on success —
        // that's recordStorageBackupRun's job, a separate function.
        const buf = Buffer.from("%PDF success")
        const objects = new Map([["upload-ok", buf]])
        const rows: Row[] = [
            { id: "upload-ok", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "OK" } },
        ]
        const mock = makeMockDrive()
        const { deps } = makeDeps({ rows, objects, mock })

        // makeFakeDb throws on any non-library_index collection — so a stray
        // catch-path write on the success path would explode the test.
        const res = await runStorageBackup(deps)
        expect(res.ran).toBe(true)
        expect(res.created).toBe(1)
    })
})

// ── lastTickAt + dormant + heartbeat (storage-backup-silent-death-probe) ────
//
// The dormant-skip in `route.ts` (CRC_BACKUP_DRIVE_FOLDER_ID unset) bypasses
// both writers above, so the observability stack was blind to "cron ticked
// but did nothing". Heartbeat writer + lastTickAt stamps close that gap.

describe("storage-backup mirror — lastTickAt + dormant + heartbeat", () => {
    const NOW = new Date("2026-05-24T05:00:00.000Z")
    const DATE_KEY = "2026-05-24"

    it("writeStorageBackupDormantHeartbeat stamps both docs with dormant:true + lastTickAt", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const reason = "CRC_BACKUP_DRIVE_FOLDER_ID env var not configured"

        await writeStorageBackupDormantHeartbeat(db, NOW, reason)

        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(1)
        expect(cfg[0].merge).toBe(true)
        expect(cfg[0].payload).toMatchObject({
            lastTickAt: NOW,
            dormant: true,
            dormantReason: reason,
        })
        // CRITICAL: dormant heartbeat must NOT touch lastBackupAt (would
        // falsely satisfy the staleness check) or lastError (would falsely
        // fire the recentError alarm).
        expect(cfg[0].payload).not.toHaveProperty("lastBackupAt")
        expect(cfg[0].payload).not.toHaveProperty("lastError")

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated).toHaveLength(1)
        expect(dated[0].merge).toBe(true)
        expect(dated[0].payload).toMatchObject({
            ran: false,
            dormant: true,
            dormantReason: reason,
            lastTickAt: NOW,
            timestamp: NOW.toISOString(),
        })
    })

    it("writeStorageBackupDormantHeartbeat fail-opens when Firestore writes throw", async () => {
        const { db } = makeMultiCollectionFakeDb({
            failWrites: new Set([
                "config/storageBackup",
                `storageBackups/${DATE_KEY}`,
            ]),
        })
        // Must NOT throw — the route's dormant path is best-effort and a
        // Firestore outage here should not 500 the cron.
        await expect(
            writeStorageBackupDormantHeartbeat(db, NOW, "reason"),
        ).resolves.toBeUndefined()
    })

    it("recordStorageBackupRun now stamps lastTickAt + dormant:false on success", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const result: StorageBackupResult = {
            ran: true,
            scanned: 5,
            mirrored: 2,
            created: 1,
            updated: 1,
            skipped: 3,
            deferred: 0,
            failed: 0,
            bytesMirrored: 12345,
            errors: [],
            lastError: null,
            partial: false,
            bailedAt: null,
        }

        await recordStorageBackupRun(db, result, NOW)

        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(1)
        expect(cfg[0].payload).toMatchObject({
            lastBackupAt: NOW,
            lastTickAt: NOW,
            dormant: false,
            ran: true,
            scanned: 5,
            created: 1,
        })

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated).toHaveLength(1)
        expect(dated[0].payload).toMatchObject({
            lastTickAt: NOW,
            dormant: false,
            ran: true,
        })
    })

    it("writeStorageBackupError now stamps lastTickAt + dormant:false on failure", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const err = new Error("boom")

        await writeStorageBackupError(db, err, NOW)

        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(1)
        expect(cfg[0].payload).toMatchObject({
            lastError: "boom",
            lastErrorAt: NOW,
            lastTickAt: NOW,
            dormant: false,
        })

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated).toHaveLength(1)
        expect(dated[0].payload).toMatchObject({
            ran: false,
            dormant: false,
            lastTickAt: NOW,
            lastError: "boom",
        })
    })
})

// ── Fix B — writeStorageBackupTickStart pre-flight breadcrumb ───────────
//
// The route calls this at the TOP of `runAndRespond` after `initAdmin` +
// `getFirestore` but BEFORE `runStorageBackupProd`. When Vercel later
// externally kills the function at `maxDuration:300s`, no further write
// happens — the start stamp is the last evidence. PGR-03 trips
// `startedButNotFinished` on the next admin-consistency tick.

describe("storage-backup mirror — writeStorageBackupTickStart (Fix B pre-flight)", () => {
    const NOW = new Date("2026-05-24T05:00:00.000Z")
    const DATE_KEY = "2026-05-24"

    it("stamps lastTickStartedAt on config/storageBackup + startedAt on storageBackups/{date}", async () => {
        const { db, get } = makeMultiCollectionFakeDb()

        await writeStorageBackupTickStart(db, NOW)

        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(1)
        expect(cfg[0].merge).toBe(true)
        expect(cfg[0].payload).toMatchObject({
            lastTickStartedAt: NOW,
        })
        // CRITICAL: a tick-START stamp must NOT touch any END-state fields,
        // else PGR-03 alarms misfire on a started-but-not-yet-done tick.
        expect(cfg[0].payload).not.toHaveProperty("lastBackupAt")
        expect(cfg[0].payload).not.toHaveProperty("lastError")
        expect(cfg[0].payload).not.toHaveProperty("lastErrorAt")
        expect(cfg[0].payload).not.toHaveProperty("lastTickAt")
        expect(cfg[0].payload).not.toHaveProperty("dormant")

        const dated = get(`storageBackups/${DATE_KEY}`)
        expect(dated).toHaveLength(1)
        expect(dated[0].merge).toBe(true)
        expect(dated[0].payload).toMatchObject({
            startedAt: NOW,
            timestamp: NOW.toISOString(),
        })
    })

    it("fail-opens when both Firestore writes throw — the route must not 500", async () => {
        const { db } = makeMultiCollectionFakeDb({
            failWrites: new Set([
                "config/storageBackup",
                `storageBackups/${DATE_KEY}`,
            ]),
        })
        await expect(
            writeStorageBackupTickStart(db, NOW),
        ).resolves.toBeUndefined()
    })

    it("is idempotent within a same-day re-fire (merge:true on both docs)", async () => {
        const { db, get } = makeMultiCollectionFakeDb()
        const LATER = new Date("2026-05-24T05:00:30.000Z") // 30s after first

        await writeStorageBackupTickStart(db, NOW)
        await writeStorageBackupTickStart(db, LATER)

        const cfg = get("config/storageBackup")
        expect(cfg).toHaveLength(2)
        // Latest stamp wins; merge:true preserves any sibling fields the
        // recorder writes later in the same tick.
        expect(cfg[1].merge).toBe(true)
        expect(cfg[1].payload).toMatchObject({ lastTickStartedAt: LATER })
    })
})

// ── Fix B — per-row time-budget guard (partial:true + bailedAt) ─────────
//
// The mirror's per-row try/catch swallows individual failures and continues.
// With a 3× exponential-backoff retry per row at the Drive layer, a single
// failing endpoint can blow past Vercel's 300s `maxDuration` ceiling and
// trigger an external function kill. The pre-loop budget guard avoids ever
// reaching that ceiling: when wall-clock elapsed since the for-loop start
// crosses `budgetMs`, the loop bails — remaining rows fold into `deferred`
// and the next tick picks them up idempotently.

describe("runStorageBackup — per-row time-budget guard (Fix B)", () => {
    it("bails the loop when wall-clock elapsed crosses budgetMs; remaining rows defer; partial:true + bailedAt set", async () => {
        const RUN_START = new Date("2026-05-24T05:00:00.000Z").getTime()
        // Advance the fake clock by 100ms on every now() call so that:
        //   - the run-start anchor lands at t=0
        //   - after a few iterations the elapsed reading crosses the budget
        let nowCalls = 0
        const advancingNow = () => new Date(RUN_START + nowCalls++ * 100)

        // 6 active rows. Budget is 250ms with the 100ms-per-now() clock, so
        // the guard trips before the loop processes all of them. The exact
        // count after the first row processed depends on how many now() calls
        // happen per iteration; the assertions below check the invariants
        // (partial:true + scanned==6 + deferred>=1 + a bailedAt iso), NOT a
        // specific deferred count, so the test is robust against minor inner-
        // loop calling changes.
        const rows: Row[] = []
        const objects = new Map<string, Buffer>()
        for (let i = 0; i < 6; i++) {
            objects.set(`u${i}`, Buffer.from(`%PDF body ${i}`))
            rows.push({
                id: `u${i}`,
                data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: `Stem${i}` },
            })
        }
        const mock = makeMockDrive()
        const readers = makeStorageReaders(objects, mock.downloadCalls)
        const deps: StorageBackupDeps = {
            db: makeFakeDb(rows),
            drive: mock.drive,
            getStorageMd5: readers.getStorageMd5,
            downloadStoragePath: readers.downloadStoragePath,
            now: advancingNow,
            backupFolderId: "BK-shared-drive-root",
            budgetMs: 250,
        }

        const res = await runStorageBackup(deps)

        expect(res.scanned).toBe(6)
        expect(res.partial).toBe(true)
        expect(typeof res.bailedAt).toBe("string")
        expect(res.bailedAt).toMatch(/^2026-05-24T05:00:/)
        // some rows processed before bail + remaining deferred; sum = scanned
        expect(res.created + res.skipped + res.updated + res.failed + res.deferred).toBe(6)
        expect(res.deferred).toBeGreaterThanOrEqual(1)
    })

    it("does NOT mark partial when the run finishes inside the budget", async () => {
        const NOW = new Date("2026-05-24T05:00:00.000Z")
        const buf = Buffer.from("%PDF tiny")
        const objects = new Map([["upload-x", buf]])
        const rows: Row[] = [
            { id: "upload-x", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Tiny" } },
        ]
        const mock = makeMockDrive()
        const { deps } = makeDeps({ rows, objects, mock })
        // Override budget to a generous value (default 240000 is also fine
        // since the test now() returns a frozen Date).
        deps.budgetMs = 600_000
        deps.now = () => NOW

        const res = await runStorageBackup(deps)

        expect(res.partial).toBe(false)
        expect(res.bailedAt).toBe(null)
        expect(res.created).toBe(1)
    })

    it("budgetMs=0 disables the guard entirely (Infinity semantic; test-only convenience)", async () => {
        const RUN_START = new Date("2026-05-24T05:00:00.000Z").getTime()
        // Advance fake clock 1 minute per call — would trip ANY positive budget
        let nowCalls = 0
        const advancingNow = () => new Date(RUN_START + nowCalls++ * 60_000)

        const objects = new Map([["upload-y", Buffer.from("%PDF y")]])
        const rows: Row[] = [
            { id: "upload-y", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Y" } },
        ]
        const mock = makeMockDrive()
        const readers = makeStorageReaders(objects, mock.downloadCalls)
        const deps: StorageBackupDeps = {
            db: makeFakeDb(rows),
            drive: mock.drive,
            getStorageMd5: readers.getStorageMd5,
            downloadStoragePath: readers.downloadStoragePath,
            now: advancingNow,
            backupFolderId: "BK-shared-drive-root",
            budgetMs: 0,
        }

        const res = await runStorageBackup(deps)

        expect(res.partial).toBe(false)
        expect(res.bailedAt).toBe(null)
        expect(res.created).toBe(1)
    })

    it("recordStorageBackupRun forwards partial + bailedAt into the audit doc + pointer", async () => {
        const NOW = new Date("2026-05-24T05:01:00.000Z")
        const DATE_KEY = "2026-05-24"
        const { db, get } = makeMultiCollectionFakeDb()
        const result: StorageBackupResult = {
            ran: true,
            scanned: 100,
            mirrored: 40,
            created: 30,
            updated: 10,
            skipped: 20,
            deferred: 40,
            failed: 0,
            bytesMirrored: 9001,
            errors: [],
            lastError: null,
            partial: true,
            bailedAt: "2026-05-24T05:00:55.000Z",
        }

        await recordStorageBackupRun(db, result, NOW)

        const cfg = get("config/storageBackup")
        expect(cfg[0].payload).toMatchObject({
            // Partial runs STILL stamp lastBackupAt — partial completion is
            // still a successful tick; deferred rows ride the next tick.
            lastBackupAt: NOW,
            partial: true,
            bailedAt: "2026-05-24T05:00:55.000Z",
        })
        const audit = get(`storageBackups/${DATE_KEY}`)
        expect(audit[0].payload).toMatchObject({
            partial: true,
            bailedAt: "2026-05-24T05:00:55.000Z",
            deferred: 40,
        })
    })
})

// ── Fix B — verbose Drive errors[] body capture in per-row catch ───────
//
// The 2026-05-24T05:00Z prod silent-death log surfaced a Drive 400 whose
// `err.message` collapsed to "Bad Request" while the real Drive error body
// (the `errors[]` JSON with `reason`/`message`/`location`) was redacted by
// gaxios. The per-row catch must extract that body into the recorded
// `lastError` string so the next failure self-diagnoses.

describe("runStorageBackup — verbose Drive error capture (Fix B)", () => {
    function makeUploadFailingDrive(uploadErr: unknown) {
        const drive: StorageBackupDeps["drive"] = {
            async ensureFolder({ name, parentId }) {
                return folderIdFor(parentId, name)
            },
            async listFilesByQuery() {
                return { files: [], nextPageToken: null }
            },
            async uploadBinaryFile() {
                throw uploadErr
            },
            async updateFileMedia() {
                throw new Error("should not reach updateFileMedia")
            },
        }
        return drive
    }

    function makeDepsWithDrive(drive: StorageBackupDeps["drive"]): StorageBackupDeps {
        const buf = Buffer.from("%PDF tiny")
        const objects = new Map([["upload-err", buf]])
        const rows: Row[] = [
            { id: "upload-err", data: { status: "active", collection: "uploads", mimeType: "application/pdf", stem: "Err" } },
        ]
        const downloadCalls: string[] = []
        const readers = makeStorageReaders(objects, downloadCalls)
        return {
            db: makeFakeDb(rows),
            drive,
            getStorageMd5: readers.getStorageMd5,
            downloadStoragePath: readers.downloadStoragePath,
            now: () => new Date("2026-05-24T05:00:00.000Z"),
            backupFolderId: "BK-shared-drive-root",
        }
    }

    it("captures err.response.data.error envelope (gaxios Drive 400 shape) into lastError", async () => {
        // Exact shape Drive returns for a permissions-class 400 — the body
        // gaxios's redactor was hiding before Fix B.
        const driveBody = {
            error: {
                code: 400,
                message: "Bad Request",
                errors: [
                    {
                        domain: "global",
                        reason: "badRequest",
                        message:
                            "Service Accounts do not have storage quota. Specify a Shared Drive.",
                    },
                ],
            },
        }
        const uploadErr = Object.assign(new Error("Bad Request"), {
            response: { status: 400, data: driveBody },
            code: 400,
        })
        const deps = makeDepsWithDrive(makeUploadFailingDrive(uploadErr))

        const res = await runStorageBackup(deps)

        expect(res.failed).toBe(1)
        expect(res.lastError).toBeTruthy()
        // base message preserved AND verbose Drive body appended after `|`
        expect(res.lastError).toContain("Bad Request")
        expect(res.lastError).toContain("badRequest")
        expect(res.lastError).toContain("Shared Drive")
        // fileId prefix preserved (existing pushErr contract)
        expect(res.lastError).toMatch(/^upload-err: /)
        expect(res.errors).toHaveLength(1)
    })

    it("captures a top-level errors[] (legacy googleapis shape) when response.data is missing", async () => {
        const uploadErr = Object.assign(new Error("Forbidden"), {
            errors: [
                { reason: "insufficientPermissions", message: "lacks role X" },
            ],
        })
        const deps = makeDepsWithDrive(makeUploadFailingDrive(uploadErr))

        const res = await runStorageBackup(deps)

        expect(res.lastError).toContain("Forbidden")
        expect(res.lastError).toContain("insufficientPermissions")
    })

    it("falls back to err.message when no structured Drive body is attached", async () => {
        const uploadErr = new Error("plain network blip")
        const deps = makeDepsWithDrive(makeUploadFailingDrive(uploadErr))

        const res = await runStorageBackup(deps)

        expect(res.lastError).toBe("upload-err: plain network blip")
    })

    it("truncates very long Drive error bodies to ~1000 chars to keep the Firestore doc small", async () => {
        const huge = "z".repeat(5000)
        const uploadErr = Object.assign(new Error("Boom"), {
            response: { data: { error: { message: huge, errors: [] } } },
        })
        const deps = makeDepsWithDrive(makeUploadFailingDrive(uploadErr))

        const res = await runStorageBackup(deps)

        // base "Boom" + " | " + body (capped). The verbose chunk after the
        // pipe must stay under the 1000-char per-segment ceiling.
        expect(res.lastError).toBeTruthy()
        const afterPipe = (res.lastError as string).split(" | ")[1] ?? ""
        expect(afterPipe.length).toBeLessThanOrEqual(1000)
    })
})
