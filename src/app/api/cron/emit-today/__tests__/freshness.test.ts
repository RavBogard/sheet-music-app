import { describe, it, expect, vi, beforeEach } from "vitest"
import {
    evaluateTodayFreshness,
    TODAY_STALE_AFTER_MS,
} from "@/app/api/cron/emit-today/evaluate"

/**
 * 2026-09-19 audit, item (c) — a failed `today.json` emit has to be visible.
 *
 * The shape of the bug these tests exist for: `emitToday` returns
 * `{ok:false, error}` and never throws, and since Publish was retired this
 * cron is the only writer. So the file keeps existing, keeps parsing, keeps
 * serving — and `generatedAt` quietly stops moving. Nobody finds out until a
 * musician opens the reader and sees last week's service.
 *
 * Two halves are tested here: the verdict (pure) and the route (does the
 * verdict actually reach an email, and does it shut up about a repeat).
 */

const NOW = 1_700_000_000_000
const minutesAgo = (n: number) => NOW - n * 60 * 1000

describe("evaluateTodayFreshness — the verdict", () => {
    it("is healthy and silent when both tenants emitted fresh bytes", () => {
        const v = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                { org: "crc", ok: true, readBackGeneratedAtMs: minutesAgo(1) },
                {
                    org: "brotherslazaroff",
                    ok: true,
                    readBackGeneratedAtMs: minutesAgo(2),
                },
            ],
        })
        expect(v.healthy).toBe(true)
        expect(v.problems).toEqual([])
        expect(v.signature).toBe("")
        expect(v.detail.every((d) => d.state === "ok")).toBe(true)
    })

    it("reports an emit that returned ok:false, with the error in the message", () => {
        const v = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                { org: "crc", ok: false, error: "storage bucket not found" },
                {
                    org: "brotherslazaroff",
                    ok: true,
                    readBackGeneratedAtMs: minutesAgo(1),
                },
            ],
        })
        expect(v.healthy).toBe(false)
        expect(v.problems[0]).toMatch(/crc/)
        expect(v.problems[0]).toMatch(/storage bucket not found/)
        expect(v.signature).toBe("crc:emit_failed")
    })

    it("catches the silent failure: emit claims success, the object is old", () => {
        // This is the whole point. `ok:true` and a stale object on the wire.
        const v = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                { org: "crc", ok: true, readBackGeneratedAtMs: minutesAgo(90) },
            ],
        })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("crc:stale")
        expect(v.problems[0]).toMatch(/reported success/)
        expect(v.detail[0].ageSeconds).toBe(90 * 60)
    })

    it("tolerates one missed slot but not two", () => {
        const justInside = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                {
                    org: "crc",
                    ok: true,
                    readBackGeneratedAtMs: NOW - (TODAY_STALE_AFTER_MS - 1000),
                },
            ],
        })
        expect(justInside.healthy).toBe(true)

        const justOutside = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                {
                    org: "crc",
                    ok: true,
                    readBackGeneratedAtMs: NOW - (TODAY_STALE_AFTER_MS + 1000),
                },
            ],
        })
        expect(justOutside.healthy).toBe(false)
    })

    it("reports a missing object and an unreadable one differently", () => {
        expect(
            evaluateTodayFreshness({
                now: NOW,
                outcomes: [{ org: "crc", ok: true, readBackGeneratedAtMs: null }],
            }).signature,
        ).toBe("crc:missing")

        expect(
            evaluateTodayFreshness({
                now: NOW,
                outcomes: [{ org: "crc", ok: true, readBackError: "403 forbidden" }],
            }).signature,
        ).toBe("crc:unreadable")
    })

    it("gives the same signature regardless of org order, so a repeat is recognised", () => {
        const a = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                { org: "crc", ok: false, error: "x" },
                { org: "brotherslazaroff", ok: false, error: "y" },
            ],
        })
        const b = evaluateTodayFreshness({
            now: NOW,
            outcomes: [
                { org: "brotherslazaroff", ok: false, error: "y" },
                { org: "crc", ok: false, error: "x" },
            ],
        })
        expect(a.signature).toBe(b.signature)
    })
})

// ── The route: does the verdict actually reach an email? ────────────────────

const { emitTodayMock, readStoredTodayMock, alertMock } = vi.hoisted(() => ({
    emitTodayMock: vi.fn(),
    readStoredTodayMock: vi.fn(),
    alertMock: vi.fn(
        async (_params: { problems: string[]; remedy: string }) => ({ ok: true }),
    ),
}))

vi.mock("@/lib/today/emit-today", () => ({
    emitToday: emitTodayMock,
    readStoredToday: readStoredTodayMock,
}))

vi.mock("@/lib/email", () => ({ sendBridgeHealthAlert: alertMock }))

vi.mock("@/lib/org/registry", () => ({
    ORGS: { crc: { id: "crc" } },
    DEFAULT_ORG_ID: "crc",
}))

vi.mock("@/env.mjs", () => ({ env: { CRON_SECRET: "test-secret" } }))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

/** A tiny Firestore stand-in: a lock that always grants, and one watch doc. */
let watchDoc: Record<string, unknown> | undefined
const mockFirestore = {
    collection: (name: string) => ({
        doc: () => ({
            get: async () => ({
                exists: name === "config" && watchDoc !== undefined,
                data: () => watchDoc,
            }),
            set: async (payload: Record<string, unknown>) => {
                if (name === "config") watchDoc = { ...(watchDoc ?? {}), ...payload }
            },
        }),
    }),
    runTransaction: async () => true,
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
}))

vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: () => new Date() },
}))

const authed = () =>
    new Request("https://example.test/api/cron/emit-today", {
        headers: { authorization: "Bearer test-secret" },
    }) as never

async function runCron() {
    const { GET } = await import("@/app/api/cron/emit-today/route")
    return GET(authed())
}

describe("the emit-today cron alerts when today.json is not fresh", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        watchDoc = undefined
        alertMock.mockResolvedValue({ ok: true })
    })

    it("sends nothing when the emit succeeded and the object is fresh", async () => {
        emitTodayMock.mockResolvedValue({ ok: true, path: "p", serviceCount: 2 })
        readStoredTodayMock.mockResolvedValue({
            generatedAt: new Date().toISOString(),
        })

        const body = await (await runCron()).json()
        expect(body.healthy).toBe(true)
        expect(body.notified).toBe(false)
        expect(alertMock).not.toHaveBeenCalled()
    })

    it("sends the alert when the emit failed", async () => {
        emitTodayMock.mockResolvedValue({ ok: false, error: "bucket exploded" })

        const body = await (await runCron()).json()
        expect(body.healthy).toBe(false)
        expect(body.notified).toBe(true)
        expect(alertMock).toHaveBeenCalledTimes(1)
        expect(alertMock.mock.calls[0][0].problems.join(" ")).toMatch(
            /bucket exploded/,
        )
    })

    it("sends the alert when the emit lied — ok:true over a stale object", async () => {
        emitTodayMock.mockResolvedValue({ ok: true, path: "p", serviceCount: 2 })
        readStoredTodayMock.mockResolvedValue({
            generatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        })

        const body = await (await runCron()).json()
        expect(body.healthy).toBe(false)
        expect(body.notified).toBe(true)
        expect(alertMock).toHaveBeenCalledTimes(1)
    })

    it("stays quiet on the SAME problem at the next 15-minute slot", async () => {
        emitTodayMock.mockResolvedValue({ ok: false, error: "bucket exploded" })

        const first = await (await runCron()).json()
        expect(first.notified).toBe(true)

        const second = await (await runCron()).json()
        expect(second.healthy).toBe(false)
        expect(second.notified).toBe(false)
        // Still only the one mail, six hours of failure away from the next.
        expect(alertMock).toHaveBeenCalledTimes(1)
    })

    it("speaks up again when the problem CHANGES shape", async () => {
        emitTodayMock.mockResolvedValue({ ok: false, error: "bucket exploded" })
        await runCron()
        expect(alertMock).toHaveBeenCalledTimes(1)

        // Different failure: the emit now succeeds but writes nowhere useful.
        emitTodayMock.mockResolvedValue({ ok: true, path: "p", serviceCount: 0 })
        readStoredTodayMock.mockResolvedValue(null)

        const body = await (await runCron()).json()
        expect(body.notified).toBe(true)
        expect(alertMock).toHaveBeenCalledTimes(2)
    })

    it("still regenerates when the alert itself throws", async () => {
        emitTodayMock.mockResolvedValue({ ok: false, error: "bucket exploded" })
        alertMock.mockRejectedValue(new Error("resend is down"))

        const res = await runCron()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
        expect(body.notified).toBe(false)
    })
})
