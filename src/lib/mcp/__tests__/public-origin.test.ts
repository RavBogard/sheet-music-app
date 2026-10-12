/**
 * Multi-tenant phase 3: MCP / OAuth metadata URLs per tenant. CRC and BL stay
 * byte-identical (see src/__tests__/mt-p3-addresses.golden.test.ts); a third
 * tenant's metadata names its own address.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { OrgConfig } from "@/lib/org/config-schema"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const configs = new Map<string, OrgConfig>()
vi.mock("@/lib/org/get-org-config", () => ({
    getOrgConfig: vi.fn(async (id: string) => configs.get(id) ?? null),
}))

import { mcpPublicOrigin, canonicalMcpHost } from "@/lib/mcp/public-origin"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { GET as protectedResourceGET } from "@/app/.well-known/oauth-protected-resource/route"
import { GET as authServerGET } from "@/app/.well-known/oauth-authorization-server/route"

function r(org: string | null, host?: string, proto = "https"): Request {
    const headers: Record<string, string> = {}
    if (org !== null) headers["x-org-id"] = org
    if (host) {
        headers.host = host
        headers["x-forwarded-host"] = host
        headers["x-forwarded-proto"] = proto
    }
    return new Request("https://internal.vercel/.well-known/oauth-protected-resource", { headers })
}

beforeEach(() => {
    configs.clear()
    configs.set("testshul", makeTestOrgConfig())
    configs.set("customshul", makeTestOrgConfig({ id: "customshul", domains: { primary: "customshul.org", aliases: ["customshul.vercel.app"] } }))
})

describe("CRC and BL (confirmed values)", () => {
    it.each([
        ["crc", "www.centralreform.live", "https://www.centralreform.live"],
        ["brotherslazaroff", "www.brotherslazaroff.live", "https://www.brotherslazaroff.live"],
        ["crc", "sheet-music-app.vercel.app", "https://sheet-music-app.vercel.app"],
        ["crc", "sheet-music-app-git-x-ravbogards-projects.vercel.app", "https://sheet-music-app-git-x-ravbogards-projects.vercel.app"],
        ["crc", "localhost:3000", "http://localhost:3000"],
    ])("%s on %s → %s", async (org, host, expected) => {
        expect(await mcpPublicOrigin(r(org, host, host.startsWith("localhost") ? "http" : "https"))).toBe(expected)
    })

    it.each([
        ["crc", "https://www.centralreform.live"],
        ["brotherslazaroff", "https://www.brotherslazaroff.live"],
    ])("%s with no host header → canonical %s", async (org, expected) => {
        expect(await mcpPublicOrigin(r(org))).toBe(expected)
        expect(`https://${await canonicalMcpHost(org)}`).toBe(expected)
    })

    it("a bare CRC host (Vercel redirects it before the app; defensive) → www", async () => {
        expect(await mcpPublicOrigin(r("crc", "centralreform.live"))).toBe("https://www.centralreform.live")
    })

    it("no x-org-id (not through the proxy) → request origin, as before phase 3", async () => {
        expect(await mcpPublicOrigin(r(null, "www.brotherslazaroff.live"))).toBe("https://www.brotherslazaroff.live")
        expect(await mcpPublicOrigin(r(null))).toBe("https://www.centralreform.live")
    })
})

describe("third tenants", () => {
    it("vercel.app tenant on its alias → the alias", async () => {
        expect(await mcpPublicOrigin(r("testshul", "testshul.vercel.app"))).toBe("https://testshul.vercel.app")
    })

    it("vercel.app tenant with no host → canonical alias", async () => {
        expect(await mcpPublicOrigin(r("testshul"))).toBe("https://testshul.vercel.app")
    })

    it("custom-domain tenant on www → www; on its vercel alias → alias (RFC 9728 resource must match)", async () => {
        expect(await mcpPublicOrigin(r("customshul", "www.customshul.org"))).toBe("https://www.customshul.org")
        expect(await mcpPublicOrigin(r("customshul", "customshul.vercel.app"))).toBe("https://customshul.vercel.app")
    })

    it("custom-domain tenant on the bare domain → canonical www (the redirect drops Authorization)", async () => {
        expect(await mcpPublicOrigin(r("customshul", "customshul.org"))).toBe("https://www.customshul.org")
    })

    it("a host that is not the tenant's → the tenant's canonical host", async () => {
        expect(await mcpPublicOrigin(r("testshul", "www.centralreform.live"))).toBe("https://testshul.vercel.app")
        expect(await mcpPublicOrigin(r("crc", "testshul.vercel.app"))).toBe("https://www.centralreform.live")
    })

    it("a tenant whose config cannot be read → CRC canonical, never the spoofable request host", async () => {
        expect(await mcpPublicOrigin(r("ghost", "evil.example.org"))).toBe("https://www.centralreform.live")
    })

    it("OAuth metadata for testshul names its address", async () => {
        const pr = await (await protectedResourceGET(r("testshul", "testshul.vercel.app"))).json()
        expect(pr).toEqual({
            resource: "https://testshul.vercel.app/api/mcp",
            authorization_servers: ["https://testshul.vercel.app"],
        })
        const as = await (await authServerGET(r("testshul", "testshul.vercel.app"))).json()
        expect(as.issuer).toBe("https://testshul.vercel.app")
        expect(as.authorization_endpoint).toBe("https://testshul.vercel.app/api/mcp/oauth/authorize")
        expect(as.token_endpoint).toBe("https://testshul.vercel.app/api/mcp/oauth/token")
        expect(as.registration_endpoint).toBe("https://testshul.vercel.app/api/mcp/oauth/register")
    })

    it("OAuth metadata for a custom-domain tenant reached on the bare host names www", async () => {
        const as = await (await authServerGET(r("customshul", "customshul.org"))).json()
        expect(as.issuer).toBe("https://www.customshul.org")
    })
})
