/**
 * Batch chart intake — executor selection.
 *
 * Production Vercel has no `INNGEST_EVENT_KEY`, and nothing in `src/` has ever
 * sent the one registered Inngest function an event. So the DEFAULT executor
 * is the plain HTTP self-chaining run route; Inngest is opt-in and only when
 * it is actually configured. This suite pins both halves of that switch and
 * the HTTP send itself (URL, bearer, 202-or-nothing).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

/** A partial env literal, as the env-reading helpers actually see one. */
const envOf = (vars: Record<string, string>) =>
    vars as unknown as NodeJS.ProcessEnv

const inngestSend = vi.fn(async () => ({ ids: ["evt-from-inngest"] }))
vi.mock("@/inngest/client", () => ({
    inngest: {
        send: (...args: unknown[]) => inngestSend(...(args as [])),
        // import-batch-job registers its function at module load; this suite
        // never runs it.
        createFunction: (config: unknown, trigger: unknown, handler: unknown) => ({
            config,
            trigger,
            handler,
        }),
    },
}))

const triggerHttpRun = vi.fn(async (_batchId: string) => ({
    ok: true as const,
}))
vi.mock("../http-executor", () => ({
    triggerHttpRun: (batchId: string) => triggerHttpRun(batchId),
}))

import { enqueueImportBatch, selectExecutor } from "../enqueue"

describe("selectExecutor", () => {
    it("defaults to http", () => {
        expect(selectExecutor(envOf({}))).toBe("http")
    })

    it("stays http when INTAKE_EXECUTOR asks for inngest but no event key is set", () => {
        expect(
            selectExecutor(envOf({ INTAKE_EXECUTOR: "inngest" })),
        ).toBe("http")
    })

    it("stays http when an event key exists but the executor was never opted in", () => {
        expect(
            selectExecutor(envOf({ INNGEST_EVENT_KEY: "key" })),
        ).toBe("http")
    })

    it("selects inngest only with both", () => {
        expect(
            selectExecutor(envOf({
                INTAKE_EXECUTOR: "inngest",
                INNGEST_EVENT_KEY: "key",
            })),
        ).toBe("inngest")
    })
})

describe("enqueueImportBatch", () => {
    beforeEach(() => {
        inngestSend.mockClear()
        triggerHttpRun.mockClear()
        triggerHttpRun.mockResolvedValue({ ok: true as const })
        delete process.env.INTAKE_EXECUTOR
        delete process.env.INNGEST_EVENT_KEY
    })

    it("takes the http path by default and reports the executor", async () => {
        const res = await enqueueImportBatch("ub-abc123456789")

        expect(triggerHttpRun).toHaveBeenCalledWith("ub-abc123456789")
        expect(inngestSend).not.toHaveBeenCalled()
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

    it("sends an Inngest event when both env vars are set", async () => {
        process.env.INTAKE_EXECUTOR = "inngest"
        process.env.INNGEST_EVENT_KEY = "key"

        const res = await enqueueImportBatch("ub-abc123456789")

        expect(inngestSend).toHaveBeenCalledWith({
            name: "library/import-batch",
            data: { batchId: "ub-abc123456789" },
        })
        expect(triggerHttpRun).not.toHaveBeenCalled()
        expect(res).toEqual({
            ok: true,
            eventId: "evt-from-inngest",
            executor: "inngest",
        })
    })

    it("never throws when the Inngest send blows up", async () => {
        process.env.INTAKE_EXECUTOR = "inngest"
        process.env.INNGEST_EVENT_KEY = "key"
        inngestSend.mockRejectedValueOnce(new Error("inngest down") as never)

        expect(await enqueueImportBatch("ub-abc123456789")).toEqual({
            ok: false,
            message: "inngest down",
        })
    })
})
