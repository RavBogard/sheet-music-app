// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

/**
 * Multi-tenant phase 1 golden — the CORS default on the two chart-byte routes.
 * With ALLOWED_ORIGINS unset, both answer with the CRC origins only; a BL
 * origin falls through to https://centralreform.live, exactly as today
 * (adding BL's origins would change BL behaviour, so it is not done here).
 */
const mockFetchFileById = vi.fn()

vi.mock("@/lib/file-fetcher", () => ({ fetchFileById: (...a: unknown[]) => mockFetchFileById(...a) }))
vi.mock("@/lib/drive-file-auth", () => ({ hasBrowserFetchMetadata: () => true }))
vi.mock("@/lib/mcp/auth", () => ({ verifyBearer: vi.fn(async () => ({ error: "no" })) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, verifyIdToken: async () => null, getFirestore: () => ({}) }))

type Handler = (req: import("next/server").NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

const CASES: Array<[origin: string | null, host: string, expected: string]> = [
    ["https://centralreform.live", "crc", "https://centralreform.live"],
    ["https://www.centralreform.live", "crc", "https://www.centralreform.live"],
    ["https://brotherslazaroff.live", "brotherslazaroff", "https://centralreform.live"],
    ["https://www.brotherslazaroff.live", "brotherslazaroff", "https://centralreform.live"],
    ["https://evil.example", "crc", "https://centralreform.live"],
    ["https://preview-123.vercel.app", "crc", "https://preview-123.vercel.app"],
    ["http://localhost:3000", "crc", "http://localhost:3000"],
    [null, "crc", "https://centralreform.live"],
]

describe("multi-tenant P1 golden: CORS default origins", () => {
    let libraryGET: Handler
    let driveGET: Handler

    beforeAll(async () => {
        delete process.env.ALLOWED_ORIGINS
        vi.resetModules()
        libraryGET = (await import("@/app/api/library/file/[id]/route")).GET as unknown as Handler
        driveGET = (await import("@/app/api/drive/file/[fileId]/route")).GET as unknown as Handler
    })

    beforeEach(() => {
        mockFetchFileById.mockReset()
        mockFetchFileById.mockResolvedValue({ buffer: new Uint8Array([1, 2, 3]), contentType: "application/pdf", source: "firebase-storage" })
    })

    for (const [origin, org, expected] of CASES) {
        const headers: Record<string, string> = { "sec-fetch-site": "same-origin", "x-org-id": org }
        if (origin) headers.origin = origin

        it(`/api/library/file: origin ${origin} (${org}) → ${expected}`, async () => {
            const res = await libraryGET(makeReq("/api/library/file/upload-abc", { headers }), { params: Promise.resolve({ id: "upload-abc" }) })
            expect(res.status).toBe(200)
            expect(res.headers.get("access-control-allow-origin")).toBe(expected)
        })

        it(`/api/drive/file: origin ${origin} (${org}) → ${expected}`, async () => {
            const res = await driveGET(makeReq("/api/drive/file/upload-abc", { headers }), { params: Promise.resolve({ fileId: "upload-abc" }) })
            expect(res.status).toBe(200)
            expect(res.headers.get("access-control-allow-origin")).toBe(expected)
        })
    }
})

describe("multi-tenant P1: tenant origins from config (for later phases)", () => {
    it("the default list is CRC's two origins", async () => {
        const { allowedOriginsFromEnv, DEFAULT_ALLOWED_ORIGINS } = await import("@/lib/http/cors-origins")
        expect(DEFAULT_ALLOWED_ORIGINS).toBe("https://centralreform.live,https://www.centralreform.live")
        expect(allowedOriginsFromEnv(undefined)).toEqual(["https://centralreform.live", "https://www.centralreform.live"])
        expect(allowedOriginsFromEnv(" https://a.example , https://b.example")).toEqual(["https://a.example", "https://b.example"])
    })

    it("lists each tenant's origins from config", async () => {
        const { allTenantOrigins, tenantOrigins } = await import("@/lib/http/cors-origins")
        const { clearPrimedOrgConfigs } = await import("@/lib/org/config-cache")
        const { primeTestOrg } = await import("@/lib/org/__tests__/test-org-config")
        clearPrimedOrgConfigs()
        expect(allTenantOrigins()).toEqual([
            "https://centralreform.live",
            "https://www.centralreform.live",
            "https://brotherslazaroff.live",
            "https://www.brotherslazaroff.live",
        ])
        const ts = primeTestOrg()
        expect(tenantOrigins(ts)).toEqual(["https://testshul.vercel.app"])
        expect(allTenantOrigins(["crc", "testshul"])).toEqual([
            "https://centralreform.live",
            "https://www.centralreform.live",
            "https://testshul.vercel.app",
        ])
    })
})
