// @vitest-environment node
/**
 * Multi-tenant phase 6 — the throwaway-tenant gate: for each flag switched off
 * on a third tenant, its API is refused, its MCP tools are dropped (and refused
 * at the handler if called anyway) and its cron skips the tenant. crc keeps
 * everything; BL keeps exactly its P6-BL-FLAGS.md set.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { codeOrgConfig } from "@/lib/org/config-code"
import { OrgConfigSchema, type OrgConfig, type OrgFeatures } from "@/lib/org/config-schema"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

const ALL_ON: OrgFeatures = { mixer: true, driveInbox: true, schedulingEmails: true, todayFeed: true, notifyBand: true, perform: true }
const t = vi.hoisted(() => ({
    features: {} as Record<string, boolean>,
    folderId: "",
    orgId: "throwaway" as string,
    crcMixer: true,
    tokenOrg: "throwaway" as string,
}))

function throwaway(): OrgConfig {
    const crc = codeOrgConfig("crc")!
    return OrgConfigSchema.parse({
        ...crc,
        id: "throwaway",
        name: "Throwaway",
        domains: { primary: "throwaway.vercel.app", aliases: [] },
        features: { ...ALL_ON, ...t.features },
        driveInbox: { folderId: t.folderId },
        agentGuideMode: "generated",
    })
}

let db: FakeFirestore
const envState = vi.hoisted(() => ({
    env: { CRON_SECRET: "secret", CHART_INBOX_DRIVE_FOLDER_ID: "crc-folder" } as Record<string, string | undefined>,
}))
vi.mock("@/env.mjs", () => ({ env: envState.env }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db, getAuth: vi.fn(), getStorage: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/error-reporting", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/email", () => ({
    sendBridgeHealthAlert: vi.fn(),
    sendSetlistEmail: vi.fn(async () => true),
    sendBridgeRedemptionAlert: vi.fn(async () => ({ ok: true })),
}))
vi.mock("@/lib/push-send", () => ({ sendPushToUsers: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null), checkUserRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/org/access", () => ({
    listTenantMembers: vi.fn(async () => []),
    getTenantAccess: vi.fn(async () => ({ effectiveRole: "admin", soundEngineer: true })),
}))
vi.mock("@/lib/org/get-org-config", () => ({
    getOrgConfig: vi.fn(async (orgId: string) => {
        if (orgId === "throwaway") return throwaway()
        const c = codeOrgConfig(orgId)
        if (c && orgId === "crc") return { ...c, features: { ...c.features, mixer: t.crcMixer } }
        return c
    }),
    orgConfigSource: () => "firestore",
}))
vi.mock("@/lib/org/cron-tenants", () => ({ cronTenantIds: async () => ["crc", "brotherslazaroff", "throwaway"] }))
// Route auth passes through, as the caller's tenant `t.orgId`.
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => async (req: NextRequest) =>
        fn({
            req,
            body: await req.json().catch(() => undefined),
            auth: { uid: "u1", orgId: t.orgId, isAdmin: true, isBandLeader: true, email: "a@x.test" },
        }),
}))
vi.mock("@/lib/sync-engine", () => ({ syncLibraryIndex: vi.fn(async () => ({ synced: 1 })) }))
vi.mock("@/lib/mcp/auth", () => ({
    verifyBearer: vi.fn(async () => ({ uid: "u1", tokenId: "tok", parentTokenId: null, orgId: t.tokenOrg, kind: null, allowedTools: null })),
}))

const runDriveSyncProd = vi.fn(async (_db: unknown, folder: string, org?: string) => ({
    watching: true,
    parentFolderId: folder,
    org,
    filesScanned: 0,
    imported: 0,
    renamed: 0,
    replaced: 0,
    moved: 0,
    skipped: 0,
    queued: 0,
    errors: [],
}))
vi.mock("@/lib/drive-sync/poller", () => ({
    runDriveSyncProd: (...a: [unknown, string, string?]) => runDriveSyncProd(...a),
}))
const emitToday = vi.fn(async (org: string) => ({ ok: true as const, path: `public/today/${org}.json`, serviceCount: 1 }))
vi.mock("@/lib/today/emit-today", () => ({
    emitToday: (org: string) => emitToday(org),
    readStoredToday: async (org: string) => ({ schemaVersion: 1, org, generatedAt: new Date().toISOString(), services: [] }),
}))
vi.mock("@/lib/email-scheduling", () => ({ sendSchedulingEmail: vi.fn(async () => ({ ok: true })) }))
vi.mock("@/lib/sms", () => ({ sendSchedulingReminderSMS: vi.fn(async () => ({ ok: true })), sendSMS: vi.fn() }))

const auth = { headers: { authorization: "Bearer secret" } }
type PostRoute = (r: NextRequest) => Promise<Response>

beforeEach(() => {
    t.features = {}
    t.folderId = ""
    t.orgId = "throwaway"
    t.tokenOrg = "throwaway"
    t.crcMixer = true
    db = new FakeFirestore().seed("config", { monitor: { bridge: { lastSeen: Date.now() } } })
    runDriveSyncProd.mockClear()
    emitToday.mockClear()
})

function post(path: string, body: unknown, org = "throwaway") {
    return new NextRequest(`https://x.test${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "x-org-id": org, "content-type": "application/json" },
    })
}

async function expectOff(res: Response, feature: string) {
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: "feature_off", feature })
}

// ── API ─────────────────────────────────────────────────────────────────────

describe("API refused when the flag is off", () => {
    it("todayFeed: GET /api/today", async () => {
        const { GET } = await import("@/app/api/today/route")
        const req = () => new NextRequest("https://x.test/api/today", { headers: { "x-org-id": "throwaway" } })
        expect((await GET(req())).status).toBe(200)
        t.features = { todayFeed: false }
        const res = await GET(req())
        expect(res.headers.get("access-control-allow-origin")).toBe("*")
        await expectOff(res, "todayFeed")
    })

    it("schedulingEmails: POST /api/scheduling/remind", async () => {
        const { POST } = await import("@/app/api/scheduling/remind/route")
        t.features = { schedulingEmails: false }
        await expectOff(await (POST as unknown as PostRoute)(post("/api/scheduling/remind", {})), "schedulingEmails")
    })

    it("driveInbox: POST /api/library/sync (and it is only crc's sync)", async () => {
        const { POST } = await import("@/app/api/library/sync/route")
        const call = () => (POST as unknown as PostRoute)(post("/api/library/sync", {}))
        expect((await call()).status).toBe(404) // flag on, but the Drive root is CRC's
        t.features = { driveInbox: false }
        await expectOff(await call(), "driveInbox")
        t.orgId = "crc"
        expect((await call()).status).toBe(200)
        t.orgId = "brotherslazaroff"
        await expectOff(await call(), "driveInbox")
    })

    it("notifyBand: POST /api/setlist/email-packets", async () => {
        db.seed("setlists", { s1: { orgId: "throwaway", ownerId: "u1", name: "S" } })
        const { POST } = await import("@/app/api/setlist/email-packets/route")
        t.features = { notifyBand: false }
        await expectOff(await (POST as unknown as PostRoute)(post("/api/setlist/email-packets", { setlistId: "s1" })), "notifyBand")
    })

    it("mixer: POST /api/bridge/setup-code refused for every tenant but crc, even with its flag on", async () => {
        const { POST } = await import("@/app/api/bridge/setup-code/route")
        const call = () => (POST as unknown as PostRoute)(post("/api/bridge/setup-code", {}))
        await expectOff(await call(), "mixer")
        t.orgId = "brotherslazaroff"
        await expectOff(await call(), "mixer")
    })
})

// ── Crons ───────────────────────────────────────────────────────────────────

describe("crons skip a tenant with the flag off", () => {
    it("emit-today: throwaway only while todayFeed is on; BL keeps its feed", async () => {
        const { GET } = await import("@/app/api/cron/emit-today/route")
        await GET(new NextRequest("https://x.test/api/cron/emit-today", auth))
        expect(emitToday.mock.calls.map((c) => c[0])).toEqual(["crc", "brotherslazaroff", "throwaway"])
        emitToday.mockClear()
        db = new FakeFirestore()
        t.features = { todayFeed: false }
        await GET(new NextRequest("https://x.test/api/cron/emit-today", auth))
        expect(emitToday.mock.calls.map((c) => c[0])).toEqual(["crc", "brotherslazaroff"])
    })

    it("drive-sync: each flagged tenant's own folder, stamped with that tenant", async () => {
        const { GET } = await import("@/app/api/cron/drive-sync/route")
        t.folderId = "throwaway-folder"
        const res = await GET(new NextRequest("https://x.test/api/cron/drive-sync", auth))
        expect(runDriveSyncProd.mock.calls.map((c) => [c[1], c[2]])).toEqual([
            ["crc-folder", "crc"],
            ["throwaway-folder", "throwaway"],
        ])
        const body = (await res.json()) as { parentFolderId: string; tenants: unknown[] }
        expect(body.parentFolderId).toBe("crc-folder")
        expect(body.tenants).toHaveLength(2)
        runDriveSyncProd.mockClear()
        t.features = { driveInbox: false }
        await GET(new NextRequest("https://x.test/api/cron/drive-sync", auth))
        expect(runDriveSyncProd.mock.calls.map((c) => c[2])).toEqual(["crc"])
    })

    it("scheduling-reminder: loops only tenants with schedulingEmails on (BL and an off tenant skipped)", async () => {
        const { tenantsWithFeature } = await import("@/lib/org/features")
        expect(await tenantsWithFeature("schedulingEmails")).toEqual(["crc", "throwaway"])
        t.features = { schedulingEmails: false }
        expect(await tenantsWithFeature("schedulingEmails")).toEqual(["crc"])
    })

    it("bridge-watch: skipped when crc's mixer is off, and when config/monitor names another tenant", async () => {
        const { GET } = await import("@/app/api/cron/bridge-watch/route")
        const run = async () => (await GET(new Request("https://x.test/api/cron/bridge-watch", auth))).json()
        t.crcMixer = false
        expect(await run()).toEqual({ success: true, skipped: "feature_off" })
        t.crcMixer = true
        db = new FakeFirestore().seed("config", { monitor: { orgId: "throwaway", bridge: { lastSeen: Date.now() } } })
        expect(await run()).toEqual({ success: true, skipped: "bridge_tenant_mismatch" })
    })
})

// ── MCP ─────────────────────────────────────────────────────────────────────

describe("MCP: tools dropped, and refused at the handler", () => {
    it("each flag off drops exactly its tools from the throwaway tenant's list", async () => {
        const { droppedToolsFor, FEATURE_TOOLS } = await import("@/lib/mcp/tenant-tools")
        // mixer is crc-only, so it is dropped for throwaway even with its flag on.
        expect(droppedToolsFor("throwaway", throwaway())).toEqual(new Set(FEATURE_TOOLS.mixer))
        for (const key of ["driveInbox", "notifyBand"] as const) {
            t.features = { [key]: false }
            expect(droppedToolsFor("throwaway", throwaway())).toEqual(new Set([...FEATURE_TOOLS.mixer, ...FEATURE_TOOLS[key]]))
        }
        expect(droppedToolsFor("crc", codeOrgConfig("crc"))).toEqual(new Set())
        expect(droppedToolsFor("brotherslazaroff", codeOrgConfig("brotherslazaroff"))).toEqual(
            new Set([...FEATURE_TOOLS.mixer, ...FEATURE_TOOLS.driveInbox]),
        )
    })

    it("withFeatureGates: a feature tool returns isError feature_off; other tools untouched", async () => {
        const { withFeatureGates } = await import("@/lib/mcp/tenant-tools")
        const { hasFeature } = await import("@/lib/org/features")
        const handlers: Record<string, (...a: unknown[]) => Promise<unknown>> = {}
        const fake = {
            registerTool: (name: string, _c: unknown, cb: (...a: unknown[]) => Promise<unknown>) => {
                handlers[name] = cb
            },
        }
        const server = withFeatureGates(fake as never, hasFeature)
        const ok = async () => ({ content: [{ type: "text", text: "ran" }] })
        for (const n of ["notify_band", "get_mix", "get_chart_inbox", "list_setlists"]) {
            server.registerTool(n, {} as never, ok as never)
        }
        const extra = (orgId: string) => ({ authInfo: { extra: { uid: "u1", orgId } } })

        t.features = { notifyBand: false, driveInbox: false }
        for (const n of ["notify_band", "get_mix", "get_chart_inbox"]) {
            const r = (await handlers[n]({}, extra("throwaway"))) as { isError: boolean; content: Array<{ text: string }> }
            expect(r.isError, n).toBe(true)
            expect(JSON.parse(r.content[0].text)).toMatchObject({ error: "feature_off" })
        }
        expect(await handlers.list_setlists({}, extra("throwaway"))).toEqual(await ok())
        // crc: everything runs. BL: the mixer is refused (CRC's console), notify_band runs.
        for (const n of ["notify_band", "get_mix", "get_chart_inbox"]) {
            expect(await handlers[n]({}, extra("crc"))).toEqual(await ok())
        }
        expect(((await handlers.get_mix({}, extra("brotherslazaroff"))) as { isError?: boolean }).isError).toBe(true)
        expect(await handlers.notify_band({}, extra("brotherslazaroff"))).toEqual(await ok())
    })

    it("a listed tool still refuses: ops surface bridge_get_log from a non-crc token", async () => {
        const { buildMcpHandler } = await import("@/lib/mcp/build-handler")
        const { callTool } = await import("@/lib/mcp/__tests__/helpers/mcp-rpc")
        const ops = buildMcpHandler("ops", "/api/ops")
        const r = (await callTool(ops, "bridge_get_log", {}, { path: "/api/ops/mcp", orgHeader: "throwaway" })) as {
            isError: boolean
            content: Array<{ text: string }>
        }
        expect(r.isError).toBe(true)
        expect(JSON.parse(r.content[0].text)).toMatchObject({ error: "feature_off", feature: "mixer" })
    })
})

describe("tenantInboxFolder", () => {
    it("feature_off / the tenant's own folder / crc's env fallback / not_configured", async () => {
        const { tenantInboxFolder } = await import("@/lib/drive-sync/tenant-inbox")
        expect(await tenantInboxFolder("crc", { CHART_INBOX_DRIVE_FOLDER_ID: "crc-folder" })).toEqual({ folderId: "crc-folder" })
        expect(await tenantInboxFolder("throwaway", { CHART_INBOX_DRIVE_FOLDER_ID: "crc-folder" })).toEqual({
            folderId: null,
            reason: "not_configured",
        })
        t.folderId = "own"
        expect(await tenantInboxFolder("throwaway", {})).toEqual({ folderId: "own" })
        t.features = { driveInbox: false }
        expect(await tenantInboxFolder("throwaway", {})).toEqual({ folderId: null, reason: "feature_off" })
        expect(await tenantInboxFolder("brotherslazaroff", { CHART_INBOX_DRIVE_FOLDER_ID: "crc-folder" })).toEqual({
            folderId: null,
            reason: "feature_off",
        })
    })
})
