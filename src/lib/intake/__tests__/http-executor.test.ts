/**
 * Batch chart intake — the HTTP executor's send half (unit).
 *
 * `runBatchWithDeadline` needs Firestore and lives in
 * `http-executor.emulator.test.ts`; everything here is pure env/fetch wiring:
 * which URL a function calls itself back on, which secret it presents, and the
 * fact that only a 202 counts as "the run route took it".
 */
import { describe, expect, it, vi } from "vitest"

/** A partial env literal, as the env-reading helpers actually see one. */
const envOf = (vars: Record<string, string>) =>
    vars as unknown as NodeJS.ProcessEnv

vi.mock("@/inngest/client", () => ({
    inngest: { send: vi.fn(), createFunction: () => ({}) },
}))

import {
    RUN_TIME_BUDGET_MS,
    intakeRunUrl,
    internalRunSecret,
    triggerHttpRun,
} from "../http-executor"

describe("intakeRunUrl", () => {
    it("prefers an explicit internal base URL", () => {
        expect(
            intakeRunUrl(envOf({
                INTAKE_INTERNAL_BASE_URL: "https://staging.example.com",
                VERCEL_PROJECT_PRODUCTION_URL: "centralreform.live",
            })),
        ).toBe("https://staging.example.com/api/intake/run")
    })

    it("falls back to the stable production domain, then the deployment URL", () => {
        expect(
            intakeRunUrl(envOf({
                VERCEL_PROJECT_PRODUCTION_URL: "centralreform.live",
                VERCEL_URL: "deployment-xyz.vercel.app",
            })),
        ).toBe("https://centralreform.live/api/intake/run")
        expect(
            intakeRunUrl(envOf({
                VERCEL_URL: "deployment-xyz.vercel.app",
            })),
        ).toBe("https://deployment-xyz.vercel.app/api/intake/run")
    })

    it("falls back to localhost off-platform", () => {
        expect(intakeRunUrl(envOf({}))).toBe(
            "http://localhost:3000/api/intake/run",
        )
    })
})

describe("internalRunSecret", () => {
    it("prefers INTAKE_RUN_SECRET and falls back to CRON_SECRET", () => {
        expect(
            internalRunSecret(envOf({
                INTAKE_RUN_SECRET: "intake",
                CRON_SECRET: "cron",
            })),
        ).toBe("intake")
        expect(
            internalRunSecret(envOf({ CRON_SECRET: "cron" })),
        ).toBe("cron")
        expect(internalRunSecret(envOf({}))).toBeUndefined()
    })
})

describe("triggerHttpRun", () => {
    const env = envOf({
        INTAKE_INTERNAL_BASE_URL: "https://centralreform.live",
        INTAKE_RUN_SECRET: "s3cret",
    })

    it("POSTs the batch id with the bearer and accepts a 202", async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))

        expect(
            await triggerHttpRun("ub-abc123456789", {
                fetch: fetchMock as unknown as typeof fetch,
                env,
            }),
        ).toEqual({ ok: true })

        const [url, init] = fetchMock.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ]
        expect(url).toBe("https://centralreform.live/api/intake/run")
        expect(init.method).toBe("POST")
        expect(JSON.parse(init.body as string)).toEqual({
            batchId: "ub-abc123456789",
        })
        expect(new Headers(init.headers).get("authorization")).toBe(
            "Bearer s3cret",
        )
        expect((init as { signal?: AbortSignal }).signal).toBeInstanceOf(
            AbortSignal,
        )
    })

    it("treats any non-202 as a failed trigger", async () => {
        const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }))

        const res = await triggerHttpRun("ub-abc123456789", {
            fetch: fetchMock as unknown as typeof fetch,
            env,
        })
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.message).toContain("500")
    })

    it("never throws when fetch itself rejects", async () => {
        const fetchMock = vi.fn(async () => {
            throw new Error("ECONNREFUSED")
        })

        expect(
            await triggerHttpRun("ub-abc123456789", {
                fetch: fetchMock as unknown as typeof fetch,
                env,
            }),
        ).toEqual({ ok: false, message: "ECONNREFUSED" })
    })

    it("refuses to fire without a configured secret", async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))

        const res = await triggerHttpRun("ub-abc123456789", {
            fetch: fetchMock as unknown as typeof fetch,
            env: envOf({}),
        })
        expect(res.ok).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe("RUN_TIME_BUDGET_MS", () => {
    it("leaves 60s of headroom under the route's maxDuration of 300s", () => {
        expect(RUN_TIME_BUDGET_MS).toBe(240_000)
    })
})
