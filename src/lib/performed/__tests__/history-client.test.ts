import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchHistory, historyConfigured } from "../history-client"

/**
 * Part D — the cue-history client's REQUEST, which is the half a fixture
 * cannot see.
 *
 * The reconcile engine is fixture-tested and was green while the live call
 * had never once succeeded: Overlays wants `?since=<ms>&until=<ms>` and this
 * client was sending ISO strings, so production answered 400 the first time
 * both env vars were set. A fixture has no opinion about a query string, so
 * these tests hold the wire format instead.
 */
describe("fetchHistory — the request", () => {
    const BASE = "https://overlays.example"
    let calls: Array<{ url: URL; init: RequestInit }>

    beforeEach(() => {
        calls = []
        process.env.OVERLAYS_BASE_URL = BASE
        process.env.OVERLAYS_HISTORY_TOKEN = "cd_secret"
        vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit) => {
            calls.push({ url: new URL(String(input)), init })
            return new Response(JSON.stringify({ rows: [] }), {
                status: 200,
                headers: { "content-type": "application/json" },
            })
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        delete process.env.OVERLAYS_BASE_URL
        delete process.env.OVERLAYS_HISTORY_TOKEN
    })

    it("sends the window as epoch milliseconds, not ISO", async () => {
        await fetchHistory({
            since: "2026-09-13T16:30:00.000Z",
            until: "2026-09-13T21:00:00.000Z",
        })
        const q = calls[0].url.searchParams
        expect(q.get("since")).toBe("1789317000000")
        expect(q.get("until")).toBe("1789333200000")
        expect(calls[0].url.pathname).toBe("/api/history")
    })

    it("refuses an unparseable window instead of sending NaN", async () => {
        const res = await fetchHistory({ since: "yesterday", until: "now" })
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.code).toBe("history_bad_window")
        expect(calls).toHaveLength(0)
    })

    it("never follows a redirect, which would hand the bearer to another host", async () => {
        await fetchHistory({
            since: "2026-09-13T16:30:00.000Z",
            until: "2026-09-13T21:00:00.000Z",
        })
        expect(calls[0].init.redirect).toBe("error")
    })

    it("says nothing about the token in a failure a caller can see", async () => {
        vi.stubGlobal("fetch", async () => new Response("nope", { status: 403 }))
        const res = await fetchHistory({
            since: "2026-09-13T16:30:00.000Z",
            until: "2026-09-13T21:00:00.000Z",
        })
        expect(res.ok).toBe(false)
        if (!res.ok) {
            expect(res.message).not.toContain("cd_secret")
            expect(res.message).toBe("Overlays /api/history returned 403.")
        }
    })

    it("is not configured when either half is missing", async () => {
        expect(historyConfigured()).toBe(true)
        delete process.env.OVERLAYS_HISTORY_TOKEN
        expect(historyConfigured()).toBe(false)
        const res = await fetchHistory({
            since: "2026-09-13T16:30:00.000Z",
            until: "2026-09-13T21:00:00.000Z",
        })
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.code).toBe("history_not_configured")
    })
})
