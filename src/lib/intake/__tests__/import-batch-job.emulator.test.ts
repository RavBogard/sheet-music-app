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
 * Storage is mocked with the path-keyed in-memory store pattern from
 * `mcp-upload-session.emulator.test.ts` — the staged bytes really round-trip
 * save -> download -> delete, so "Alpha's object was deleted, Beta's retained"
 * is an assertion about the store, not about a call count.
 */
const stagedStore = new Map<string, Buffer>()
const mockStagedFile = vi.fn((path: string) => ({
    save: async (data: Buffer) => {
        stagedStore.set(path, Buffer.from(data))
    },
    exists: async () => [stagedStore.has(path)],
    download: async () => {
        const bytes = stagedStore.get(path)
        if (!bytes) {
            const err = new Error("No such object") as Error & { code?: number }
            err.code = 404
            throw err
        }
        return [bytes]
    },
    getMetadata: async () => [{ size: stagedStore.get(path)?.byteLength ?? 0 }],
    delete: async () => {
        if (!stagedStore.has(path)) {
            const err = new Error("No such object") as Error & { code?: number }
            err.code = 404
            throw err
        }
        stagedStore.delete(path)
    },
}))
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({ bucket: () => ({ file: mockStagedFile }) }),
}))

// processChartUpload is the canonical pipeline; this job only has to wire the
// staged bytes into it and map the outcome, so it's stubbed per-title.
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

const mockStampOrg = vi.fn(async () => undefined)
vi.mock("@/lib/mcp/org-context", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/mcp/org-context")>(
            "@/lib/mcp/org-context",
        )
    return { ...actual, stampOrg: (...args: unknown[]) => mockStampOrg(...(args as [])) }
})

// DriveClient's constructor builds a GoogleAuth from service-account env; no
// item in this suite is drive-sourced, but the module is imported at load.
vi.mock("@/lib/google-drive", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/google-drive")>(
            "@/lib/google-drive",
        )
    return {
        ...actual,
        DriveClient: class {
            async getFileMetadata(id: string) {
                return { name: `${id}.pdf`, mimeType: "application/pdf" }
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

// The Inngest client must not try to reach the dev server from a unit test.
// `createFunction` is stubbed to a plain descriptor — this suite drives
// `runImportBatch` directly, so the registered function object is never run.
vi.mock("@/inngest/client", () => ({
    inngest: {
        send: vi.fn(async () => ({ ids: ["evt-test"] })),
        createFunction: (config: unknown, trigger: unknown, handler: unknown) => ({
            config,
            trigger,
            handler,
        }),
    },
}))

import {
    failedRunBatchId,
    finalizeBatch,
    processBatchItem,
    runImportBatch,
} from "../import-batch-job"
import { createBatch, addItems, getBatch, setBatchStatus } from "../batch-store"
import { stagedObjectPath } from "../staged-storage"
import {
    BATCH_COLLECTION,
    newItemId,
    titleFromFileName,
    type UploadBatchItem,
} from "../batch-types"

const OWNER = "rabbi-daniel"
const ORG = "crc"

/** Straight-through `step` shim: run each step body inline, once. */
const inlineStep = {
    run: <T,>(_name: string, fn: () => Promise<T>) => fn(),
}

describe("import-batch-job (emulator)", () => {
    let app: App

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-import-batch-job" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection(BATCH_COLLECTION).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
        stagedStore.clear()
        mockProcessChartUpload.mockReset()
        mockStampOrg.mockClear()

        // Alpha imports, Beta collides with an existing row, Gamma fails
        // conversion. `force` flips Beta through.
        mockProcessChartUpload.mockImplementation(
            async (input: { title?: string; force?: boolean }) => {
                if (input.title === "Alpha")
                    return {
                        ok: true,
                        fileId: "lib-alpha",
                        title: "Alpha",
                        mimeType: "application/pdf",
                        storageUrl: "gs://mock/library/lib-alpha.pdf",
                        collection: "uploads",
                    }
                if (input.title === "Beta") {
                    if (input.force)
                        return {
                            ok: true,
                            fileId: "lib-beta-forced",
                            title: "Beta",
                            mimeType: "application/pdf",
                            storageUrl: "gs://mock/library/lib-beta-forced.pdf",
                            collection: "uploads",
                        }
                    return {
                        ok: false,
                        status: 409,
                        error: "A similar chart already exists",
                        code: "duplicate_similar",
                        matchedFileId: "lib-existing-beta",
                        matchedTitle: "Beta (Friedman)",
                        score: 0.91,
                    }
                }
                return {
                    ok: false,
                    status: 422,
                    error: "MuseScore conversion failed",
                    code: "convert_failed",
                }
            },
        )
    })

    /** Create a committed batch with three staged items whose bytes are staged. */
    async function seedBatch(): Promise<{
        batchId: string
        ids: Record<"alpha" | "beta" | "gamma", string>
    }> {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: { collection: "uploads", tags: ["shabbat"] },
        })

        const ids = {
            alpha: newItemId(),
            beta: newItemId(),
            gamma: newItemId(),
        }
        const items: UploadBatchItem[] = (
            [
                ["alpha", "Alpha.pdf"],
                ["beta", "Beta.pdf"],
                ["gamma", "Gamma.pdf"],
            ] as const
        ).map(([key, fileName]) => ({
            itemId: ids[key],
            fileName,
            mimeType: "application/pdf",
            sizeBytes: 8,
            title: titleFromFileName(fileName),
            stagedPath: stagedObjectPath(batchId, ids[key]),
            status: "staged" as const,
            updatedAt: new Date().toISOString(),
        }))
        await addItems(db(), batchId, items)
        await setBatchStatus(db(), batchId, "committed", { committedAt: new Date() })

        for (const it of items) {
            stagedStore.set(it.stagedPath!, Buffer.from(`bytes-${it.title}`))
        }

        return { batchId, ids }
    }

    it("runs every staged item, rolls up counts and cleans staged bytes by outcome", async () => {
        const { batchId, ids } = await seedBatch()

        const counts = await runImportBatch(db(), batchId, inlineStep)

        expect(counts).toMatchObject({
            total: 3,
            imported: 1,
            parked: 1,
            failed: 1,
            pending: 0,
            skipped: 0,
        })

        const batch = await getBatch(db(), batchId)
        expect(batch!.status).toBe("done")
        expect(batch!.finishedAt).toBeTruthy()

        const alpha = batch!.items[ids.alpha]
        expect(alpha.status).toBe("imported")
        expect(alpha.resultFileId).toBe("lib-alpha")

        const beta = batch!.items[ids.beta]
        expect(beta.status).toBe("parked")
        expect(beta.parked).toMatchObject({
            reason: "duplicate_similar",
            matchedFileId: "lib-existing-beta",
            matchedTitle: "Beta (Friedman)",
            score: 0.91,
        })

        const gamma = batch!.items[ids.gamma]
        expect(gamma.status).toBe("failed")
        expect(gamma.error).toMatchObject({ code: "convert_failed" })

        // Only the import releases its staged bytes. Parked AND failed keep
        // theirs so a human's `force` decision has something to re-import —
        // deleting a failed item's bytes would make the retry impossible.
        expect(stagedStore.has(stagedObjectPath(batchId, ids.alpha))).toBe(false)
        expect(stagedStore.has(stagedObjectPath(batchId, ids.gamma))).toBe(true)
        expect(stagedStore.has(stagedObjectPath(batchId, ids.beta))).toBe(true)

        // The org stamp lands only on the imported row.
        expect(mockStampOrg).toHaveBeenCalledTimes(1)
        expect(mockStampOrg).toHaveBeenCalledWith(expect.anything(), "lib-alpha", ORG)

        // Defaults flow into the pipeline call.
        expect(mockProcessChartUpload).toHaveBeenCalledWith(
            expect.objectContaining({
                title: "Alpha",
                originalFileName: "Alpha.pdf",
                mimeType: "application/pdf",
                collection: "uploads",
                tags: ["shabbat"],
                uploaderUid: OWNER,
                source: "upload",
                force: false,
            }),
        )
    })

    it("is idempotent on retry — a second run touches no terminal item", async () => {
        const { batchId } = await seedBatch()
        await runImportBatch(db(), batchId, inlineStep)
        expect(mockProcessChartUpload).toHaveBeenCalledTimes(3)

        mockProcessChartUpload.mockClear()
        const counts = await runImportBatch(db(), batchId, inlineStep)

        expect(mockProcessChartUpload).not.toHaveBeenCalled()
        expect(counts).toMatchObject({ imported: 1, parked: 1, failed: 1, pending: 0 })
    })

    it("processBatchItem no-ops on a terminal item unless force is set", async () => {
        const { batchId, ids } = await seedBatch()
        await runImportBatch(db(), batchId, inlineStep)
        mockProcessChartUpload.mockClear()

        const untouched = await processBatchItem(db(), batchId, ids.beta)
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
        expect(untouched.status).toBe("parked")

        const forced = await processBatchItem(db(), batchId, ids.beta, { force: true })
        expect(mockProcessChartUpload).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Beta", force: true }),
        )
        expect(forced.status).toBe("imported")
        expect(forced.resultFileId).toBe("lib-beta-forced")

        // Forcing an import releases the bytes that the park had retained.
        expect(stagedStore.has(stagedObjectPath(batchId, ids.beta))).toBe(false)

        const batch = await getBatch(db(), batchId)
        expect(batch!.counts).toMatchObject({ imported: 2, parked: 0, failed: 1 })
    })

    it("retries a failed item from its retained staged bytes", async () => {
        const { batchId, ids } = await seedBatch()
        await runImportBatch(db(), batchId, inlineStep)
        expect(stagedStore.has(stagedObjectPath(batchId, ids.gamma))).toBe(true)

        mockProcessChartUpload.mockClear()
        mockProcessChartUpload.mockResolvedValue({
            ok: true,
            fileId: "lib-gamma-retried",
            title: "Gamma",
            mimeType: "application/pdf",
            storageUrl: "gs://mock/library/lib-gamma-retried.pdf",
            collection: "uploads",
        })

        const retried = await processBatchItem(db(), batchId, ids.gamma, {
            force: true,
        })
        expect(retried.status).toBe("imported")
        expect(retried.resultFileId).toBe("lib-gamma-retried")
        // The retry succeeded, so now the bytes go.
        expect(stagedStore.has(stagedObjectPath(batchId, ids.gamma))).toBe(false)
    })

    it("forwards Drive provenance into processChartUpload's driveMetadata", async () => {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "drive-folder",
            defaults: { collection: "uploads" },
        })
        const itemId = newItemId()
        await addItems(db(), batchId, [
            {
                itemId,
                fileName: "Hashkivenu.pdf",
                mimeType: "application/pdf",
                sizeBytes: 11,
                title: "Hashkivenu",
                driveFileId: "drive-1",
                driveMd5Checksum: "d41d8cd98f00b204e9800998ecf8427e",
                driveModifiedTime: "2026-09-01T12:00:00.000Z",
                driveParents: ["folder-1"],
                status: "pending",
                updatedAt: new Date().toISOString(),
            },
        ])
        await setBatchStatus(db(), batchId, "committed", { committedAt: new Date() })
        mockProcessChartUpload.mockResolvedValue({
            ok: true,
            fileId: "lib-drive-1",
            title: "Hashkivenu",
            mimeType: "application/pdf",
            storageUrl: "gs://mock/library/lib-drive-1.pdf",
            collection: "uploads",
        })

        const item = await processBatchItem(db(), batchId, itemId)
        expect(item.status).toBe("imported")
        expect(mockProcessChartUpload).toHaveBeenCalledWith(
            expect.objectContaining({
                source: "drive-sync",
                driveMetadata: {
                    driveFileId: "drive-1",
                    md5Checksum: "d41d8cd98f00b204e9800998ecf8427e",
                    modifiedTime: "2026-09-01T12:00:00.000Z",
                    parents: ["folder-1"],
                },
            }),
        )
    })

    it("fails an item whose staged bytes are gone instead of throwing", async () => {
        const { batchId, ids } = await seedBatch()
        stagedStore.delete(stagedObjectPath(batchId, ids.alpha))

        const item = await processBatchItem(db(), batchId, ids.alpha)
        expect(item.status).toBe("failed")
        expect(item.error?.code).toBe("staged_bytes_missing")
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
    })

    it("records a thrown pipeline error as failed(internal) and still finishes the batch", async () => {
        const { batchId, ids } = await seedBatch()
        const boom = mockProcessChartUpload.getMockImplementation()!
        mockProcessChartUpload.mockImplementation(
            async (input: { title?: string; force?: boolean }) => {
                if (input.title === "Gamma")
                    throw new Error("pdf-lib exploded mid-parse")
                return boom(input)
            },
        )

        const counts = await runImportBatch(db(), batchId, inlineStep)

        // One bad chart costs exactly one failed item — the run still completes.
        expect(counts).toMatchObject({ imported: 1, parked: 1, failed: 1, pending: 0 })

        const batch = await getBatch(db(), batchId)
        expect(batch!.status).toBe("done")
        expect(batch!.finishedAt).toBeTruthy()
        expect(batch!.items[ids.gamma]).toMatchObject({
            status: "failed",
            error: { code: "internal", message: "pdf-lib exploded mid-parse" },
        })
        // The other two items were unaffected.
        expect(batch!.items[ids.alpha].status).toBe("imported")
        expect(batch!.items[ids.beta].status).toBe("parked")
    })

    it("clears the stale parked block when a forced re-run fails", async () => {
        const { batchId, ids } = await seedBatch()
        await runImportBatch(db(), batchId, inlineStep)
        expect((await getBatch(db(), batchId))!.items[ids.beta].parked).toBeTruthy()

        // The human forces the parked item; this time the pipeline rejects it.
        mockProcessChartUpload.mockImplementation(async () => ({
            ok: false,
            status: 422,
            error: "MuseScore conversion failed",
            code: "convert_failed",
        }))
        const forced = await processBatchItem(db(), batchId, ids.beta, { force: true })

        expect(forced.status).toBe("failed")
        expect(forced.parked).toBeUndefined()

        // And the field is really gone from the stored document, not just
        // undefined on the returned object.
        const raw = await db().collection(BATCH_COLLECTION).doc(batchId).get()
        const storedBeta = (raw.data() as { items: Record<string, unknown> }).items[
            ids.beta
        ] as Record<string, unknown>
        expect("parked" in storedBeta).toBe(false)
        expect(storedBeta.error).toMatchObject({ code: "convert_failed" })
        expect((await getBatch(db(), batchId))!.counts).toMatchObject({
            imported: 1,
            parked: 0,
            failed: 2,
        })
    })

    it("finalizeBatch closes out a batch left in processing", async () => {
        const { batchId } = await seedBatch()
        await setBatchStatus(db(), batchId, "processing")

        const counts = await finalizeBatch(db(), batchId)

        expect(counts).toMatchObject({ total: 3, pending: 3 })
        const batch = await getBatch(db(), batchId)
        expect(batch!.status).toBe("done")
        expect(batch!.finishedAt).toBeTruthy()
    })

    it("failedRunBatchId reads the original event out of a function.failed event", () => {
        expect(
            failedRunBatchId({
                name: "inngest/function.failed",
                data: { event: { name: "library/import-batch", data: { batchId: "ub-1" } } },
            }),
        ).toBe("ub-1")
        expect(failedRunBatchId({ data: {} })).toBeNull()
        expect(failedRunBatchId(null)).toBeNull()
    })

    it("throws batch_not_found / item_not_found for unknown ids", async () => {
        const { batchId } = await seedBatch()
        await expect(processBatchItem(db(), "ub-nope", "it-nope")).rejects.toThrow(
            "batch_not_found",
        )
        await expect(processBatchItem(db(), batchId, "it-nope")).rejects.toThrow(
            "item_not_found",
        )
    })
})
