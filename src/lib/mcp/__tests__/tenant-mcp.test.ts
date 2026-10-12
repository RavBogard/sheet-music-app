// @vitest-environment node
/**
 * Multi-tenant phase 4: the authoring MCP server answers with the TOKEN's
 * tenant's handler — its instructions and (for tenants the feature filter
 * applies to) its tool list.
 */
import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => false),
    getFirestore: vi.fn(() => {
        throw new Error("no Firestore here")
    }),
    getAuth: vi.fn(),
    getStorage: vi.fn(),
}))

const state = vi.hoisted(() => ({ orgId: "crc" as string }))
vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(async () => ({
        uid: "tenant-test-user",
        tokenId: "tok",
        parentTokenId: null,
        orgId: state.orgId,
        kind: null,
        allowedTools: null,
    })),
}))

const members = vi.hoisted(() => ({
    byOrg: {
        brotherslazaroff: [
            { uid: "d", role: "band_leader", profile: { displayName: "David Lazaroff" } },
            { uid: "a", role: "admin", profile: { displayName: "Band Admin Test" } },
            { uid: "x", role: "band_leader", profile: { displayName: "  " } },
        ],
        testshul: [{ uid: "c", role: "admin", profile: { displayName: "Cantor Test" } }],
    } as Record<string, Array<{ uid: string; role: string; profile: Record<string, unknown> }>>,
    calls: 0,
}))
vi.mock("@/lib/org/access", () => ({
    listTenantMembers: vi.fn(async (orgId: string) => {
        members.calls++
        return members.byOrg[orgId] ?? []
    }),
}))

vi.mock("@/lib/org/get-org-config", async () => {
    const { codeOrgConfig } = await import("@/lib/org/config-code")
    const { testshulConfig } = await import("./helpers/testshul-config")
    return {
        getOrgConfig: vi.fn(async (orgId: string) => (orgId === "testshul" ? testshulConfig() : codeOrgConfig(orgId))),
    }
})

import { buildMcpHandler } from "@/lib/mcp/build-handler"
import { listToolNames, readInitialize } from "./helpers/mcp-rpc"
import { FEATURE_TOOLS } from "@/lib/mcp/tenant-tools"
import { OPS_TOOLS } from "@/lib/mcp/surfaces"
import { createTenantDispatcher, tokenOrgOf, type TenantMcpPlan } from "@/lib/mcp/tenant-dispatch"
import { renderTenantGuide } from "@/lib/mcp/agent-guide"
import { testshulConfig } from "./helpers/testshul-config"

const BEFORE = JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "p4-authoring-tools-before.json"), "utf8"),
) as { crc: string[]; brotherslazaroff: string[] }

const GOLDEN_CRC = fs
    .readFileSync(
        path.join(process.cwd(), "docs/planning/2026-10-12-multitenant/golden/http-before/crc/mcp_instructions.txt"),
        "utf8",
    )
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(1)
    .join("\n")
    .replace(/\n$/, "")

/**
 * CRC-specific phrases from CRC's guide that must not appear in BL's (or any
 * generated) instructions.
 */
const CRC_PHRASES = [
    "centralreform",
    "Central Reform",
    "CRC",
    "Daniel",
    "Rabbi",
    "rabbi",
    "Shabbat",
    "Friday-evening",
    "Bar Mitzvah",
    "Hashkivenu",
    "Klepper",
    "machzor",
    "booklet",
    "Kol Nidre",
    "Yizkor",
    "lectern",
    "shireishabbat",
    "shirei-tshuvah",
    "COORDINATION.md",
    "congregation",
    "service",
]

const handler = buildMcpHandler("authoring", "/api")

async function asTenant(orgId: string, host = "www.centralreform.live") {
    state.orgId = orgId
    const init = await readInitialize(handler, { host, orgHeader: orgId })
    const tools = await listToolNames(handler, { host, orgHeader: orgId })
    return { instructions: (init.instructions as string | undefined)?.replace(/\r\n/g, "\n"), tools }
}

describe("per-tenant MCP instructions", () => {
    it("crc: the captured guide, byte-for-byte", async () => {
        const { instructions } = await asTenant("crc")
        expect(instructions).toBe(GOLDEN_CRC)
    })

    it("a crc token at BL's address still acts as crc (dispatch by token, not host)", async () => {
        const { instructions, tools } = await asTenant("crc", "www.brotherslazaroff.live")
        expect(instructions).toBe(GOLDEN_CRC)
        expect(tools).toEqual(BEFORE.crc)
    })

    it("brotherslazaroff: describes Brothers Lazaroff, none of CRC's phrases", async () => {
        const { instructions } = await asTenant("brotherslazaroff", "www.brotherslazaroff.live")
        expect(instructions).toBeDefined()
        expect(instructions).toContain("Brothers Lazaroff")
        expect(instructions).toContain("a band")
        expect(instructions).toContain('called a "set"')
        expect(instructions).toContain("Band Admin Test and David Lazaroff")
        for (const phrase of CRC_PHRASES) expect(instructions, phrase).not.toContain(phrase)
        expect(instructions).toMatchSnapshot()
    })

    it("testshul (generated, shul): snapshot, and none of CRC's phrases but its own service types", async () => {
        const { instructions } = await asTenant("testshul", "testshul.vercel.app")
        expect(instructions).toContain("Test Shul")
        expect(instructions).toContain("Service types: Kabbalat Shabbat Test, Morning Test.")
        for (const phrase of ["centralreform", "Central Reform", "CRC", "Daniel", "Rabbi", "Hashkivenu", "machzor"]) {
            expect(instructions, phrase).not.toContain(phrase)
        }
        expect(instructions).toMatchSnapshot()
    })
})

describe("per-tenant MCP tool lists", () => {
    afterEach(() => {
        delete process.env.MCP_FEATURE_FILTER
    })

    it("crc and brotherslazaroff list exactly today's tools", async () => {
        expect((await asTenant("crc")).tools).toEqual(BEFORE.crc)
        expect((await asTenant("brotherslazaroff", "www.brotherslazaroff.live")).tools).toEqual(BEFORE.brotherslazaroff)
    })

    it("testshul with mixer and notifyBand off lacks those tools, keeps the rest", async () => {
        const { tools } = await asTenant("testshul", "testshul.vercel.app")
        for (const t of [...FEATURE_TOOLS.mixer, ...FEATURE_TOOLS.notifyBand]) expect(tools).not.toContain(t)
        // driveInbox is on for testshul
        for (const t of FEATURE_TOOLS.driveInbox) expect(tools).toContain(t)
        const removed = new Set([...FEATURE_TOOLS.mixer, ...FEATURE_TOOLS.notifyBand])
        expect(tools).toEqual(BEFORE.crc.filter((t) => !removed.has(t)))
    })

    it("MCP_FEATURE_FILTER=1 applies the filter to BL too (phase 6 switch)", async () => {
        process.env.MCP_FEATURE_FILTER = "1"
        const { tools } = await asTenant("brotherslazaroff", "www.brotherslazaroff.live")
        for (const t of [...FEATURE_TOOLS.mixer, ...FEATURE_TOOLS.driveInbox, ...FEATURE_TOOLS.notifyBand]) {
            expect(tools).not.toContain(t)
        }
        // crc has every flag on: unchanged even with the switch.
        expect((await asTenant("crc")).tools).toEqual(BEFORE.crc)
    })

    it("every feature-mapped tool exists on a surface (no stale names)", () => {
        for (const names of Object.values(FEATURE_TOOLS)) {
            for (const t of names) expect(BEFORE.crc.includes(t) || OPS_TOOLS.has(t), t).toBe(true)
        }
    })
})

describe("tenant dispatcher cache", () => {
    function fakePlan(orgId: string, key = `${orgId}:k`): TenantMcpPlan {
        return { orgId, instructions: `guide for ${orgId}`, dropTools: new Set(), key }
    }
    function authed(orgId?: string): Request {
        const r = new Request("http://localhost/api/mcp", { method: "POST" })
        if (orgId !== undefined) (r as Request & { auth?: unknown }).auth = { extra: { orgId } }
        return r
    }

    beforeEach(() => {
        members.calls = 0
    })

    it("builds one handler per tenant key and reuses it", async () => {
        const build = vi.fn((p: TenantMcpPlan) => async () => new Response(p.orgId))
        const d = createTenantDispatcher(build, { plan: async (o) => fakePlan(o) })
        expect(await (await d(authed("crc"))).text()).toBe("crc")
        expect(await (await d(authed("crc"))).text()).toBe("crc")
        expect(await (await d(authed("brotherslazaroff"))).text()).toBe("brotherslazaroff")
        expect(build).toHaveBeenCalledTimes(2)
        expect(d.cacheSize()).toBe(2)
    })

    it("a changed config (new key) builds a fresh handler", async () => {
        let version = 1
        const build = vi.fn((p: TenantMcpPlan) => async () => new Response(p.key))
        const d = createTenantDispatcher(build, { plan: async (o) => fakePlan(o, `${o}:v${version}`) })
        expect(await (await d(authed("testshul"))).text()).toBe("testshul:v1")
        version = 2
        expect(await (await d(authed("testshul"))).text()).toBe("testshul:v2")
        expect(build).toHaveBeenCalledTimes(2)
    })

    it("is LRU-bounded", async () => {
        const build = vi.fn((p: TenantMcpPlan) => async () => new Response(p.orgId))
        const d = createTenantDispatcher(build, { plan: async (o) => fakePlan(o), max: 2 })
        await d(authed("a1"))
        await d(authed("a2"))
        await d(authed("a1")) // a1 most recent
        await d(authed("a3")) // evicts a2
        expect(d.cacheSize()).toBe(2)
        await d(authed("a1"))
        expect(build).toHaveBeenCalledTimes(3)
        await d(authed("a2"))
        expect(build).toHaveBeenCalledTimes(4)
    })

    it("a request without a token tenant is crc", () => {
        expect(tokenOrgOf(authed())).toBe("crc")
        expect(tokenOrgOf(authed(""))).toBe("crc")
        expect(tokenOrgOf(authed("brotherslazaroff"))).toBe("brotherslazaroff")
    })

    it("the real handler reads tenant authors once per TTL, never for crc", async () => {
        await asTenant("crc")
        expect(members.calls).toBe(0)
    })
})

describe("renderTenantGuide", () => {
    it("adds the tenant's own text between the facts and the core", () => {
        const cfg = { ...testshulConfig(), agentGuide: "Our cantor picks the opening song." }
        const out = renderTenantGuide({ config: cfg, authors: [] })
        const own = out.indexOf("Our cantor picks the opening song.")
        expect(own).toBeGreaterThan(out.indexOf("## About Test Shul"))
        expect(own).toBeLessThan(out.indexOf("## How to work here"))
        expect(out).not.toContain("People who build")
    })
})
