// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 4: /api/platform/mcp.
 *   - its tool list is exactly the 17 platform tools, and they appear nowhere else;
 *   - every per-tenant tool takes a REQUIRED orgId; writes take dryRun;
 *   - the gate: a tenant token is refused, a platform token whose owner is not
 *     the platform owner is refused, the owner gets in (checked every request);
 *   - end to end through the real handler: tools/list returns the 17.
 */

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const gate = vi.hoisted(() => ({
    verify: vi.fn(),
    owners: vi.fn(async () => ["po-uid"]),
}))
vi.mock("@/lib/mcp/auth", () => ({ verifyBearer: gate.verify }))
vi.mock("@/lib/org/claims", () => ({ readOwners: gate.owners }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({})),
    getAuth: vi.fn(() => ({ getUser: vi.fn(async () => ({ email: "daniel@example.test" })) })),
}))
vi.mock("@/lib/mcp/public-origin", () => ({ mcpPublicOrigin: vi.fn(async () => "https://www.centralreform.live") }))

const lib = vi.hoisted(() => ({
    updateTenant: vi.fn(async () => ({ dryRun: true, changed: false, before: null, after: null, diff: [] })),
    listTenants: vi.fn(async () => [{ orgId: "crc" }]),
}))
vi.mock("@/lib/platform/tenants", async (orig) => ({ ...(await orig<typeof import("@/lib/platform/tenants")>()), ...lib }))

import { registerPlatformTools } from "../platform/tools"
import { buildPlatformMcpHandler, platformGate } from "../platform/handler"
import { forSurface, PLATFORM_TOOLS } from "../surfaces"
import { registerReadTools, registerWriteTools } from "../tools"

const HANDOFF_17 = [
    "list_tenants",
    "get_tenant",
    "create_tenant",
    "update_tenant",
    "set_tenant_features",
    "add_tenant_domain",
    "check_tenant_domain",
    "remove_tenant_domain",
    "list_tenant_members",
    "set_tenant_member_role",
    "remove_tenant_member",
    "invite_tenant_admin",
    "list_collections",
    "set_collection_sharing",
    "assign_collection",
    "mint_tenant_view_bearer",
    "list_platform_activity",
]

type Captured = { name: string; config: { inputSchema?: Record<string, { isOptional(): boolean }> }; handler: (...a: unknown[]) => unknown }
function capture(surface: "platform" | "authoring" | "ops", register: (s: never) => void): Captured[] {
    const out: Captured[] = []
    const server = {
        registerTool(name: string, config: Captured["config"], handler: Captured["handler"]) {
            out.push({ name, config, handler })
        },
        registerResource() {},
        registerPrompt() {},
    }
    register(forSurface(server as never, surface) as never)
    return out
}

describe("platform tool list", () => {
    it("is exactly the handoff's 17", () => {
        const names = capture("platform", registerPlatformTools).map((t) => t.name)
        expect(names.sort()).toEqual([...HANDOFF_17].sort())
        expect([...PLATFORM_TOOLS].sort()).toEqual([...HANDOFF_17].sort())
    })

    it("platform tools never register on the authoring or ops servers, and tenant tools never on platform", () => {
        expect(capture("authoring", registerPlatformTools)).toEqual([])
        expect(capture("ops", registerPlatformTools)).toEqual([])
        expect(capture("platform", (s) => (registerReadTools(s), registerWriteTools(s)))).toEqual([])
    })

    it("every per-tenant tool requires orgId; every write takes dryRun", () => {
        const tools = capture("platform", registerPlatformTools)
        const optionalOrg = new Set(["list_tenants", "list_collections", "list_platform_activity", "set_collection_sharing"])
        const noDryRun = new Set(["list_tenants", "get_tenant", "check_tenant_domain", "list_tenant_members", "list_collections", "mint_tenant_view_bearer", "list_platform_activity"])
        for (const t of tools) {
            const schema = t.config.inputSchema ?? {}
            if (!optionalOrg.has(t.name)) {
                expect(schema.orgId, `${t.name}.orgId`).toBeDefined()
                expect(schema.orgId.isOptional(), `${t.name}.orgId required`).toBe(false)
            }
            if (!noDryRun.has(t.name)) expect(schema.dryRun, `${t.name}.dryRun`).toBeDefined()
        }
    })

    it("a write called without dryRun reaches the library as a dry run (lib default true)", async () => {
        const t = capture("platform", registerPlatformTools).find((x) => x.name === "update_tenant")!
        await t.handler({ orgId: "crc", patch: { name: "X" } }, { authInfo: { extra: { uid: "po-uid" } } })
        expect(lib.updateTenant).toHaveBeenCalledWith("crc", { name: "X" }, { actor: { uid: "po-uid", email: null, via: "claude" }, dryRun: undefined })
    })
})

const bearerReq = (token = "crl_plat_x", body?: unknown) =>
    new Request("https://www.centralreform.live/api/platform/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: body === undefined ? undefined : JSON.stringify(body),
    })

describe("platform gate", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        gate.owners.mockResolvedValue(["po-uid"])
    })

    it("asks verifyBearer for the platform surface", async () => {
        gate.verify.mockResolvedValue({ uid: "po-uid", tokenId: "t1", kind: "platform" })
        await platformGate(bearerReq())
        expect(gate.verify).toHaveBeenCalledWith(expect.any(Request), { surface: "platform" })
    })

    it("a tenant (authoring) token is refused with verifyBearer's 403", async () => {
        gate.verify.mockResolvedValue(new Response("This is a tenant connector token.", { status: 403 }))
        const r = await platformGate(bearerReq("crl_live_x"))
        expect((r as Response).status).toBe(403)
    })

    it("no or unknown token → 401 naming the platform token", async () => {
        gate.verify.mockResolvedValue(new Response("Unauthorized", { status: 401 }))
        const r = (await platformGate(bearerReq("nope"))) as Response
        expect(r.status).toBe(401)
        expect(await r.text()).toMatch(/crl_plat_/)
    })

    it("a platform token whose owner is not the platform owner → 403", async () => {
        gate.verify.mockResolvedValue({ uid: "someone-else", tokenId: "t2", kind: "platform" })
        const r = (await platformGate(bearerReq())) as Response
        expect(r.status).toBe(403)
        expect(await r.text()).toMatch(/not the platform owner/)
    })

    it("the owner gets in, and the owner list is read on every request", async () => {
        gate.verify.mockResolvedValue({ uid: "po-uid", tokenId: "t1", kind: "platform" })
        expect(await platformGate(bearerReq())).toEqual({ uid: "po-uid", tokenId: "t1", email: "daniel@example.test" })
        gate.owners.mockResolvedValue([])
        expect(((await platformGate(bearerReq())) as Response).status).toBe(403)
        expect(gate.owners).toHaveBeenCalledTimes(2)
    })
})

describe("platform handler end to end", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        gate.owners.mockResolvedValue(["po-uid"])
    })

    async function rpc(res: Response): Promise<{ result?: { tools?: Array<{ name: string }>; content?: Array<{ text: string }> } }> {
        const text = await res.text()
        const line = text.split("\n").find((l) => l.startsWith("data: "))
        return JSON.parse(line ? line.slice(6) : text)
    }

    it("tools/list for the owner returns the 17", async () => {
        gate.verify.mockResolvedValue({ uid: "po-uid", tokenId: "t1", kind: "platform" })
        const handler = buildPlatformMcpHandler("/api/platform")
        const res = await handler(bearerReq("crl_plat_x", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }))
        expect(res.status).toBe(200)
        const body = await rpc(res)
        expect(body.result!.tools!.map((t) => t.name).sort()).toEqual([...HANDOFF_17].sort())
    })

    it("a tenant token never reaches the tools", async () => {
        gate.verify.mockResolvedValue(new Response("tenant token", { status: 403 }))
        const handler = buildPlatformMcpHandler("/api/platform")
        const res = await handler(bearerReq("crl_live_x", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tenants", arguments: {} } }))
        expect(res.status).toBe(403)
        expect(lib.listTenants).not.toHaveBeenCalled()
    })
})
