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
 * Batch chart intake — the deadline-aware runner behind `/api/intake/run`.
 *
 * A Vercel function is a hard 300 s wall, so the HTTP executor processes items
 * until a deadline and then hands the rest to a fresh invocation of itself.
 * The two properties this suite exists for:
 *
 *  1. Whatever happens, the batch never sits in `processing` with nobody
 *     coming back for it — the run either finalizes it or re-triggers.
 *  2. `runBatchWithDeadline` never throws. A re-trigger that fails is logged
 *     and the resume cron picks the batch up; an exception here would escape
 *     `after()` in the route as an unhandled rejection.
 *
 * Storage + processChartUpload mocks are the ones from
 * `import-batch-job.emulator.test.ts` — the staged bytes really round-trip.
 */
const stagedStore = new Map<string, Buffer>()
vi.mock("firebase-admin/storage", () => ({
    getStorage: () => ({
        bucket: () => ({
            file: (path: string) => ({
                save: async (data: Buffer) => {
                    stagedStore.set(path, Buffer.from(data))
                },
                exists: async () => [stagedStore.has(path)],
                download: async () => {
                    const bytes = stagedStore.get(path)
                    if (!bytes) {
                        const err = new Error("No such object") as Error & {
                            code?: number
                        }
                        err.code = 404
                        throw err
                    }
                    return [bytes]
                },
                getMetadata: async () => [
                    { size: stagedStore.get(path)?.byteLength ?? 0 },
                ],
                delete: async () => {
                    stagedStore.delete(path)
                },
            }),
        }),
    }),
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

vi.mock("@/lib/mcp/org-context", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/mcp/org-context")>(
            "@/lib/mcp/org-context",
        )
    return { ...actual, stampOrg: async () => undefined }
})

vi.mock("@/lib/google-drive", async () => {
    const actual =
        await vi.importActual<typeof import("@/lib/google-drive")>(
            "@/lib/google-drive",
        )
    return { ...actual, DriveClient: class {} }
})

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

import { runBatchWithDeadline } from "../http-executor"
import { addItems, createBatch, getBatch, setBatchStatus } from "../batch-store"
import { stagedObjectPath } from "../staged-storage"
import {
    BATCH_COLLECTION,
    newItemId,
    type UploadBatchItem,
} from "../batch-types"

const OWNER = "rabbi-daniel"
const ORG = "crc"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("runBatchWithDeadline (emulator)", () => {
    let app: App

    function db() {
        return getFirestore(app)
    }

    beforeAll(() => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-http-executor" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        const snap = await db().collection(BATCH_COLLECTION).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
        stagedStore.clear()
        mockProcessChartUpload.mockReset()
        mockProcessChartUpload.mockImplementation(
            async (input: { title?: string }) => ({
                ok: true,
                fileId: `lib-${input.title}`,
                title: input.title,
                mimeType: "application/pdf",
                storageUrl: `gs://mock/library/${input.title}.pdf`,
                collection: "uploads",
            }),
        )
    })

    /** Committed batch, three staged items whose ids sort One < Two < Three. */
    async function seedBatch(): Promise<{ batchId: string; itemIds: string[] }> {
        const { batchId } = await createBatch(db(), {
            ownerUid: OWNER,
            orgId: ORG,
            source: "dropzone",
            defaults: { collection: "uploads" },
        })

        const itemIds = ["a", "b", "c"].map(() => newItemId()).sort()
        const items: UploadBatchItem[] = itemIds.map((itemId, i) => ({
            itemId,
            fileName: `Chart${i + 1}.pdf`,
            mimeType: "application/pdf",
            sizeBytes: 8,
            title: `Chart${i + 1}`,
            stagedPath: stagedObjectPath(batchId, itemId),
            status: "staged" as const,
            updatedAt: new Date().toISOString(),
        }))
        await addItems(db(), batchId, items)
        await setBatchStatus(db(), batchId, "committed", {
            committedAt: new Date(),
        })
        for (const item of items) {
            stagedStore.set(item.stagedPath!, Buffer.from(`bytes-${item.title}`))
        }
        return { batchId, itemIds }
    }

    it("processes every item and finalizes when the deadline is generous", async () => {
        const { batchId } = await seedBatch()
        const retrigger = vi.fn(async () => undefined)

        const res = await runBatchWithDeadline(db(), batchId, {
            deadlineAt: Date.now() + 60_000,
            retrigger,
        })

        expect(res).toEqual({ processed: 3, remaining: 0, finalized: true })
        expect(retrigger).not.toHaveBeenCalled()

        const batch = await getBatch(db(), batchId)
        expect(batch!.status).toBe("done")
        expect(batch!.counts).toMatchObject({ total: 3, imported: 3, pending: 0 })
    })

    it("stops at the deadline, leaves the batch processing and re-triggers once", async () => {
        const { batchId } = await seedBatch()
        const retrigger = vi.fn(async () => undefined)

        // The first item alone overruns the budget; items 2 and 3 are handed to
        // the next invocation.
        mockProcessChartUpload.mockImplementationOnce(
            async (input: { title?: string }) => {
                await sleep(80)
                return {
                    ok: true,
                    fileId: `lib-${input.title}`,
                    title: input.title,
                    mimeType: "application/pdf",
                    storageUrl: "gs://mock/library/one.pdf",
                    collection: "uploads",
                }
            },
        )

        const res = await runBatchWithDeadline(db(), batchId, {
            deadlineAt: Date.now() + 40,
            retrigger,
        })

        expect(res).toEqual({ processed: 1, remaining: 2, finalized: false })
        expect(retrigger).toHaveBeenCalledTimes(1)
        expect(retrigger).toHaveBeenCalledWith(batchId)

        const batch = await getBatch(db(), batchId)
        expect(batch!.status).toBe("processing")
        expect(batch!.counts).toMatchObject({ imported: 1, pending: 2 })
    })

    it("does not throw when the re-trigger rejects — the resume cron is the net", async () => {
        const { batchId } = await seedBatch()
        const retrigger = vi.fn(async () => {
            throw new Error("run route unreachable")
        })
        mockProcessChartUpload.mockImplementationOnce(async () => {
            await sleep(80)
            return {
                ok: true,
                fileId: "lib-one",
                title: "Chart1",
                mimeType: "application/pdf",
                storageUrl: "gs://mock/library/one.pdf",
                collection: "uploads",
            }
        })

        const res = await runBatchWithDeadline(db(), batchId, {
            deadlineAt: Date.now() + 40,
            retrigger,
        })

        expect(res).toMatchObject({ finalized: false, remaining: 2 })
        expect((await getBatch(db(), batchId))!.status).toBe("processing")
    })

    it("picks a batch back up mid-flight (status already processing)", async () => {
        const { batchId } = await seedBatch()
        // What a re-triggered invocation finds: the previous run moved the
        // batch to `processing` and left items behind.
        await setBatchStatus(db(), batchId, "processing")
        const retrigger = vi.fn(async () => undefined)

        const res = await runBatchWithDeadline(db(), batchId, {
            deadlineAt: Date.now() + 60_000,
            retrigger,
        })

        expect(res).toEqual({ processed: 3, remaining: 0, finalized: true })
        expect((await getBatch(db(), batchId))!.status).toBe("done")

        // A second pass over the finished batch is a no-op, not a re-import.
        mockProcessChartUpload.mockClear()
        expect(
            await runBatchWithDeadline(db(), batchId, {
                deadlineAt: Date.now() + 60_000,
                retrigger,
            }),
        ).toEqual({ processed: 0, remaining: 0, finalized: false })
        expect(mockProcessChartUpload).not.toHaveBeenCalled()
    })

    it("returns a no-op for a batch that is missing or not runnable", async () => {
        const zero = { processed: 0, remaining: 0, finalized: false }
        const retrigger = vi.fn(async () => undefined)

        expect(
            await runBatchWithDeadline(db(), "ub-does-not-ex", {
                deadlineAt: Date.now() + 1000,
                retrigger,
            }),
        ).toEqual(zero)

        const { batchId } = await seedBatch()
        await setBatchStatus(db(), batchId, "expired")
        expect(
            await runBatchWithDeadline(db(), batchId, {
                deadlineAt: Date.now() + 1000,
                retrigger,
            }),
        ).toEqual(zero)
        expect(retrigger).not.toHaveBeenCalled()
    })

    it("records an item that blows up as failed and keeps going", async () => {
        const { batchId } = await seedBatch()
        mockProcessChartUpload.mockImplementationOnce(async () => {
            throw new Error("converter exploded")
        })

        const res = await runBatchWithDeadline(db(), batchId, {
            deadlineAt: Date.now() + 60_000,
            retrigger: vi.fn(async () => undefined),
        })

        expect(res).toMatchObject({ processed: 3, remaining: 0, finalized: true })
        const batch = await getBatch(db(), batchId)
        expect(batch!.counts).toMatchObject({ imported: 2, failed: 1 })
        expect(batch!.status).toBe("done")
    })
})
