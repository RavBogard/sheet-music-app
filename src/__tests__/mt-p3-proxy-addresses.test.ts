/**
 * Multi-tenant phase 3 — the proxy's host resolution order, end to end through
 * `proxy()`: compiled CRC/BL → own Vercel URLs → address list → not production
 * → no such site (with the server-to-server exemption), plus the list client's
 * memo, timeout and failure behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { proxy } from "@/proxy"
import { getHostList, resetHostListMemo, HOST_LIST_TTL_MS, RETRY_AFTER_FAILURE_MS } from "@/lib/org/host-list-client"
import { resolveRequestOrg, isServerToServerPath, isOwnVercelHost } from "@/lib/org/host-resolution"
import { NO_SUCH_SITE_HTML } from "@/lib/org/no-such-site"

const LIST = {
    "centralreform.live": "crc",
    "www.centralreform.live": "crc",
    "brotherslazaroff.live": "brotherslazaroff",
    "www.brotherslazaroff.live": "brotherslazaroff",
    "testshul.vercel.app": "testshul",
    "testshul.org": "testshul",
    "www.testshul.org": "testshul",
}

let listBody: unknown = { hosts: LIST, generatedAt: "2026-10-12T00:00:00.000Z" }
let listStatus = 200
const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    void url
    return new Response(JSON.stringify(listBody), { status: listStatus, headers: { "content-type": "application/json" } })
})

function req(host: string, path: string, init: { method?: string; headers?: Record<string, string> } = {}): NextRequest {
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
    return new NextRequest(new URL(`${local ? "http" : "https"}://${host}${path}`), {
        method: init.method ?? "GET",
        headers: { host, ...(init.headers ?? {}) },
    })
}
const orgOf = (res: Response) => res.headers.get("x-middleware-request-x-org-id")

beforeEach(() => {
    resetHostListMemo()
    listBody = { hosts: LIST, generatedAt: "2026-10-12T00:00:00.000Z" }
    listStatus = 200
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

describe("production", () => {
    beforeEach(() => vi.stubEnv("VERCEL_ENV", "production"))

    it("(a) CRC/BL hosts resolve from the compiled map with no fetch", async () => {
        expect(orgOf(await proxy(req("www.centralreform.live", "/perform")))).toBe("crc")
        expect(orgOf(await proxy(req("brotherslazaroff.live", "/perform")))).toBe("brotherslazaroff")
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("(b) the project's own Vercel URLs → crc with no fetch", async () => {
        for (const host of [
            "sheet-music-app.vercel.app",
            "sheet-music-app-ravbogards-projects.vercel.app",
            "sheet-music-app-git-feature-x-ravbogards-projects.vercel.app",
            "sheet-music-app-9f8e7d6c5-ravbogards-projects.vercel.app",
        ]) {
            expect(orgOf(await proxy(req(host, "/perform")))).toBe("crc")
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("(b) look-alike Vercel hosts are not the project's own", () => {
        expect(isOwnVercelHost("sheet-music-app-evil.vercel.app")).toBe(false)
        expect(isOwnVercelHost("evil-sheet-music-app.vercel.app")).toBe(false)
        expect(isOwnVercelHost("sheet-music-app-x-ravbogards-projects.vercel.app.evil.com")).toBe(false)
    })

    it("(c) a third tenant's vercel.app alias resolves through the list", async () => {
        const res = await proxy(req("testshul.vercel.app", "/perform"))
        expect(res.status).toBe(200)
        expect(orgOf(res)).toBe("testshul")
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(String(fetchMock.mock.calls[0][0])).toBe("https://testshul.vercel.app/api/org-hosts")
    })

    it("(c) custom domain bare and www both resolve; the list is memoised", async () => {
        expect(orgOf(await proxy(req("www.testshul.org", "/perform")))).toBe("testshul")
        expect(orgOf(await proxy(req("testshul.org", "/perform")))).toBe("testshul")
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("(c) x-org-id is overwritten even when the client sends one", async () => {
        const res = await proxy(req("testshul.vercel.app", "/perform", { headers: { "x-org-id": "crc" } }))
        expect(orgOf(res)).toBe("testshul")
    })

    it("(e) an unknown address gets the plain no-such-site page, 404, no CRC", async () => {
        const res = await proxy(req("unknown.vercel.app", "/perform"))
        expect(res.status).toBe(404)
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
        expect(res.headers.get("cache-control")).toBe("no-store")
        expect(orgOf(res)).toBeNull()
        const html = await res.text()
        expect(html).toBe(NO_SUCH_SITE_HTML)
        expect(html).toContain("<title>No such site</title>")
        expect(html).toContain("<h1>No such site</h1>")
        expect(html).toContain("<p>There is no site at this address.</p>")
        expect(html).not.toMatch(/CRC|Central Reform|Lazaroff|sign in|login|<script|<a /i)
    })

    it.each(["/", "/login", "/setlists", "/perform/setlist/abc", "/.well-known/oauth-protected-resource", "/manage"])(
        "(e) unknown address, page %s → no such site (before any auth redirect)",
        async (path) => {
            const res = await proxy(req("nobody.example.org", path))
            expect(res.status).toBe(404)
            expect(res.headers.get("location")).toBeNull()
        },
    )

    it("(e) social crawlers get no such site too", async () => {
        const res = await proxy(req("nobody.example.org", "/perform", { headers: { "user-agent": "Slackbot 1.0" } }))
        expect(res.status).toBe(404)
    })

    it("(e) POST /login on an unknown address → no such site, not the 405 helper", async () => {
        const res = await proxy(req("nobody.example.org", "/login", { method: "POST" }))
        expect(res.status).toBe(404)
    })

    it.each(["/api/mcp", "/api/ops/mcp", "/api/mcp/oauth/token", "/api/mcp/oauth/authorize", "/api/auth/session", "/api/health"])(
        "(e) unknown address, API %s → 404 JSON",
        async (path) => {
            const res = await proxy(req("nobody.example.org", path, { method: path === "/api/health" ? "GET" : "POST" }))
            expect(res.status).toBe(404)
            const body = await res.json()
            expect(body.error.code).toBe(404)
            expect(body.error.machine_code).toBe("no_such_site")
            expect(body.error.message).toBe("There is no site at this address.")
        },
    )

    it("(e) a suspended tenant (absent from the list) gets no such site", async () => {
        listBody = { hosts: { ...LIST, "testshul.vercel.app": undefined }, generatedAt: "x" }
        const res = await proxy(req("testshul.vercel.app", "/perform"))
        expect(res.status).toBe(404)
    })

    it.each([
        "/api/cron/drive-sync",
        "/api/cron/scheduling-reminder",
        "/api/webhooks/resend",
        "/api/inngest",
        "/api/intake/run",
        "/api/bridge/setup-code",
    ])("server-to-server %s on an unknown address keeps resolving to crc", async (path) => {
        const res = await proxy(req("nobody.example.org", path))
        expect(res.status).toBe(200)
        expect(orgOf(res)).toBe("crc")
    })

    it("server-to-server paths on a listed third-tenant address resolve to that tenant", async () => {
        expect(orgOf(await proxy(req("testshul.vercel.app", "/api/cron/emit-today")))).toBe("testshul")
    })

    it("the address-list endpoint itself never fetches the list (no recursion)", async () => {
        const res = await proxy(req("nobody.example.org", "/api/org-hosts"))
        expect(res.status).toBe(200)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("list fetch failure with no list yet → no such site, not CRC", async () => {
        listStatus = 500
        const res = await proxy(req("testshul.vercel.app", "/perform"))
        expect(res.status).toBe(404)
    })

    it("list fetch failure keeps the last good list", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date("2026-10-12T12:00:00Z"))
        expect(orgOf(await proxy(req("testshul.vercel.app", "/perform")))).toBe("testshul")
        listStatus = 503
        vi.setSystemTime(new Date(Date.now() + HOST_LIST_TTL_MS + 1))
        expect(orgOf(await proxy(req("testshul.vercel.app", "/perform")))).toBe("testshul")
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("a malformed list body counts as a failure", async () => {
        listBody = { nope: true }
        expect((await proxy(req("testshul.vercel.app", "/perform"))).status).toBe(404)
    })
})

describe("not production", () => {
    it.each([["preview"], ["development"], [undefined]])("VERCEL_ENV=%s: unknown address → crc", async (env) => {
        if (env) vi.stubEnv("VERCEL_ENV", env)
        const res = await proxy(req("nobody.example.org", "/perform"))
        expect(res.status).toBe(200)
        expect(orgOf(res)).toBe("crc")
    })

    it("preview: a listed third-tenant address still resolves to it", async () => {
        vi.stubEnv("VERCEL_ENV", "preview")
        expect(orgOf(await proxy(req("testshul.vercel.app", "/perform")))).toBe("testshul")
    })

    it("localhost → crc in any environment, with no fetch", async () => {
        vi.stubEnv("VERCEL_ENV", "production")
        expect(orgOf(await proxy(req("localhost:3000", "/perform")))).toBe("crc")
        expect(orgOf(await proxy(req("127.0.0.1:3000", "/perform")))).toBe("crc")
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe("resolveRequestOrg (pure)", () => {
    const list = async () => LIST as Record<string, string>
    it.each([
        ["www.centralreform.live", "production", { orgId: "crc", via: "compiled" }],
        ["sheet-music-app.vercel.app", "production", { orgId: "crc", via: "own-vercel" }],
        ["testshul.vercel.app", "production", { orgId: "testshul", via: "list" }],
        ["localhost:3000", "production", { orgId: "crc", via: "localhost" }],
        ["nobody.org", "preview", { orgId: "crc", via: "non-production" }],
        ["nobody.org", "production", { orgId: null, via: "no-such-site" }],
        ["", "production", { orgId: null, via: "no-such-site" }],
    ])("%s (%s)", async (host, env, expected) => {
        expect(await resolveRequestOrg({ host, pathname: "/perform", vercelEnv: env }, list)).toEqual(expected)
    })

    it("a throwing list getter is treated as no list", async () => {
        const r = await resolveRequestOrg({ host: "testshul.vercel.app", pathname: "/", vercelEnv: "production" }, async () => {
            throw new Error("boom")
        })
        expect(r.orgId).toBeNull()
    })

    it("a list entry naming a malformed id is ignored", async () => {
        const r = await resolveRequestOrg({ host: "x.vercel.app", pathname: "/", vercelEnv: "production" }, async () => ({
            "x.vercel.app": "Bad Id",
        }))
        expect(r.orgId).toBeNull()
    })

    it("server-to-server paths", () => {
        expect(isServerToServerPath("/api/cron/backup")).toBe(true)
        expect(isServerToServerPath("/api/webhooks/resend")).toBe(true)
        expect(isServerToServerPath("/api/inngest")).toBe(true)
        expect(isServerToServerPath("/api/inngest/")).toBe(true)
        expect(isServerToServerPath("/api/mcp")).toBe(false)
        expect(isServerToServerPath("/api/cronx")).toBe(false)
        expect(isServerToServerPath("/api/auth/session")).toBe(false)
    })
})

describe("host list client", () => {
    it("memoises for 60 s, then refetches", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date("2026-10-12T12:00:00Z"))
        await getHostList("https://a.example")
        await getHostList("https://a.example")
        expect(fetchMock).toHaveBeenCalledTimes(1)
        vi.setSystemTime(new Date(Date.now() + HOST_LIST_TTL_MS + 1))
        await getHostList("https://a.example")
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("concurrent callers share one fetch", async () => {
        const [a, b] = await Promise.all([getHostList("https://a.example"), getHostList("https://a.example")])
        expect(a).toEqual(LIST)
        expect(b).toEqual(LIST)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("after a failure, waits before trying again", async () => {
        vi.useFakeTimers({ toFake: ["Date"] })
        vi.setSystemTime(new Date("2026-10-12T12:00:00Z"))
        listStatus = 500
        expect(await getHostList("https://a.example")).toBeNull()
        expect(await getHostList("https://a.example")).toBeNull()
        expect(fetchMock).toHaveBeenCalledTimes(1)
        listStatus = 200
        vi.setSystemTime(new Date(Date.now() + RETRY_AFTER_FAILURE_MS + 1))
        expect(await getHostList("https://a.example")).toEqual(LIST)
    })

    it("never waits more than ~1.5 s for a hung fetch", async () => {
        const hung = vi.fn(
            (_u: string | URL, init?: RequestInit) =>
                new Promise<Response>((_, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
                }),
        )
        const started = Date.now()
        const result = await getHostList("https://a.example", { fetchImpl: hung as unknown as typeof fetch })
        const waited = Date.now() - started
        expect(result).toBeNull()
        expect(waited).toBeGreaterThanOrEqual(1400)
        expect(waited).toBeLessThan(2500)
    })
})
