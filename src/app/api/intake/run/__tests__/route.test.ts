/**
 * POST /api/intake/run — the internal batch executor endpoint.
 *
 * This is the self-chaining half of the HTTP executor: the commit path (and
 * the run itself, when it hits its deadline) POSTs a batch id here, the route
 * answers 202 immediately, and `after()` keeps the function alive to do the
 * work. The contract worth pinning is the boundary, not the import loop:
 * nothing runs without the internal bearer, and the scheduled work can never
 * reject out of `after()`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// `after` is a Next runtime hook; capture the callback so the test drives it.
const afterCallbacks: Array<() => unknown> = []
vi.mock("next/server", async () => {
    const actual = await vi.importActual<typeof import("next/server")>("next/server")
    return {
        ...actual,
        after: (fn: () => unknown) => {
            afterCallbacks.push(fn)
        },
    }
})

// `vi.hoisted` because the mock factory below is hoisted above these consts,
// and the route is asserted to pass THIS function object as its re-trigger.
const { runBatchWithDeadline, triggerHttpRun } = vi.hoisted(() => ({
    runBatchWithDeadline: vi.fn(async () => ({
        processed: 1,
        remaining: 0,
        finalized: true,
    })),
    triggerHttpRun: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock("@/lib/intake/http-executor", () => ({
    RUN_TIME_BUDGET_MS: 240_000,
    runBatchWithDeadline,
    triggerHttpRun,
    internalRunSecret: (env: NodeJS.ProcessEnv = process.env) =>
        env.INTAKE_RUN_SECRET ?? env.CRON_SECRET,
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({ fake: "db" }),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { POST } from "../route"

const SECRET = "run-secret"

async function post(opts: { token?: string; body?: Record<string, unknown> }) {
    return POST(
        makeReq("/api/intake/run", {
            method: "POST",
            token: opts.token,
            body: opts.body ?? { batchId: "ub-abc123456789" },
        }),
    )
}

describe("POST /api/intake/run", () => {
    beforeEach(() => {
        afterCallbacks.length = 0
        runBatchWithDeadline.mockClear()
        runBatchWithDeadline.mockResolvedValue({
            processed: 1,
            remaining: 0,
            finalized: true,
        })
        process.env.INTAKE_RUN_SECRET = SECRET
    })

    it("401s without the internal bearer and schedules nothing", async () => {
        const res = await post({})
        expect(res.status).toBe(401)
        expect(afterCallbacks).toHaveLength(0)
        expect(runBatchWithDeadline).not.toHaveBeenCalled()
    })

    it("401s on a wrong bearer", async () => {
        expect((await post({ token: "nope-nope-nope" })).status).toBe(401)
        expect(runBatchWithDeadline).not.toHaveBeenCalled()
    })

    it("401s on a same-length secret that encodes to a different byte length", async () => {
        // "é" is one UTF-16 code unit and two UTF-8 bytes. Comparing string
        // lengths would send unequal buffers into timingSafeEqual, which throws
        // — a wrong secret must be a 401, never a 500.
        process.env.INTAKE_RUN_SECRET = "run-secreta"
        const res = await post({ token: "run-secret\u00e9" })

        expect(res.status).toBe(401)
        expect(runBatchWithDeadline).not.toHaveBeenCalled()
    })

    it("500s and processes nothing when no secret is configured", async () => {
        delete process.env.INTAKE_RUN_SECRET
        delete process.env.CRON_SECRET

        const res = await post({ token: SECRET })
        expect(res.status).toBe(500)
        expect(runBatchWithDeadline).not.toHaveBeenCalled()
    })

    it("400s on a missing batchId", async () => {
        const res = await post({ token: SECRET, body: {} })
        expect(res.status).toBe(400)
        expect(runBatchWithDeadline).not.toHaveBeenCalled()
    })

    it("202s immediately and runs the batch in after()", async () => {
        const res = await post({ token: SECRET })

        expect(res.status).toBe(202)
        expect(await res.json()).toEqual({
            accepted: true,
            batchId: "ub-abc123456789",
        })
        // Nothing has run yet — the response went out first.
        expect(runBatchWithDeadline).not.toHaveBeenCalled()

        expect(afterCallbacks).toHaveLength(1)
        await afterCallbacks[0]!()

        expect(runBatchWithDeadline).toHaveBeenCalledTimes(1)
        const [db, batchId, opts] = runBatchWithDeadline.mock.calls[0] as unknown as [
            unknown,
            string,
            { deadlineAt: number; retrigger: unknown },
        ]
        expect(db).toEqual({ fake: "db" })
        expect(batchId).toBe("ub-abc123456789")
        expect(opts.deadlineAt).toBeGreaterThan(Date.now() + 200_000)
        expect(opts.retrigger).toBe(triggerHttpRun)
    })

    it("swallows a runner explosion so after() never sees a rejection", async () => {
        runBatchWithDeadline.mockRejectedValueOnce(new Error("boom") as never)

        expect((await post({ token: SECRET })).status).toBe(202)
        await expect(afterCallbacks[0]!()).resolves.not.toThrow()
    })
})
