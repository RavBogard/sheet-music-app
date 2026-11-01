// @vitest-environment node
/**
 * Multi-tenant phase 6 GOLDEN — the routes and crons phase 6 gates, as they
 * answer for crc and brotherslazaroff BEFORE the gates. Written against the
 * unchanged code (master 96e937d6 + the contract commit) and never edited
 * afterwards: after phase 6 these must still pass unchanged.
 *
 *   drive-sync cron   one tick over CRC's env inbox folder; dormant when unset
 *   bridge-watch cron reads CRC's bare config/monitor and answers healthy
 *   GET /api/today    serves the stored document for crc and for BL
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

let db: FakeFirestore
const envState = vi.hoisted(() => ({ env: { CRON_SECRET: "secret" } as Record<string, string | undefined> }))
vi.mock("@/env.mjs", () => ({ env: envState.env }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/error-reporting", () => ({ captureException: vi.fn() }))
vi.mock("@/lib/email", () => ({ sendBridgeHealthAlert: vi.fn() }))
vi.mock("@/lib/push-send", () => ({ sendPushToUsers: vi.fn() }))
vi.mock("@/lib/org/access", () => ({ listTenantMembers: vi.fn(async () => []) }))
vi.mock("@/lib/org/get-org-config", async () => {
    const { codeOrgConfig } = await import("@/lib/org/config-code")
    return { getOrgConfig: vi.fn(async (orgId: string) => codeOrgConfig(orgId)), orgConfigSource: () => "code" }
})

const runDriveSyncProd = vi.fn(async (_db: unknown, folder: string) => ({
    watching: true,
    parentFolderId: folder,
    subfolderIds: [],
    filesScanned: 0,
    imported: 0,
    renamed: 0,
    replaced: 0,
    moved: 0,
    skipped: 0,
    queued: 0,
    errors: [],
}))
vi.mock("@/lib/drive-sync/poller", () => ({ runDriveSyncProd: (...a: [unknown, string]) => runDriveSyncProd(...a) }))

const evaluateBridge = vi.fn(() => ({ healthy: true, signature: "", problems: [] }))
vi.mock("@/app/api/cron/bridge-watch/evaluate", () => ({
    evaluateBridge: () => evaluateBridge(),
    toMillis: () => null,
}))

const readStoredToday = vi.fn(async (org: string) => ({ schemaVersion: 1, org, generatedAt: "2026-10-12T00:00:00.000Z", services: [] }))
vi.mock("@/lib/today/emit-today", () => ({
    readStoredToday: (org: string) => readStoredToday(org),
    buildToday: vi.fn(async () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), services: [] })),
    emitToday: vi.fn(),
}))

const auth = { headers: { authorization: "Bearer secret" } }

beforeEach(() => {
    db = new FakeFirestore().seed("config", { monitor: { bridge: { lastSeen: Date.now() } } })
    runDriveSyncProd.mockClear()
    evaluateBridge.mockClear()
    readStoredToday.mockClear()
    delete envState.env.CHART_INBOX_DRIVE_FOLDER_ID
    delete envState.env.DAVID_DRIVE_DROP_FOLDER_ID
})

describe("golden drive-sync cron", () => {
    it("one tick over CRC's env folder", async () => {
        envState.env.CHART_INBOX_DRIVE_FOLDER_ID = "crc-inbox-folder"
        const { GET } = await import("@/app/api/cron/drive-sync/route")
        const res = await GET(new NextRequest("https://x.test/api/cron/drive-sync", auth))
        expect(res.status).toBe(200)
        expect(runDriveSyncProd.mock.calls.map((c) => c[1])).toEqual(["crc-inbox-folder"])
        const body = (await res.json()) as Record<string, unknown>
        expect(body).toMatchObject({ success: true, watching: true, parentFolderId: "crc-inbox-folder", imported: 0 })
    })

    it("dormant when no folder is configured", async () => {
        const { GET } = await import("@/app/api/cron/drive-sync/route")
        const res = await GET(new NextRequest("https://x.test/api/cron/drive-sync", auth))
        expect(runDriveSyncProd).not.toHaveBeenCalled()
        expect(await res.json()).toMatchObject({ success: true, watching: false })
    })
})

describe("golden bridge-watch cron", () => {
    it("reads CRC's config/monitor and answers healthy when a service is about to start", async () => {
        // Since the studio PC went on/off per service, the route only checks the bridge 20-40 min
        // before a service: give it one starting in 30 minutes.
        const now = Date.now()
        readStoredToday.mockResolvedValueOnce({
            schemaVersion: 1,
            org: "crc",
            generatedAt: new Date(now).toISOString(),
            services: [{ setlistId: "sl1", name: "Friday evening", eventDate: "2026-10-30", startsAt: new Date(now + 30 * 60_000).toISOString() }],
        } as never)
        const { GET } = await import("@/app/api/cron/bridge-watch/route")
        const res = await GET(new Request("https://x.test/api/cron/bridge-watch", auth))
        expect(await res.json()).toMatchObject({ success: true, healthy: true, notified: false })
        expect(evaluateBridge).toHaveBeenCalledTimes(1)
    })

    it("does not look at the bridge when no service is about to start", async () => {
        const { GET } = await import("@/app/api/cron/bridge-watch/route")
        const res = await GET(new Request("https://x.test/api/cron/bridge-watch", auth))
        expect(await res.json()).toEqual({ success: true, skipped: "no_service_in_window" })
        expect(evaluateBridge).not.toHaveBeenCalled()
    })
})

describe("golden GET /api/today", () => {
    for (const org of ["crc", "brotherslazaroff"]) {
        it(`serves ${org}'s stored document`, async () => {
            const { GET } = await import("@/app/api/today/route")
            const res = await GET(new NextRequest("https://x.test/api/today", { headers: { "x-org-id": org } }))
            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({ org })
            expect(res.headers.get("access-control-allow-origin")).toBe("*")
        })
    }
})
