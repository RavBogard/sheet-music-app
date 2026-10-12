/**
 * Multi-tenant phase 3 (addresses) — GOLDEN tests.
 *
 * Written and committed BEFORE the address-list / no-such-site change and
 * passing on the unchanged code. They pin what CRC and Brothers Lazaroff see
 * today: which tenant every CRC/BL host (and the project's own Vercel URLs and
 * localhost) resolves to, the security headers on those responses, the OAuth
 * discovery metadata, the MCP 401 challenge, and robots/sitemap. Phase 3 must
 * leave every one of these byte-identical.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const headerStore = new Map<string, string>()
vi.mock("next/headers", () => ({
    headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
    cookies: async () => ({ get: () => undefined }),
}))

import { proxy } from "@/proxy"
import { GET as protectedResourceGET } from "@/app/.well-known/oauth-protected-resource/route"
import { GET as authServerGET } from "@/app/.well-known/oauth-authorization-server/route"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"

const CRC_HOSTS = ["centralreform.live", "www.centralreform.live", "WWW.CentralReform.Live", "www.centralreform.live:443"]
const BL_HOSTS = ["brotherslazaroff.live", "www.brotherslazaroff.live", "WWW.BrothersLazaroff.LIVE:443"]
const OWN_VERCEL_HOSTS = [
    "sheet-music-app.vercel.app",
    "sheet-music-app-ravbogards-projects.vercel.app",
    "sheet-music-app-git-master-ravbogards-projects.vercel.app",
    "sheet-music-app-git-mt-p3-lane1-ravbogards-projects.vercel.app",
    "sheet-music-app-a1b2c3d4e-ravbogards-projects.vercel.app",
]
const LOCAL_HOSTS = ["localhost", "localhost:3000", "127.0.0.1:3000"]

function proxyReq(host: string, path: string, init: { method?: string } = {}): NextRequest {
    const bare = host.toLowerCase().replace(/:\d+$/, "")
    const url = bare === "localhost" || bare === "127.0.0.1" ? `http://${host}${path}` : `https://${host}${path}`
    return new NextRequest(new URL(url), { method: init.method ?? "GET", headers: { host } })
}

/** NextResponse.next({ request: { headers } }) exposes overridden request headers this way. */
function forwardedOrgId(res: Response): string | null {
    return res.headers.get("x-middleware-request-x-org-id")
}

const fetchSpy = vi.fn(async () => {
    throw new Error("golden hosts must resolve without a network fetch")
})

beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy)
    fetchSpy.mockClear()
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

describe.each([
    ["no VERCEL_ENV (local / test)", undefined],
    ["VERCEL_ENV=production", "production"],
    ["VERCEL_ENV=preview", "preview"],
])("golden: proxy host → tenant (%s)", (_label, vercelEnv) => {
    beforeEach(() => {
        if (vercelEnv) vi.stubEnv("VERCEL_ENV", vercelEnv)
    })

    const paths = ["/perform", "/api/mcp", "/api/cron/drive-sync", "/.well-known/oauth-protected-resource", "/login"]

    it.each(CRC_HOSTS.flatMap((h) => paths.map((p) => [h, p])))("CRC host %s %s → crc", async (host, path) => {
        const res = await proxy(proxyReq(host, path))
        expect(forwardedOrgId(res)).toBe("crc")
        expect(res.status).not.toBe(404)
    })

    it.each(BL_HOSTS.flatMap((h) => paths.map((p) => [h, p])))("BL host %s %s → brotherslazaroff", async (host, path) => {
        const res = await proxy(proxyReq(host, path))
        expect(forwardedOrgId(res)).toBe("brotherslazaroff")
        expect(res.status).not.toBe(404)
    })

    it.each(OWN_VERCEL_HOSTS.flatMap((h) => paths.map((p) => [h, p])))("own Vercel URL %s %s → crc", async (host, path) => {
        const res = await proxy(proxyReq(host, path))
        expect(forwardedOrgId(res)).toBe("crc")
        expect(res.status).not.toBe(404)
    })

    it("no network fetch was needed for any compiled / own-Vercel host", () => {
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe("golden: proxy host → tenant, localhost (not production)", () => {
    it.each(LOCAL_HOSTS)("%s → crc", async (host) => {
        const res = await proxy(proxyReq(host, "/perform"))
        expect(forwardedOrgId(res)).toBe("crc")
    })
})

describe("golden: x-org-id is an unconditional overwrite", () => {
    it.each([
        ["www.centralreform.live", "brotherslazaroff", "crc"],
        ["www.brotherslazaroff.live", "crc", "brotherslazaroff"],
        ["sheet-music-app.vercel.app", "brotherslazaroff", "crc"],
    ])("%s with spoofed x-org-id=%s → %s", async (host, spoof, expected) => {
        const req = new NextRequest(new URL(`https://${host}/perform`), { headers: { host, "x-org-id": spoof } })
        const res = await proxy(req)
        expect(forwardedOrgId(res)).toBe(expected)
    })
})

describe("golden: proxy response shape on CRC/BL hosts", () => {
    it.each(["www.centralreform.live", "www.brotherslazaroff.live"])("%s public page: passthrough with CSP + nonce", async (host) => {
        const res = await proxy(proxyReq(host, "/perform"))
        expect(res.status).toBe(200)
        expect(res.headers.get("location")).toBeNull()
        const csp = res.headers.get("content-security-policy") ?? ""
        expect(csp).toMatch(/^default-src 'self'; script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
        expect(res.headers.get("x-middleware-request-x-nonce")).toBeTruthy()
    })

    it.each(["www.centralreform.live", "www.brotherslazaroff.live"])("%s unauth secure page → 307 /login on the same host", async (host) => {
        const res = await proxy(proxyReq(host, "/setlists"))
        expect(res.status).toBe(307)
        expect(res.headers.get("location")).toBe(`https://${host}/login`)
    })

    it.each(["www.centralreform.live", "www.brotherslazaroff.live"])("%s unauth / → /perform", async (host) => {
        const res = await proxy(proxyReq(host, "/"))
        expect(res.headers.get("location")).toBe(`https://${host}/perform`)
    })

    it.each(["www.centralreform.live", "www.brotherslazaroff.live"])("%s POST /login → 405 JSON", async (host) => {
        const res = await proxy(proxyReq(host, "/login", { method: "POST" }))
        expect(res.status).toBe(405)
        expect(res.headers.get("allow")).toBe("GET, HEAD")
    })
})

// ── OAuth discovery metadata ────────────────────────────────────────────────

function metaReq(host: string | null, path: string, proto = "https"): Request {
    const headers: Record<string, string> = {}
    if (host) {
        headers.host = host
        headers["x-forwarded-host"] = host
        headers["x-forwarded-proto"] = proto
    }
    return new Request(`https://internal.vercel${path}`, { headers })
}

const GOLDEN_ORIGINS: Array<[string, string]> = [
    ["www.centralreform.live", "https://www.centralreform.live"],
    ["www.brotherslazaroff.live", "https://www.brotherslazaroff.live"],
    ["sheet-music-app.vercel.app", "https://sheet-music-app.vercel.app"],
]

describe("golden: OAuth protected-resource metadata", () => {
    it.each(GOLDEN_ORIGINS)("%s", async (host, origin) => {
        const res = protectedResourceGET(metaReq(host, "/.well-known/oauth-protected-resource"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toEqual({
            resource: `${origin}/api/mcp`,
            authorization_servers: [origin],
        })
    })
})

describe("golden: OAuth authorization-server metadata", () => {
    it.each(GOLDEN_ORIGINS)("%s", async (host, origin) => {
        const res = authServerGET(metaReq(host, "/.well-known/oauth-authorization-server"))
        expect(res.status).toBe(200)
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
        const text = await res.text()
        expect(text).toBe(
            JSON.stringify({
                issuer: origin,
                authorization_endpoint: `${origin}/api/mcp/oauth/authorize`,
                token_endpoint: `${origin}/api/mcp/oauth/token`,
                registration_endpoint: `${origin}/api/mcp/oauth/register`,
                response_types_supported: ["code"],
                grant_types_supported: ["authorization_code"],
                code_challenge_methods_supported: ["S256"],
                token_endpoint_auth_methods_supported: ["none"],
            }),
        )
    })

    it("no host headers → the CRC canonical origin", async () => {
        const res = authServerGET(new Request("https://internal.vercel/.well-known/oauth-authorization-server"))
        const body = await res.json()
        expect(body.issuer).toBe("https://www.centralreform.live")
    })
})

// ── robots / sitemap ────────────────────────────────────────────────────────

describe("golden: robots.txt and sitemap.xml (not proxied; x-org-id absent)", () => {
    beforeEach(() => headerStore.clear())

    it.each([[null], ["crc"], ["brotherslazaroff"]])("x-org-id=%s", async (org) => {
        if (org) headerStore.set("x-org-id", org)
        const r = await robots()
        expect(r.sitemap).toBe("https://centralreform.live/sitemap.xml")
        const s = await sitemap()
        expect(s.map((e) => e.url)).toEqual([
            "https://centralreform.live/",
            "https://centralreform.live/perform",
            "https://centralreform.live/privacy",
            "https://centralreform.live/terms",
            "https://centralreform.live/sms-consent",
            "https://centralreform.live/changelog",
        ])
    })
})
