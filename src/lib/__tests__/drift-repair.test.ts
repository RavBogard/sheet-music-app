/**
 * v4.3 P10-03 — drift-repair chain with per-step retry + telemetry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockApiFetch = vi.fn()
const mockSyncSessionCookie = vi.fn()
const loggerCalls = {
    info: [] as string[],
    warn: [] as string[],
    error: [] as string[],
}

vi.mock("@/lib/api-client", () => ({
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock("@/lib/session-cookie", () => ({
    syncSessionCookie: (...args: unknown[]) => mockSyncSessionCookie(...args),
}))

vi.mock("@/lib/logger", () => ({
    logger: {
        info: (msg: string) => loggerCalls.info.push(msg),
        warn: (msg: string) => loggerCalls.warn.push(msg),
        error: (msg: string) => loggerCalls.error.push(msg),
    },
}))

import { repairDrift } from "@/lib/drift-repair"

function mockUser(getIdToken: () => Promise<string> = async () => "fresh-token") {
    return { getIdToken: vi.fn(getIdToken) } as never
}

function okRes() {
    return { ok: true } as Response
}
function failRes() {
    return { ok: false, status: 500 } as Response
}

// Helper to await repairDrift with fake timers that auto-advance so the
// 200/800ms backoffs don't burn real clock time during tests.
async function runWithFakeTimers<T>(promise: Promise<T>): Promise<T> {
    let settled = false
    const result = promise.finally(() => {
        settled = true
    })
    // Tick forward in small steps until the chain fully settles.
    while (!settled) {
        await vi.advanceTimersByTimeAsync(50)
    }
    return result
}

describe("repairDrift", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        loggerCalls.info = []
        loggerCalls.warn = []
        loggerCalls.error = []
        mockApiFetch.mockReset()
        mockSyncSessionCookie.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("happy path: all four steps succeed on first attempt", async () => {
        mockApiFetch.mockResolvedValue(okRes())
        mockSyncSessionCookie.mockResolvedValue(true)

        const summary = await runWithFakeTimers(repairDrift(mockUser()))

        expect(summary).toEqual({
            syncClaims: "ok",
            idTokenRefresh: "ok",
            sessionCookie: "ok",
            refreshSession: "ok",
        })
        const infoLines = loggerCalls.info.join("\n")
        expect(infoLines).toContain("[drift] step=syncClaims attempt=1 outcome=ok")
        expect(infoLines).toContain("[drift] step=idTokenRefresh attempt=1 outcome=ok")
        expect(infoLines).toContain("[drift] step=sessionCookie attempt=1 outcome=ok")
        expect(infoLines).toContain("[drift] step=refreshSession attempt=1 outcome=ok")
    })

    it("syncClaims recovers on attempt 2 → summary still 'ok' with recovered-after log", async () => {
        // sync-claims call order: fail, ok, then refresh-session is ok
        mockApiFetch
            .mockResolvedValueOnce(failRes()) // syncClaims #1
            .mockResolvedValueOnce(okRes())   // syncClaims #2
            .mockResolvedValueOnce(okRes())   // refreshSession
        mockSyncSessionCookie.mockResolvedValue(true)

        const summary = await runWithFakeTimers(repairDrift(mockUser()))

        expect(summary.syncClaims).toBe("ok")
        const infoLines = loggerCalls.info.join("\n")
        expect(infoLines).toMatch(/step=syncClaims attempt=2 outcome=ok recovered-after=\d+ms/)
    })

    it("syncClaims fails 3x → others are 'skipped', not 'failed'", async () => {
        mockApiFetch.mockResolvedValue(failRes())

        const summary = await runWithFakeTimers(repairDrift(mockUser()))

        expect(summary).toEqual({
            syncClaims: "failed",
            idTokenRefresh: "skipped",
            sessionCookie: "skipped",
            refreshSession: "skipped",
        })
        expect(mockSyncSessionCookie).not.toHaveBeenCalled()
    })

    it("sessionCookie fails 3x but refreshSession independently succeeds", async () => {
        mockApiFetch
            .mockResolvedValueOnce(okRes())   // syncClaims
            .mockResolvedValueOnce(okRes())   // refreshSession (called after sessionCookie fails)
        mockSyncSessionCookie.mockResolvedValue(false) // always false

        const summary = await runWithFakeTimers(repairDrift(mockUser()))

        expect(summary.syncClaims).toBe("ok")
        expect(summary.idTokenRefresh).toBe("ok")
        expect(summary.sessionCookie).toBe("failed")
        expect(summary.refreshSession).toBe("ok")
    })

    it("refreshSession fails 3x → summary marks it failed, others ok", async () => {
        mockApiFetch
            .mockResolvedValueOnce(okRes())  // syncClaims
            .mockResolvedValue(failRes())    // every subsequent apiFetch (refresh-session) fails
        mockSyncSessionCookie.mockResolvedValue(true)

        const summary = await runWithFakeTimers(repairDrift(mockUser()))

        expect(summary.syncClaims).toBe("ok")
        expect(summary.idTokenRefresh).toBe("ok")
        expect(summary.sessionCookie).toBe("ok")
        expect(summary.refreshSession).toBe("failed")
    })

    it("idTokenRefresh throws 3x → sessionCookie + refreshSession skipped", async () => {
        mockApiFetch.mockResolvedValue(okRes())
        const user = mockUser(async () => {
            throw new Error("network unreachable")
        })

        const summary = await runWithFakeTimers(repairDrift(user))

        expect(summary.syncClaims).toBe("ok")
        expect(summary.idTokenRefresh).toBe("failed")
        expect(summary.sessionCookie).toBe("skipped")
        expect(summary.refreshSession).toBe("skipped")
        expect(mockSyncSessionCookie).not.toHaveBeenCalled()
    })
})
