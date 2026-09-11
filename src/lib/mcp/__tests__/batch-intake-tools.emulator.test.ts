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
 * Batch chart intake — the seven MCP tools against the Firestore emulator.
 *
 * What is real here: Firestore (batch documents, item maps, counts, the
 * library_index row `bind` verifies against) and every gate the tools apply.
 *
 * What is faked, and why:
 *  - Storage — the v4 signed-URL ceremony needs real service-account
 *    credentials the emulator does not simulate. The in-memory path-keyed store
 *    (pattern from `mcp-upload-session.emulator.test.ts`) makes "the bytes
 *    landed" a real save→exists→getMetadata round-trip, which is what commit's
 *    reconciliation actually reads.
 *  - Inngest — `enqueueImportBatch` is a transport; the commit path's contract
 *    is "queued true / queued false", not "an event reached Inngest".
 *  - `processChartUpload` — the canonical pipeline has its own tests; here it
 *    only has to be reachable from the `force` resolution path.
 *  - `DriveClient` — a literal fake listing two files, so the Drive folder
 *    path is tested without a network or a service account.
 */

vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: vi.fn().mockResolvedValue(null),
}))

const stagedStore = new Map<string, Buffer>()
/** path -> error thrown by that object's `getMetadata`, for the outage case. */
const metadataFailures = new Map<string, Error>()
const mockGetSignedUrl = vi.fn()
const mockStagedFile = vi.fn((path: string) => ({
    getSignedUrl: mockGetSignedUrl,
    save: async (data: Buffer) => {
        stagedStore.set(path, Buffer.from(data))
    },
    exists: async () => [stagedStore.has(path)],
    getMetadata: async () => {
        const boom = metadataFailures.get(path)
        if (boom) throw boom
        if (!stagedStore.has(path)) throw notFound()
        return [{ size: String(stagedStore.get(path)!.byteLength) }]
    },
    download: async () => {
        if (!stagedStore.has(path)) throw notFound()
        return [stagedStore.get(path)!]
    },
    delete: async () => {
        if (!stagedStore.has(path)) throw notFound()
        stagedStore.delete(path)
    },
}))
function notFound(): Error & { code?: number } {
    const err = new Error("No such object") as Error & { code?: number }
    err.code = 404
    return err
}
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: mockStagedFile,
            getFiles: async (opts: { prefix: string }) => [
                [...stagedStore.keys()]
                    .filter((k) => k.startsWith(opts.prefix))
                    .map((name) => ({ name })),
            ],
        }),
    }),
}))

type EnqueueResult = { ok: true; eventId: string } | { ok: false; message: string }
const mockEnqueue = vi.fn<(batchId: string) => Promise<EnqueueResult>>()
vi.mock("@/lib/intake/enqueue", () => ({
    enqueueImportBatch: (batchId: string) => mockEnqueue(batchId),
}))

const mockProcessChartUpload = vi.fn()
vi.mock("@/lib/library-upload", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/library-upload")>(
            "@/lib/library-upload",
        )
    return {
        ...actual,
        processChartUpload: (...args: unknown[]) => mockProcessChartUpload(...args),
    }
})

const driveFiles: Array<Record<string, unknown>> = []
vi.mock("@/lib/google-drive", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/google-drive")>(
            "@/lib/google-drive",
        )
    return {
        ...actual,
        DriveClient: class {
            async listFilesByQuery() {
                return { files: driveFiles, nextPageToken: undefined }
            }
            async getFileMetadata(id: string) {
                return driveFiles.find((f) => f.id === id) ?? null
            }
            async getFile() {
                return Buffer.from("drive bytes")
            }
            async fetchAsPdf() {
                return Buffer.from("pdf bytes")
            }
        },
    }
})

import {
    appendBatchItemChunk,
    commitUploadBatch,
    getUploadBatch,
    importDriveFolder,
    listParkedUploads,
    openChartDropzone,
    requestBatchUploadUrls,
    resolveUploadItem,
} from "../tools/batch-intake"
import { addItems, getBatch, updateItem } from "@/lib/intake/batch-store"
import { stagedObjectPath } from "@/lib/intake/staged-storage"
import {
    BATCH_COLLECTION,
    MAX_ITEM_BYTES,
    MAX_ITEMS_PER_BATCH,
} from "@/lib/intake/batch-types"

const ORG = "crc"
const OTHER_ORG = "lazaroff"
const LEADER = "u-leader"
const MEMBER = "u-member"
const ADMIN = "u-admin"
const STRANGER = "u-stranger"

/** Narrow a tool result to its success branch, failing loudly if it errored. */
function ok<T>(result: T): Exclude<T, { ok: false }> {
    if (!(result as { ok?: boolean })?.ok) {
        throw new Error(`expected ok result, got ${JSON.stringify(result)}`)
    }
    return result as Exclude<T, { ok: false }>
}

function machineCode(result: unknown): string | undefined {
    return (result as { error?: { machine_code?: string } })?.error?.machine_code
}

describe("batch intake MCP tools (emulator)", () => {
    let app: App

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-batch-intake" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        for (const col of [BATCH_COLLECTION, "users", "library_index"]) {
            const snap = await db().collection(col).get()
            await Promise.all(snap.docs.map((d) => d.ref.delete()))
        }
        // `loadUploader` reads a flat `role` string + `canUpload` flag.
        await db()
            .collection("users")
            .doc(LEADER)
            .set({ role: "band_leader", email: "leader@example.com" })
        await db().collection("users").doc(ADMIN).set({ role: "admin" })
        await db().collection("users").doc(MEMBER).set({ role: "member" })
        await db().collection("users").doc(STRANGER).set({ role: "musician" })

        stagedStore.clear()
        metadataFailures.clear()
        driveFiles.length = 0
        mockGetSignedUrl.mockReset()
        mockGetSignedUrl.mockResolvedValue(["https://signed.example/put"])
        mockEnqueue.mockReset()
        mockEnqueue.mockResolvedValue({ ok: true, eventId: "evt" })
        mockProcessChartUpload.mockReset()
    })

    // ─── open_chart_dropzone ─────────────────────────────────────────────

    it("refuses to open a dropzone for a member with no upload permission", async () => {
        const r = await openChartDropzone(MEMBER, ORG, {})
        expect(r.ok).toBe(false)
        expect(machineCode(r)).toBe("forbidden_role")
    })

    it("opens a batch for a band leader and reports the client-side caps", async () => {
        const r = ok(await openChartDropzone(LEADER, ORG, { collection: "core" }))

        expect(r.batchId).toMatch(/^ub-/)
        expect(r.defaults).toEqual({ collection: "core" })
        expect(r.maxFileBytes).toBe(25 * 1024 * 1024)
        expect(r.maxFilesPerRequest).toBe(50)
        expect(r.acceptedExtensions).toContain(".pdf")
        expect(r.acceptedExtensions).toContain(".mxl")
        expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now())

        const doc = await getBatch(db(), r.batchId)
        expect(doc?.ownerUid).toBe(LEADER)
        expect(doc?.orgId).toBe(ORG)
        expect(doc?.source).toBe("dropzone")
        expect(doc?.status).toBe("open")
    })

    it("refuses a curated collection for a caller who is not a trusted leader", async () => {
        const r = await openChartDropzone(STRANGER, ORG, { collection: "core" })
        expect(r.ok).toBe(false)
        expect(machineCode(r)).toBe("forbidden_role")
    })

    // ─── request_batch_upload_urls ───────────────────────────────────────

    it("mints URLs for supported files and reports the rest as rejected", async () => {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))

        const r = ok(
            await requestBatchUploadUrls(LEADER, ORG, {
                batchId: batch.batchId,
                files: [
                    { fileName: "A.pdf", mimeType: "application/pdf", sizeBytes: 10 },
                    {
                        fileName: "B.mxl",
                        mimeType: "application/octet-stream",
                        sizeBytes: 20,
                    },
                    {
                        fileName: "C.docx",
                        mimeType:
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        sizeBytes: 30,
                    },
                ],
            }),
        )

        expect(r.items).toHaveLength(2)
        expect(r.items.map((i) => i.fileName)).toEqual(["A.pdf", "B.mxl"])
        expect(r.rejected).toEqual([
            { fileName: "C.docx", reason: "unsupported_type" },
        ])

        // The octet-stream .mxl recovers its real mime from the extension.
        expect(r.items[1].requiredHeaders["Content-Type"]).toBe(
            "application/vnd.recordare.musicxml",
        )
        expect(r.items[0].method).toBe("PUT")
        expect(r.items[0].uploadUrl).toBe("https://signed.example/put")

        const doc = await getBatch(db(), batch.batchId)
        expect(doc?.counts).toMatchObject({ total: 2, pending: 2 })
        const items = Object.values(doc!.items)
        expect(items.every((i) => i.status === "awaiting-bytes")).toBe(true)
        expect(items.find((i) => i.fileName === "A.pdf")?.title).toBe("A")
    })

    it("rejects a file over the 25 MB per-item cap", async () => {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))
        const r = ok(
            await requestBatchUploadUrls(LEADER, ORG, {
                batchId: batch.batchId,
                files: [{ fileName: "huge.pdf", sizeBytes: 26 * 1024 * 1024 }],
            }),
        )
        expect(r.items).toHaveLength(0)
        expect(r.rejected).toEqual([{ fileName: "huge.pdf", reason: "too_large" }])
    })

    it("rejects a file whose declared size is missing or not positive", async () => {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))
        const r = ok(
            await requestBatchUploadUrls(LEADER, ORG, {
                batchId: batch.batchId,
                files: [
                    { fileName: "zero.pdf", sizeBytes: 0 },
                    { fileName: "negative.pdf", sizeBytes: -1 },
                    // A client that forgot the field entirely.
                    { fileName: "absent.pdf" } as unknown as {
                        fileName: string
                        sizeBytes: number
                    },
                ],
            }),
        )

        expect(r.items).toHaveLength(0)
        expect(r.rejected).toEqual([
            { fileName: "zero.pdf", reason: "invalid_size" },
            { fileName: "negative.pdf", reason: "invalid_size" },
            { fileName: "absent.pdf", reason: "invalid_size" },
        ])
        // Nothing was minted, so nothing was recorded.
        expect((await getBatch(db(), batch.batchId))!.counts.total).toBe(0)
    })

    it("maps the 200-item ceiling to a 409 batch_full envelope", async () => {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))
        // Fill the batch through the store — the same transaction the tool
        // relies on to enforce the cap authoritatively.
        await addItems(
            db(),
            batch.batchId,
            Array.from({ length: MAX_ITEMS_PER_BATCH }, (_, i) => ({
                itemId: `it-seed${i}`,
                fileName: `seed${i}.pdf`,
                mimeType: "application/pdf",
                sizeBytes: 1,
                title: `seed${i}`,
                status: "awaiting-bytes" as const,
                updatedAt: new Date().toISOString(),
            })),
        )

        const r = await requestBatchUploadUrls(LEADER, ORG, {
            batchId: batch.batchId,
            files: [{ fileName: "one-too-many.pdf", sizeBytes: 10 }],
        })

        expect(machineCode(r)).toBe("batch_full")
        expect((r as { error: { code: number } }).error.code).toBe(409)
        expect((await getBatch(db(), batch.batchId))!.counts.total).toBe(
            MAX_ITEMS_PER_BATCH,
        )
    })

    it("refuses a request for someone else's batch with 403", async () => {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))

        const r = await requestBatchUploadUrls(STRANGER, ORG, {
            batchId: batch.batchId,
            files: [{ fileName: "A.pdf", sizeBytes: 10 }],
        })
        expect(r.ok).toBe(false)
        expect(machineCode(r)).toBe("forbidden")
        expect((r as { error: { code: number } }).error.code).toBe(403)
    })

    it("refuses a batch belonging to another tenant", async () => {
        const batch = ok(await openChartDropzone(LEADER, OTHER_ORG, {}))
        const r = await requestBatchUploadUrls(LEADER, ORG, {
            batchId: batch.batchId,
            files: [{ fileName: "A.pdf", sizeBytes: 10 }],
        })
        expect(machineCode(r)).toBe("forbidden")
    })

    it("reports a missing batch as batch_not_found / 404", async () => {
        const r = await requestBatchUploadUrls(LEADER, ORG, {
            batchId: "ub-nope",
            files: [{ fileName: "A.pdf", sizeBytes: 10 }],
        })
        expect(machineCode(r)).toBe("batch_not_found")
        expect((r as { error: { code: number } }).error.code).toBe(404)
    })

    // ─── commit_upload_batch ─────────────────────────────────────────────

    async function seedTwoItemBatch() {
        const batch = ok(await openChartDropzone(LEADER, ORG, {}))
        const urls = ok(
            await requestBatchUploadUrls(LEADER, ORG, {
                batchId: batch.batchId,
                files: [
                    { fileName: "A.pdf", mimeType: "application/pdf", sizeBytes: 5 },
                    { fileName: "B.pdf", mimeType: "application/pdf", sizeBytes: 7 },
                ],
            }),
        )
        return { batchId: batch.batchId, a: urls.items[0], b: urls.items[1] }
    }

    it("stages the item whose bytes landed and fails the one that did not", async () => {
        const { batchId, a, b } = await seedTwoItemBatch()
        // Only A's PUT succeeded.
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))

        const r = ok(await commitUploadBatch(LEADER, ORG, { batchId }))

        expect(r.status).toBe("committed")
        expect(r.queued).toBe(true)
        expect(r.counts).toMatchObject({ total: 2, pending: 1, failed: 1 })
        expect(mockEnqueue).toHaveBeenCalledWith(batchId)

        const doc = await getBatch(db(), batchId)
        expect(doc!.items[a.itemId].status).toBe("staged")
        expect(doc!.items[b.itemId].status).toBe("failed")
        expect(doc!.items[b.itemId].error?.code).toBe("bytes_missing")
        expect(doc!.inngestEventId).toBe("evt")
    })

    it("fails an item whose uploaded size disagrees with the declared size", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AA"))

        ok(await commitUploadBatch(LEADER, ORG, { batchId }))

        const doc = await getBatch(db(), batchId)
        expect(doc!.items[a.itemId].status).toBe("failed")
        expect(doc!.items[a.itemId].error?.code).toBe("size_mismatch")
    })

    it("aborts without sealing the batch when Storage is unreachable mid-reconcile", async () => {
        const { batchId, a, b } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))
        stagedStore.set(stagedObjectPath(batchId, b.itemId), Buffer.from("BBBBBBB"))
        // B's metadata read blows up — A's has already been reconciled by then.
        metadataFailures.set(
            stagedObjectPath(batchId, b.itemId),
            Object.assign(new Error("503 Service Unavailable"), { code: 503 }),
        )

        const r = await commitUploadBatch(LEADER, ORG, { batchId })

        expect(machineCode(r)).toBe("storage_unavailable")
        expect((r as { error: { code: number } }).error.code).toBe(503)
        expect(r as unknown as { checked: number; remaining: number }).toMatchObject({
            batchId,
            checked: 1,
            remaining: 1,
        })
        expect(mockEnqueue).not.toHaveBeenCalled()

        // Batch left open; the reconciled item keeps its promotion and the
        // unchecked one is still awaiting bytes, so a retry resumes cleanly.
        const doc = await getBatch(db(), batchId)
        expect(doc!.status).toBe("open")
        expect(doc!.items[a.itemId].status).toBe("staged")
        expect(doc!.items[b.itemId].status).toBe("awaiting-bytes")

        // Retry once Storage is back: only the awaiting-bytes item is re-checked.
        metadataFailures.clear()
        const retry = ok(await commitUploadBatch(LEADER, ORG, { batchId }))
        expect(retry.status).toBe("committed")
        expect(retry.queued).toBe(true)
        expect(retry.counts).toMatchObject({ total: 2, pending: 2, failed: 0 })
        const after = await getBatch(db(), batchId)
        expect(after!.items[a.itemId].status).toBe("staged")
        expect(after!.items[b.itemId].status).toBe("staged")
    })

    it("is idempotent — a second commit reports counts with queued:false", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))

        const first = ok(await commitUploadBatch(LEADER, ORG, { batchId }))
        mockEnqueue.mockClear()
        const second = ok(await commitUploadBatch(LEADER, ORG, { batchId }))

        expect(second.queued).toBe(false)
        expect(second.status).toBe("committed")
        expect(second.counts).toEqual(first.counts)
        expect(mockEnqueue).not.toHaveBeenCalled()
    })

    it("keeps the batch committed and returns queue_unavailable when Inngest is down", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))
        mockEnqueue.mockResolvedValue({ ok: false, message: "connect ECONNREFUSED" })

        const r = await commitUploadBatch(LEADER, ORG, { batchId })

        expect(machineCode(r)).toBe("queue_unavailable")
        expect((r as { batchId: string }).batchId).toBe(batchId)
        expect((await getBatch(db(), batchId))?.status).toBe("committed")
    })

    // ─── get_upload_batch ────────────────────────────────────────────────

    it("surfaces the rows needing attention and caps imported rows at 20", async () => {
        const { batchId, a, b } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))
        ok(await commitUploadBatch(LEADER, ORG, { batchId }))

        const r = ok(await getUploadBatch(LEADER, ORG, { batchId }))

        expect(r.status).toBe("committed")
        expect(r.source).toBe("dropzone")
        expect(r.createdAt).not.toBe("")
        expect(r.attention).toHaveLength(1)
        expect(r.attention[0]).toMatchObject({
            itemId: b.itemId,
            fileName: "B.pdf",
            status: "failed",
        })
        expect(r.attention[0].error?.code).toBe("bytes_missing")
        expect(r.imported).toEqual([])
        expect(r.items).toBeUndefined()

        const all = ok(
            await getUploadBatch(LEADER, ORG, { batchId, includeItems: "all" }),
        )
        expect(all.items).toHaveLength(2)
    })

    it("lets an admin read someone else's batch but not an unrelated musician", async () => {
        const { batchId } = await seedTwoItemBatch()

        expect(ok(await getUploadBatch(ADMIN, ORG, { batchId })).batchId).toBe(batchId)
        expect(machineCode(await getUploadBatch(STRANGER, ORG, { batchId }))).toBe(
            "forbidden",
        )
    })

    // ─── resolve_upload_item ─────────────────────────────────────────────

    /** Park an item the way the processor would, so resolution has a target. */
    async function parkItem(batchId: string, itemId: string) {
        await updateItem(db(), batchId, itemId, {
            status: "parked",
            parked: {
                reason: "duplicate_similar",
                matchedFileId: "lib-existing",
                matchedTitle: "Shalom Rav",
                score: 0.91,
            },
        })
    }

    it("skips a parked item and releases its staged bytes", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        const path = stagedObjectPath(batchId, a.itemId)
        stagedStore.set(path, Buffer.from("AAAAA"))
        await parkItem(batchId, a.itemId)

        const r = ok(
            await resolveUploadItem(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                action: "skip",
            }),
        )

        expect(r.status).toBe("skipped")
        expect(r.decision).toMatchObject({ action: "skip", decidedBy: LEADER })
        expect(stagedStore.has(path)).toBe(false)

        const doc = await getBatch(db(), batchId)
        expect(doc!.items[a.itemId].status).toBe("skipped")
        expect(doc!.counts.skipped).toBe(1)
    })

    it("refuses a bind to a library id that does not exist", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        await parkItem(batchId, a.itemId)

        const r = await resolveUploadItem(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            action: "bind",
            boundFileId: "lib-nope",
        })

        expect(machineCode(r)).toBe("not_found")
        expect((await getBatch(db(), batchId))!.items[a.itemId].status).toBe("parked")
    })

    it("records a bind to an existing library row", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        await parkItem(batchId, a.itemId)
        await db().collection("library_index").doc("lib-existing").set({
            title: "Shalom Rav",
        })

        const r = ok(
            await resolveUploadItem(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                action: "bind",
                boundFileId: "lib-existing",
            }),
        )

        expect(r.status).toBe("skipped")
        expect(r.decision.boundFileId).toBe("lib-existing")
    })

    it("forces a parked item back through the pipeline and imports it", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))
        await parkItem(batchId, a.itemId)
        mockProcessChartUpload.mockResolvedValue({ ok: true, fileId: "lib-new" })

        const r = ok(
            await resolveUploadItem(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                action: "force",
            }),
        )

        expect(r.status).toBe("imported")
        expect(r.resultFileId).toBe("lib-new")
        expect(r.decision.action).toBe("force")
        expect(mockProcessChartUpload).toHaveBeenCalledTimes(1)
        expect(mockProcessChartUpload.mock.calls[0][0]).toMatchObject({
            force: true,
            uploaderUid: LEADER,
        })
    })

    it("refuses to force an item that is neither parked nor failed", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        const r = await resolveUploadItem(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            action: "force",
        })
        expect(machineCode(r)).toBe("invalid_state")
    })

    it("forces a FAILED item back through the pipeline and imports it", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        // A failed item keeps its staged bytes precisely so this retry works.
        stagedStore.set(stagedObjectPath(batchId, a.itemId), Buffer.from("AAAAA"))
        await updateItem(db(), batchId, a.itemId, {
            status: "failed",
            error: { code: "convert_failed", message: "MuseScore fell over" },
        })
        mockProcessChartUpload.mockResolvedValue({ ok: true, fileId: "lib-retried" })

        const r = ok(
            await resolveUploadItem(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                action: "force",
            }),
        )

        expect(r.status).toBe("imported")
        expect(r.resultFileId).toBe("lib-retried")
        expect(mockProcessChartUpload).toHaveBeenCalledTimes(1)

        const doc = await getBatch(db(), batchId)
        expect(doc!.items[a.itemId].status).toBe("imported")
        expect(doc!.counts).toMatchObject({ imported: 1, failed: 0 })
    })

    it("still refuses to BIND a failed item", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        await updateItem(db(), batchId, a.itemId, {
            status: "failed",
            error: { code: "convert_failed", message: "MuseScore fell over" },
        })
        await db().collection("library_index").doc("lib-existing").set({
            title: "Shalom Rav",
        })

        const r = await resolveUploadItem(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            action: "bind",
            boundFileId: "lib-existing",
        })
        expect(machineCode(r)).toBe("invalid_state")
    })

    it("reports an unknown itemId as item_not_found", async () => {
        const { batchId } = await seedTwoItemBatch()
        const r = await resolveUploadItem(LEADER, ORG, {
            batchId,
            itemId: "it-nope",
            action: "skip",
        })
        expect(machineCode(r)).toBe("item_not_found")
    })

    // ─── list_parked_uploads ─────────────────────────────────────────────

    it("lists parked rows for the caller's tenant only", async () => {
        const mine = await seedTwoItemBatch()
        await parkItem(mine.batchId, mine.a.itemId)

        const theirs = ok(await openChartDropzone(LEADER, OTHER_ORG, {}))
        const theirUrls = ok(
            await requestBatchUploadUrls(LEADER, OTHER_ORG, {
                batchId: theirs.batchId,
                files: [{ fileName: "Z.pdf", sizeBytes: 3 }],
            }),
        )
        await parkItem(theirs.batchId, theirUrls.items[0].itemId)

        const r = ok(await listParkedUploads(LEADER, ORG, {}))

        expect(r.count).toBe(1)
        expect(r.parked[0]).toMatchObject({
            batchId: mine.batchId,
            itemId: mine.a.itemId,
            fileName: "A.pdf",
        })
        expect(r.parked[0].parked.matchedTitle).toBe("Shalom Rav")

        const other = ok(await listParkedUploads(LEADER, OTHER_ORG, {}))
        expect(other.count).toBe(1)
        expect(other.parked[0].fileName).toBe("Z.pdf")
    })

    it("refuses the parked list for a caller with no upload permission", async () => {
        const r = await listParkedUploads(MEMBER, ORG, {})
        expect(machineCode(r)).toBe("forbidden_role")
    })

    // ─── append_batch_item_chunk ─────────────────────────────────────────

    it("accepts chunks and assembles them on the last one", async () => {
        const { batchId, a } = await seedTwoItemBatch()

        const first = ok(
            await appendBatchItemChunk(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                chunkIndex: 0,
                totalChunks: 2,
                dataBase64: Buffer.from("AAA").toString("base64"),
            }),
        )
        expect(first.receivedChunks).toBe(1)
        expect(first.assembled).toBeUndefined()

        const last = ok(
            await appendBatchItemChunk(LEADER, ORG, {
                batchId,
                itemId: a.itemId,
                chunkIndex: 1,
                totalChunks: 2,
                dataBase64: Buffer.from("BB").toString("base64"),
            }),
        )
        expect(last.assembled).toBe(true)
        expect(last.sizeBytes).toBe(5)
        expect(
            stagedStore.get(stagedObjectPath(batchId, a.itemId))?.toString(),
        ).toBe("AAABB")

        // The assembled length becomes the declared size, so commit reconciles.
        const committed = ok(await commitUploadBatch(LEADER, ORG, { batchId }))
        expect(committed.counts.pending).toBe(1)
        expect(
            (await getBatch(db(), batchId))!.items[a.itemId].status,
        ).toBe("staged")
    })

    it("rejects malformed base64 rather than silently truncating it", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        const r = await appendBatchItemChunk(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            chunkIndex: 0,
            totalChunks: 1,
            dataBase64: "not base64!!",
        })
        expect(machineCode(r)).toBe("invalid_argument")
    })

    it("rejects a chunk larger than the 3 MB per-chunk cap", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        const oversized = Buffer.alloc(3 * 1024 * 1024 + 1, 0x41)

        const r = await appendBatchItemChunk(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            chunkIndex: 0,
            totalChunks: 1,
            dataBase64: oversized.toString("base64"),
        })

        expect(machineCode(r)).toBe("payload_too_large")
        // Nothing was written for a chunk that was refused.
        expect(stagedStore.size).toBe(0)
    })

    it("rejects a chunk that would push the item past the 25 MB per-file cap", async () => {
        const { batchId, a } = await seedTwoItemBatch()
        // Stand in for ~25 MB of chunks already accepted, without sending them.
        await updateItem(db(), batchId, a.itemId, {
            ...({ receivedChunks: 9, chunkBytes: MAX_ITEM_BYTES - 4 } as object),
        })

        const r = await appendBatchItemChunk(LEADER, ORG, {
            batchId,
            itemId: a.itemId,
            chunkIndex: 9,
            totalChunks: 20,
            dataBase64: Buffer.from("ABCDEFGH").toString("base64"),
        })

        expect(machineCode(r)).toBe("size_exceeds_cap")
        expect(stagedStore.size).toBe(0)
    })

    // ─── import_drive_folder ─────────────────────────────────────────────

    function seedDriveFolder() {
        driveFiles.push(
            {
                id: "drive-1",
                name: "Hashkivenu.pdf",
                mimeType: "application/pdf",
                size: "1200",
                md5Checksum: "d41d8cd98f00b204e9800998ecf8427e",
                modifiedTime: "2026-09-01T12:00:00.000Z",
                parents: ["folder-1"],
            },
            {
                id: "drive-2",
                name: "Mi Chamocha.mxl",
                mimeType: "application/octet-stream",
                size: "900",
            },
            {
                id: "drive-3",
                name: "notes.zip",
                mimeType: "application/zip",
                size: "50",
            },
        )
    }

    it("dryRun lists the candidates and writes nothing", async () => {
        seedDriveFolder()

        const r = await importDriveFolder(LEADER, ORG, {
            folderId: "folder-1",
            dryRun: true,
        })
        expect(r.ok).toBe(true)
        const dry = r as {
            ok: true
            dryRun: true
            wouldImport: Array<{ name: string }>
            skipped: Array<{ name: string; reason: string }>
        }

        expect(dry.dryRun).toBe(true)
        expect(dry.wouldImport).toHaveLength(2)
        expect(dry.wouldImport.map((f) => f.name)).toEqual([
            "Hashkivenu.pdf",
            "Mi Chamocha.mxl",
        ])
        expect(dry.skipped).toEqual([
            { name: "notes.zip", reason: "unsupported_type" },
        ])

        const batches = await db().collection(BATCH_COLLECTION).get()
        expect(batches.empty).toBe(true)
        expect(mockEnqueue).not.toHaveBeenCalled()
    })

    it("creates a committed drive-folder batch with one pending item per chart", async () => {
        seedDriveFolder()

        const r = await importDriveFolder(LEADER, ORG, {
            folderId: "folder-1",
            collection: "core",
        })
        expect(r.ok).toBe(true)
        const real = r as {
            ok: true
            batchId: string
            counts: { total: number; pending: number }
            queued: boolean
            skipped: Array<{ name: string }>
        }

        expect(real.queued).toBe(true)
        expect(real.counts).toMatchObject({ total: 2, pending: 2 })
        expect(real.skipped.map((s) => s.name)).toEqual(["notes.zip"])

        const doc = await getBatch(db(), real.batchId)
        expect(doc!.source).toBe("drive-folder")
        expect(doc!.status).toBe("committed")
        expect(doc!.defaults.collection).toBe("core")
        const items = Object.values(doc!.items)
        expect(items.every((i) => i.status === "pending")).toBe(true)
        expect(items.map((i) => i.driveFileId).sort()).toEqual([
            "drive-1",
            "drive-2",
        ])
        expect(
            items.find((i) => i.driveFileId === "drive-2")?.mimeType,
        ).toBe("application/vnd.recordare.musicxml")
        expect(items.find((i) => i.driveFileId === "drive-1")?.title).toBe(
            "Hashkivenu",
        )
        expect(mockEnqueue).toHaveBeenCalledWith(real.batchId)
    })

    it("stores Drive provenance under the keys processBatchItem reads", async () => {
        seedDriveFolder()

        const r = ok(
            await importDriveFolder(LEADER, ORG, { folderId: "folder-1" }),
        ) as { batchId: string }

        const doc = await getBatch(db(), r.batchId)
        const item = Object.values(doc!.items).find(
            (i) => i.driveFileId === "drive-1",
        )!
        // The names here are load-bearing: `processBatchItem` forwards
        // `driveMd5Checksum` / `driveModifiedTime` / `driveParents` into
        // `processChartUpload`'s `driveMetadata`, and nothing reads a bare
        // `md5Checksum` / `modifiedTime` off an item.
        expect(item.driveMd5Checksum).toBe("d41d8cd98f00b204e9800998ecf8427e")
        expect(item.driveModifiedTime).toBe("2026-09-01T12:00:00.000Z")
        expect(item.driveParents).toEqual(["folder-1"])
        expect(item).not.toHaveProperty("md5Checksum")
        expect(item).not.toHaveProperty("modifiedTime")

        // A file Drive reported no provenance for carries none.
        const bare = Object.values(doc!.items).find(
            (i) => i.driveFileId === "drive-2",
        )!
        expect(bare.driveMd5Checksum).toBeUndefined()
        expect(bare.driveParents).toBeUndefined()
    })

    it("refuses a Drive folder import for a caller with no upload permission", async () => {
        const r = await importDriveFolder(MEMBER, ORG, { folderId: "folder-1" })
        expect(machineCode(r)).toBe("forbidden_role")
    })
})
