import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { initializeApp, deleteApp, getApps, type App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const enqueueImportBatch = vi.fn(async (batchId: string) => ({
    ok: true as const,
    eventId: `evt-${batchId}`,
    executor: "http" as const,
}))

vi.mock("../enqueue", () => ({
    enqueueImportBatch: (batchId: string) => enqueueImportBatch(batchId),
}))

import { resumeStuckBatches } from "../resume-stuck-batches"
import { BATCH_COLLECTION, type BatchStatus } from "../batch-types"

/**
 * Batch chart intake — the /api/cron/import-batches-resume safety net.
 *
 * A batch is sealed in Firestore BEFORE `enqueueImportBatch` runs, so an
 * Inngest outage leaves a `committed` doc that nothing will ever process.
 * `resumeStuckBatches` is the sweeper: anything still `committed` after the
 * grace window gets re-sent. Re-sending is safe — the processor is idempotent
 * per item — so the query deliberately does not track attempt counts.
 */
describe("resumeStuckBatches (emulator)", () => {
    let app: App

    function db() {
        return getFirestore(app)
    }

    function ago(ms: number): Date {
        return new Date(Date.now() - ms)
    }

    async function seed(
        batchId: string,
        status: BatchStatus,
        committedAt: Date | null,
        items: Record<string, { itemId: string; status: string; updatedAt: string }> = {},
    ): Promise<void> {
        await db()
            .collection(BATCH_COLLECTION)
            .doc(batchId)
            .set({
                ownerUid: "rabbi-daniel",
                orgId: "crc",
                source: "dropzone",
                status,
                defaults: {},
                counts: {
                    total: 1,
                    pending: 1,
                    imported: 0,
                    parked: 0,
                    failed: 0,
                    skipped: 0,
                },
                items,
                createdAt: ago(60 * 60 * 1000),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                ...(committedAt ? { committedAt } : {}),
            })
    }

    beforeAll(async () => {
        expect(process.env.FIRESTORE_EMULATOR_HOST).toBeTruthy()
        app = getApps()[0] ?? initializeApp({ projectId: "demo-resume-stuck" })
    })

    afterAll(async () => {
        await deleteApp(app)
    })

    beforeEach(async () => {
        enqueueImportBatch.mockClear()
        const snap = await db().collection(BATCH_COLLECTION).get()
        await Promise.all(snap.docs.map((d) => d.ref.delete()))
    })

    it("re-sends only the committed batch older than the grace window", async () => {
        await seed("ub-stuck000000", "committed", ago(10 * 60 * 1000))
        await seed("ub-fresh000000", "committed", ago(60 * 1000))
        await seed("ub-done0000000", "done", ago(10 * 60 * 1000))

        const { resent } = await resumeStuckBatches(db())

        expect(resent).toEqual(["ub-stuck000000"])
        expect(enqueueImportBatch).toHaveBeenCalledTimes(1)
        expect(enqueueImportBatch).toHaveBeenCalledWith("ub-stuck000000")
    })

    it("stamps the new inngestEventId on the resumed batch", async () => {
        await seed("ub-stuck000000", "committed", ago(10 * 60 * 1000))

        await resumeStuckBatches(db())

        const snap = await db()
            .collection(BATCH_COLLECTION)
            .doc("ub-stuck000000")
            .get()
        expect(snap.data()?.inngestEventId).toBe("evt-ub-stuck000000")
        // Status stays `committed` — the processor is what moves it on.
        expect(snap.data()?.status).toBe("committed")
    })

    it("honours olderThanMs", async () => {
        await seed("ub-a0000000000", "committed", ago(2 * 60 * 1000))

        expect((await resumeStuckBatches(db(), { olderThanMs: 60 * 1000 })).resent)
            .toEqual(["ub-a0000000000"])
        enqueueImportBatch.mockClear()
        expect(
            (await resumeStuckBatches(db(), { olderThanMs: 10 * 60 * 1000 })).resent,
        ).toEqual([])
        expect(enqueueImportBatch).not.toHaveBeenCalled()
    })

    it("caps the sweep at `limit` batches", async () => {
        for (let i = 0; i < 5; i += 1) {
            await seed(`ub-many00000${i}`, "committed", ago((10 + i) * 60 * 1000))
        }

        const { resent } = await resumeStuckBatches(db(), { limit: 2 })
        expect(resent).toHaveLength(2)
        expect(enqueueImportBatch).toHaveBeenCalledTimes(2)
    })

    it("skips a committed batch that never recorded committedAt", async () => {
        await seed("ub-nostamp0000", "committed", null)

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual([])
    })

    it("reports nothing and does not throw when the enqueue fails again", async () => {
        await seed("ub-stuck000000", "committed", ago(10 * 60 * 1000))
        enqueueImportBatch.mockResolvedValueOnce({
            ok: false,
            message: "inngest down",
        } as never)

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual([])
        expect(enqueueImportBatch).toHaveBeenCalledTimes(1)
    })


    it("ignores item stamps on a committed batch — items are stamped at stage time", async () => {
        // The realistic shape of a fresh commit: the user spent ten minutes
        // dropping files (each stamped `staged` as it landed) and sealed the
        // batch thirty seconds ago. Reading item stamps here would call that
        // stuck and re-send it on every sweep.
        await seed("ub-juststaged0", "committed", ago(30 * 1000), {
            "it-0001": {
                itemId: "it-0001",
                status: "staged",
                updatedAt: ago(10 * 60 * 1000).toISOString(),
            },
            "it-0002": {
                itemId: "it-0002",
                status: "staged",
                updatedAt: ago(9 * 60 * 1000).toISOString(),
            },
        })

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual([])
        expect(enqueueImportBatch).not.toHaveBeenCalled()
    })

    it("re-sends a committed batch on committedAt even when its items moved recently", async () => {
        // The mirror image: a batch sealed ten minutes ago whose items were
        // staged seconds before the seal. `committedAt` is the only clock.
        await seed("ub-sealedold00", "committed", ago(10 * 60 * 1000), {
            "it-0001": {
                itemId: "it-0001",
                status: "staged",
                updatedAt: ago(10 * 60 * 1000 - 2000).toISOString(),
            },
        })

        expect((await resumeStuckBatches(db())).resent).toEqual(["ub-sealedold00"])
    })

    it("re-sends a processing batch whose items have gone stale", async () => {
        // The HTTP executor chains invocation to invocation; a dropped chain
        // leaves exactly this — `processing`, items outstanding, nobody coming
        // back. 15 minutes of no item movement is the tell.
        await seed("ub-stalled00000", "processing", ago(30 * 60 * 1000), {
            "it-0001": {
                itemId: "it-0001",
                status: "pending",
                updatedAt: ago(15 * 60 * 1000).toISOString(),
            },
        })

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual(["ub-stalled00000"])
    })

    it("leaves a processing batch alone while its items are still moving", async () => {
        await seed("ub-livebatch00", "processing", ago(30 * 60 * 1000), {
            "it-0001": {
                itemId: "it-0001",
                status: "imported",
                updatedAt: ago(30 * 1000).toISOString(),
            },
            "it-0002": {
                itemId: "it-0002",
                status: "pending",
                updatedAt: ago(45 * 1000).toISOString(),
            },
        })

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual([])
        expect(enqueueImportBatch).not.toHaveBeenCalled()
    })

    it("falls back to committedAt for a processing batch no item has touched", async () => {
        await seed("ub-nomoved0000", "processing", ago(30 * 60 * 1000))
        await seed("ub-justnow0000", "processing", ago(60 * 1000))

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual(["ub-nomoved0000"])
    })

    it("gives a processing batch a longer grace window than a committed one", async () => {
        // 7 minutes: past the committed window (5 min), inside the processing
        // one (10 min) — a live slice may legitimately sit on one slow chart.
        await seed("ub-committed07", "committed", ago(7 * 60 * 1000))
        await seed("ub-processng07", "processing", ago(7 * 60 * 1000))

        const { resent } = await resumeStuckBatches(db())
        expect(resent).toEqual(["ub-committed07"])
    })

    it("returns an empty list when nothing is stuck", async () => {
        expect(await resumeStuckBatches(db())).toEqual({ resent: [] })
    })
})
