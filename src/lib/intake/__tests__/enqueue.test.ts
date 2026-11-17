/**
 * Batch chart intake — handing a committed batch to the HTTP self-chaining
 * run route. This suite pins the hand-off and its never-throw failure value.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const triggerHttpRun = vi.fn(async (_batchId: string) => ({
    ok: true as const,
}))
vi.mock("../http-executor", () => ({
    triggerHttpRun: (batchId: string) => triggerHttpRun(batchId),
}))

import { enqueueImportBatch } from "../enqueue"

describe("enqueueImportBatch", () => {
    beforeEach(() => {
        triggerHttpRun.mockClear()
        triggerHttpRun.mockResolvedValue({ ok: true as const })
    })

    it("takes the http path and reports the executor", async () => {
        const res = await enqueueImportBatch("ub-abc123456789")

        expect(triggerHttpRun).toHaveBeenCalledWith("ub-abc123456789")
        expect(res).toMatchObject({ ok: true, executor: "http" })
        if (res.ok) expect(res.eventId).toMatch(/^http:ub-abc123456789:\d+$/)
    })

    it("reports ok:false when the run route does not accept", async () => {
        triggerHttpRun.mockResolvedValue({
            ok: false,
            message: "run route responded 500",
        } as never)

        const res = await enqueueImportBatch("ub-abc123456789")
        expect(res).toEqual({ ok: false, message: "run route responded 500" })
    })
})
