import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchHistory, historyConfigured } from "../history-client"
import { historyInstant } from "../types"
import rehearsal from "../__fixtures__/history-rehearsal.json"

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

/**
 * The RESPONSE, against a real captured one.
 *
 * `history-rehearsal.json` is the canonical sample from the Overlays repo
 * (`work/handoffs/cue-log/history-rehearsal.json`), copied verbatim. Its
 * `at` is `1789420709619` — a number — and this client required a string, so
 * every row it has ever been sent was dropped on the floor and
 * `reconcile_service` reported "no cues were logged" for a service that had
 * logged them all. Testing against the capture rather than against a fixture
 * we wrote ourselves is the whole point: a fixture agrees with whatever it
 * was written to agree with.
 */
describe("fetchHistory — the response", () => {
    const BASE = "https://overlays.example"
    const WINDOW = {
        since: "2026-09-13T16:30:00.000Z",
        until: "2026-09-13T21:00:00.000Z",
    }

    beforeEach(() => {
        process.env.OVERLAYS_BASE_URL = BASE
        process.env.OVERLAYS_HISTORY_TOKEN = "cd_secret"
        process.env.OVERLAYS_WORKSPACE = "rehearsal"
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        delete process.env.OVERLAYS_BASE_URL
        delete process.env.OVERLAYS_HISTORY_TOKEN
        delete process.env.OVERLAYS_WORKSPACE
    })

    it("reads the captured response instead of dropping every row", async () => {
        vi.stubGlobal(
            "fetch",
            async () =>
                new Response(JSON.stringify(rehearsal), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
        )
        const res = await fetchHistory(WINDOW)
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.rows).toHaveLength(rehearsal.rows.length)
        expect(res.rows[0].seq).toBe(9)
        expect(res.rows[0].at).toBe(1789420709619)
        // Whatever shape arrived, one function turns it into an instant.
        expect(historyInstant(res.rows[0].at)).toBe("2026-09-14T21:18:29.619Z")
    })

    it("still accepts an ISO instant", async () => {
        vi.stubGlobal(
            "fetch",
            async () =>
                new Response(
                    JSON.stringify({
                        workspace: "rehearsal",
                        rows: [{ seq: 1, at: "2026-09-14T16:38:29.619Z", action: "in" }],
                    }),
                    { status: 200 },
                ),
        )
        const res = await fetchHistory(WINDOW)
        expect(res.ok && res.rows).toHaveLength(1)
    })

    it("refuses another workspace's cue log rather than reconciling it", async () => {
        process.env.OVERLAYS_WORKSPACE = "crc"
        vi.stubGlobal(
            "fetch",
            async () =>
                new Response(JSON.stringify(rehearsal), { status: 200 }),
        )
        const res = await fetchHistory(WINDOW)
        expect(res.ok).toBe(false)
        if (!res.ok) {
            expect(res.code).toBe("history_wrong_workspace")
            expect(res.message).toContain("rehearsal")
        }
    })

    it("follows nextAfter so a long service is not truncated at 500 rows", async () => {
        const seen: Array<string | null> = []
        vi.stubGlobal("fetch", async (input: URL | string) => {
            const after = new URL(String(input)).searchParams.get("after")
            seen.push(after)
            const body =
                after === null
                    ? { workspace: "rehearsal", rows: [{ seq: 1, at: 1 }], nextAfter: 1 }
                    : { workspace: "rehearsal", rows: [{ seq: 2, at: 2 }], nextAfter: null }
            return new Response(JSON.stringify(body), { status: 200 })
        })
        const res = await fetchHistory(WINDOW)
        expect(seen).toEqual([null, "1"])
        expect(res.ok && res.rows.map((r) => r.seq)).toEqual([1, 2])
    })

    it("refuses rather than returning half a service when the cursor never ends", async () => {
        vi.stubGlobal("fetch", async (input: URL | string) => {
            const after = Number(new URL(String(input)).searchParams.get("after") ?? 0)
            return new Response(
                JSON.stringify({
                    workspace: "rehearsal",
                    rows: [{ seq: after + 1, at: after + 1 }],
                    nextAfter: after + 1,
                }),
                { status: 200 },
            )
        })
        const res = await fetchHistory(WINDOW)
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.code).toBe("history_too_many_pages")
    })
})
