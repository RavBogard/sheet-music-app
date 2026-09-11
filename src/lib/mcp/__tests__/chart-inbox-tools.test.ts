import { beforeEach, describe, expect, it, vi } from "vitest"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

/**
 * Chart Inbox MCP tools — behavior contract.
 *
 * The inbox exists so ANY music director or admin can add chart files from ANY
 * Claude client without bytes crossing the conversation. These tests pin the
 * parts of that contract a regression would silently break:
 *   - both tools are registered and advertise the Drive-folder flow
 *   - an unconfigured deployment / a non-primary tenant gets a rich envelope,
 *     never a stack trace
 *   - sync is gated on upload permission and rate-limited like uploads
 *   - the on-demand tick is capped and reports capReached
 */

const inbox = vi.hoisted(() => ({
    folderId: "1ZNdvVKeFa7jjP_iLYBv5vXaB7DyA3tTB" as string | null,
    status: vi.fn(),
    sync: vi.fn(),
}))
const roles = vi.hoisted(() => ({
    loadUploader: vi.fn(),
    rateLimit: vi.fn(),
}))

vi.mock("@/env.mjs", () => ({ env: { CHART_INBOX_DRIVE_FOLDER_ID: "" } }))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: () => true,
    getFirestore: () => ({ __fake: true }),
}))
vi.mock("@/lib/rate-limit", () => ({
    checkUserRateLimit: (...args: unknown[]) => roles.rateLimit(...args),
}))
vi.mock("@/lib/mcp/tools/uploader-roles", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/mcp/tools/uploader-roles")>()
    return { ...real, loadUploader: (...args: unknown[]) => roles.loadUploader(...args) }
})
vi.mock("@/lib/drive-sync/inbox", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/lib/drive-sync/inbox")>()
    return {
        ...real,
        resolveChartInboxFolderId: () => inbox.folderId,
        readChartInboxStatus: (...args: unknown[]) => inbox.status(...args),
        buildProdDriveSyncDeps: async () => ({ fake: "deps" }),
        syncChartInboxNow: (...args: unknown[]) => inbox.sync(...args),
    }
})

import { registerChartInboxTools } from "@/lib/mcp/tools/register-chart-inbox"

type Handler = (args: Record<string, unknown>, extra: unknown) => Promise<{
    content: Array<{ type: string; text: string }>
    structuredContent: Record<string, unknown>
    isError: boolean
}>

function capture() {
    const tools: Record<string, { config: { description: string }; handler: Handler }> = {}
    const server = {
        registerTool: (name: string, config: { description: string }, handler: Handler) => {
            tools[name] = { config, handler }
        },
    } as unknown as McpServer
    registerChartInboxTools(server)
    return tools
}

function extraFor(uid: string, org?: string) {
    return { authInfo: { extra: { uid, ...(org ? { orgId: org } : {}) } } }
}

beforeEach(() => {
    inbox.folderId = "1ZNdvVKeFa7jjP_iLYBv5vXaB7DyA3tTB"
    inbox.status.mockReset()
    inbox.sync.mockReset()
    roles.loadUploader.mockReset()
    roles.rateLimit.mockReset()
    roles.rateLimit.mockResolvedValue(null)
})

describe("chart inbox tools — registration", () => {
    it("registers get_chart_inbox and sync_chart_inbox and teaches the Drive-folder flow", () => {
        const tools = capture()
        expect(Object.keys(tools).sort()).toEqual(["get_chart_inbox", "sync_chart_inbox"])
        for (const t of Object.values(tools)) {
            expect(t.config.description).toMatch(/Chart Inbox/)
            expect(t.config.description).toMatch(/never handle file bytes/)
        }
    })
})

describe("get_chart_inbox", () => {
    it("returns the status payload for the primary tenant", async () => {
        inbox.status.mockResolvedValue({ configured: true, folderUrl: "https://drive.google.com/drive/folders/x", recentImports: [] })
        const r = await capture().get_chart_inbox.handler({}, extraFor("u1"))
        expect(r.isError).toBe(false)
        expect(r.structuredContent).toMatchObject({ ok: true, configured: true })
        expect(inbox.status).toHaveBeenCalledWith(expect.anything(), inbox.folderId, { recentLimit: undefined })
    })

    it("unconfigured deployment → chart_inbox_not_configured envelope, no throw", async () => {
        inbox.folderId = null
        const r = await capture().get_chart_inbox.handler({}, extraFor("u1"))
        expect(r.isError).toBe(true)
        expect(r.structuredContent).toMatchObject({ error: { machine_code: "chart_inbox_not_configured" } })
        expect(inbox.status).not.toHaveBeenCalled()
    })

    it("a non-primary tenant is told the inbox is not set up for them (never another org's folder)", async () => {
        const r = await capture().get_chart_inbox.handler({}, extraFor("u1", "broslaz"))
        expect(r.isError).toBe(true)
        expect(JSON.stringify(r.structuredContent)).toMatch(/broslaz/)
        expect(inbox.status).not.toHaveBeenCalled()
    })

    it("rejects an unauthenticated call", async () => {
        await expect(
            capture().get_chart_inbox.handler({}, { authInfo: { extra: {} } }),
        ).rejects.toThrow(/Unauthenticated/)
    })
})

describe("sync_chart_inbox", () => {
    it("runs a capped tick for an upload-allowed user and returns counts", async () => {
        roles.loadUploader.mockResolvedValue({ role: "musician", canUpload: false, email: "m@x" })
        inbox.sync.mockResolvedValue({ watching: true, filesScanned: 2, imported: 2, capReached: false, errors: [] })
        const r = await capture().sync_chart_inbox.handler({ maxFiles: 5 }, extraFor("u1"))
        expect(r.isError).toBe(false)
        expect(r.structuredContent).toMatchObject({ ok: true, imported: 2, capReached: false })
        expect(inbox.sync).toHaveBeenCalledWith(inbox.folderId, { fake: "deps" }, { fileCap: 5 })
        // musicians are NOT trusted leaders → the upload rate limit applies
        expect(roles.rateLimit).toHaveBeenCalledWith("u1", "upload", { bypass: false })
    })

    it("admins bypass the rate limit", async () => {
        roles.loadUploader.mockResolvedValue({ role: "admin", canUpload: false, email: "a@x" })
        inbox.sync.mockResolvedValue({ watching: true, filesScanned: 0, imported: 0, capReached: false, errors: [] })
        await capture().sync_chart_inbox.handler({}, extraFor("adm"))
        expect(roles.rateLimit).toHaveBeenCalledWith("adm", "upload", { bypass: true })
    })

    it("a user without upload permission gets the upload_forbidden envelope and no tick runs", async () => {
        roles.loadUploader.mockResolvedValue({ role: undefined, canUpload: false, email: "v@x" })
        const r = await capture().sync_chart_inbox.handler({}, extraFor("viewer"))
        expect(r.isError).toBe(true)
        expect(inbox.sync).not.toHaveBeenCalled()
    })

    it("a rate-limited user gets the rate-limit envelope and no tick runs", async () => {
        roles.loadUploader.mockResolvedValue({ role: "musician", canUpload: false, email: "m@x" })
        roles.rateLimit.mockResolvedValue({ error: "rate_limited", retryAfterSec: 30 })
        const r = await capture().sync_chart_inbox.handler({}, extraFor("u1"))
        expect(r.isError).toBe(true)
        expect(inbox.sync).not.toHaveBeenCalled()
    })

    it("unconfigured deployment → not_configured before any role lookup", async () => {
        inbox.folderId = null
        const r = await capture().sync_chart_inbox.handler({}, extraFor("u1"))
        expect(r.isError).toBe(true)
        expect(roles.loadUploader).not.toHaveBeenCalled()
    })
})
