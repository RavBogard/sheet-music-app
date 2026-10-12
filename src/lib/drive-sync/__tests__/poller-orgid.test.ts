/**
 * Multi-tenant phase 2 — Drive poller (shared by the chart inbox):
 *  - W5: a NEW Drive file goes to processChartUpload with orgId 'crc' (the
 *    Drive inbox is CRC's; phase 6 makes it per-tenant config);
 *  - W11: a REPLACE (md5 advanced) rewrites Storage bytes with the EXISTING
 *    row's tenant (rowOrg(row.orgId)) as the object's customMetadata.orgId.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
    upload: vi.fn(async (..._args: unknown[]) => "gs://b/p"),
}))

vi.mock("@/lib/firebase-storage", () => ({ uploadToStorage: h.upload }))
vi.mock("@/lib/library-upload", () => ({ processChartUpload: vi.fn() }))
vi.mock("@/lib/google-drive", () => ({ DriveClient: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { runDriveSync, type DriveSyncDeps } from "@/lib/drive-sync/poller"

const PARENT = "parentFolder"

/** Minimal in-memory Admin-Firestore fake: doc get/set/update/delete + where(==)[.select|.limit].get. */
function fakeDb(seed: Record<string, Record<string, Record<string, unknown>>>) {
    const store = new Map<string, Map<string, Record<string, unknown>>>()
    for (const [c, docs] of Object.entries(seed)) store.set(c, new Map(Object.entries(docs)))
    const col = (name: string) => {
        if (!store.has(name)) store.set(name, new Map())
        return store.get(name)!
    }
    const snapOf = (name: string, id: string) => {
        const d = col(name).get(id)
        return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) }
    }
    const query = (name: string, field: string, value: unknown) => {
        const run = async () => {
            const docs = [...col(name).entries()]
                .filter(([, d]) => d[field] === value)
                .map(([id]) => snapOf(name, id))
            return { empty: docs.length === 0, size: docs.length, docs }
        }
        const q: Record<string, unknown> = { get: run }
        q.limit = () => q
        q.select = () => q
        q.where = () => q
        return q
    }
    const db = {
        collection: (name: string) => ({
            doc: (id: string) => ({
                get: async () => snapOf(name, id),
                set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
                    col(name).set(id, opts?.merge ? { ...(col(name).get(id) ?? {}), ...data } : { ...data })
                },
                update: async (data: Record<string, unknown>) => {
                    if (!col(name).has(id)) throw new Error("NOT_FOUND")
                    col(name).set(id, { ...col(name).get(id), ...data })
                },
                delete: async () => {
                    col(name).delete(id)
                },
            }),
            where: (field: string, _op: string, value: unknown) => query(name, field, value),
        }),
    }
    return { db, store }
}

function deps(
    db: unknown,
    files: Array<Record<string, unknown>>,
    processor = vi.fn(async (_input: Record<string, unknown>) => ({ ok: true, fileId: "upload-x", title: "t" })),
) {
    const listFilesByQuery = vi.fn(async (args: { q: string }) => ({
        files: args.q.includes("mimeType = 'application/vnd.google-apps.folder'") ? [] : files,
        nextPageToken: null,
    }))
    return {
        processor,
        deps: {
            drive: {
                listFilesByQuery,
                getFile: vi.fn(async () => new Uint8Array(Buffer.from("%PDF-1.7 replaced bytes")).buffer),
                getFileMetadata: vi.fn(),
            },
            db,
            processor,
            now: () => new Date("2026-10-12T12:00:00Z"),
        } as unknown as DriveSyncDeps,
    }
}

const watchState = {
    driveWatchState: {
        [PARENT]: { lastPollAt: "2026-10-01T00:00:00Z", subfolderIds: [], collectionMap: {} },
    },
}

beforeEach(() => {
    h.upload.mockClear()
})

describe("drive-sync poller orgId", () => {
    it("W5: a new Drive file is imported with orgId 'crc'", async () => {
        const { db } = fakeDb({ ...watchState })
        const { deps: d, processor } = deps(db, [
            { id: "drive-new", name: "New Song.pdf", mimeType: "application/pdf", modifiedTime: "2026-10-12T10:00:00Z", parents: [PARENT], md5Checksum: "m1" },
        ])
        const res = await runDriveSync({ deps: d, parentFolderId: PARENT })
        expect(res.imported).toBe(1)
        expect(processor).toHaveBeenCalledTimes(1)
        expect(processor.mock.calls[0][0].orgId).toBe("crc")
    })

    it("W11: a replace rewrites Storage with the existing row's tenant", async () => {
        const { db } = fakeDb({
            ...watchState,
            library_index: {
                "row-bl": {
                    driveFileId: "drive-bl",
                    orgId: "brotherslazaroff",
                    name: "BL Song",
                    originalName: "BL Song.pdf",
                    mimeType: "application/pdf",
                    driveMd5: "old-md5",
                    collection: "supplemental",
                    driveParents: [PARENT],
                },
            },
        })
        const { deps: d } = deps(db, [
            { id: "drive-bl", name: "BL Song.pdf", mimeType: "application/pdf", modifiedTime: "2026-10-12T10:00:00Z", parents: [PARENT], md5Checksum: "new-md5" },
        ])
        const res = await runDriveSync({ deps: d, parentFolderId: PARENT })
        expect(res.replaced).toBe(1)
        expect(h.upload).toHaveBeenCalledTimes(1)
        expect(h.upload.mock.calls[0][0]).toBe("row-bl")
        expect(h.upload.mock.calls[0][3]).toBe("brotherslazaroff")
    })

    it("W11: an unstamped legacy row replaces with 'crc' (rowOrg default)", async () => {
        const { db } = fakeDb({
            ...watchState,
            library_index: {
                "row-old": {
                    driveFileId: "drive-old",
                    name: "Old Song",
                    originalName: "Old Song.pdf",
                    mimeType: "application/pdf",
                    driveMd5: "old-md5",
                    collection: "supplemental",
                    driveParents: [PARENT],
                },
            },
        })
        const { deps: d } = deps(db, [
            { id: "drive-old", name: "Old Song.pdf", mimeType: "application/pdf", modifiedTime: "2026-10-12T10:00:00Z", parents: [PARENT], md5Checksum: "new-md5" },
        ])
        await runDriveSync({ deps: d, parentFolderId: PARENT })
        expect(h.upload.mock.calls[0][3]).toBe("crc")
    })
})
