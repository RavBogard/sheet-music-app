/**
 * Multi-tenant phase 3 (carried from P1/P2): a third tenant's config is primed
 * where the server resolves the request or token tenant, so synchronous reads
 * (getOrgBranding, orgString) see that tenant instead of the CRC fallback.
 * Also orgExists, the "tenant that exists" check used by admin/test tools.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { primeOrgConfig, clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

let configFails = false
const getOrgConfig = vi.fn(async (id: string) => {
    if (configFails) throw new Error("firestore down")
    if (id !== "testshul") return null
    const cfg = makeTestOrgConfig()
    primeOrgConfig(cfg)
    return cfg
})
vi.mock("@/lib/org/get-org-config", () => ({
    getOrgConfig: (id: string) => getOrgConfig(id),
}))

// ── Firestore / Auth stand-ins for verifyBearer, requireAuth, getServerUser ──
const tokenDoc = { uid: "u1", orgId: "testshul" }
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    verifyIdToken: vi.fn(async () => ({ uid: "u1", email: "u1@example.org" })),
    getFirestore: vi.fn(() => ({
        collection: () => ({
            where: () => ({
                limit: () => ({
                    get: async () => ({
                        empty: false,
                        docs: [{ id: "tok1", data: () => tokenDoc, ref: { update: vi.fn().mockResolvedValue(undefined) } }],
                    }),
                }),
            }),
        }),
    })),
}))
vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: vi.fn(() => "TS") },
    Timestamp: class {},
    getFirestore: vi.fn(() => ({})),
}))
vi.mock("firebase-admin/auth", () => ({
    getAuth: () => ({ verifySessionCookie: vi.fn(async () => ({ uid: "u1", email: "u1@example.org" })) }),
}))
vi.mock("@/lib/org/access", () => ({
    getTenantAccess: vi.fn(async () => ({ effectiveRole: "musician", po: false, soundEngineer: false })),
    accessFromToken: vi.fn(),
}))
const headerStore = new Map<string, string>()
vi.mock("next/headers", () => ({
    headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
    cookies: async () => ({ get: (k: string) => (k === "__session" ? { value: "cookie" } : undefined) }),
}))

import { orgExists, primeTenantConfig } from "@/lib/org/org-exists"
import { getOrgBranding } from "@/lib/org/branding"
import { verifyBearer } from "@/lib/mcp/auth"
import { requireAuth } from "@/lib/api-auth"
import { getServerUser } from "@/lib/server-auth"
import { sendSchedulingAssignmentSMS } from "@/lib/sms"

beforeEach(() => {
    clearPrimedOrgConfigs()
    getOrgConfig.mockClear()
    configFails = false
    headerStore.clear()
})

describe("orgExists", () => {
    it("compiled tenants exist without a config read", async () => {
        expect(await orgExists("crc")).toBe(true)
        expect(await orgExists("brotherslazaroff")).toBe(true)
        expect(getOrgConfig).not.toHaveBeenCalled()
    })
    it("a third tenant exists when its config resolves", async () => {
        expect(await orgExists("testshul")).toBe(true)
        expect(await orgExists("ghost")).toBe(false)
    })
    it("malformed ids never exist and are never read", async () => {
        expect(await orgExists("Bad Id")).toBe(false)
        expect(await orgExists("")).toBe(false)
        expect(await orgExists(undefined)).toBe(false)
        expect(getOrgConfig).not.toHaveBeenCalled()
    })
    it("a failed config read means 'does not exist', not a throw", async () => {
        configFails = true
        expect(await orgExists("testshul")).toBe(false)
    })
})

describe("primeTenantConfig", () => {
    it("primes the synchronous cache", async () => {
        expect(getOrgBranding("testshul").shortName).not.toBe("Test Shul Music")
        await primeTenantConfig("testshul")
        expect(getOrgBranding("testshul").shortName).toBe("Test Shul Music")
    })
    it("never throws", async () => {
        configFails = true
        await expect(primeTenantConfig("testshul")).resolves.toBeUndefined()
        await expect(primeTenantConfig(undefined)).resolves.toBeUndefined()
    })
})

describe("server entry points prime the tenant they resolve", () => {
    it("MCP verifyBearer primes the token's tenant", async () => {
        const req = new Request("https://testshul.vercel.app/api/mcp", { headers: { authorization: "Bearer crl_live_abc" } })
        const res = await verifyBearer(req)
        expect(res).not.toBeInstanceOf(Response)
        expect(getOrgConfig).toHaveBeenCalledWith("testshul")
        expect(getOrgBranding("testshul").shortName).toBe("Test Shul Music")
    })

    it("requireAuth primes the host tenant (x-org-id)", async () => {
        const req = new Request("https://testshul.vercel.app/api/x", {
            headers: { authorization: "Bearer idtoken", "x-org-id": "testshul" },
        })
        const auth = await requireAuth(req)
        expect(auth.orgId).toBe("testshul")
        expect(getOrgConfig).toHaveBeenCalledWith("testshul")
        expect(getOrgBranding("testshul").shortName).toBe("Test Shul Music")
    })

    it("requireAuth still succeeds when the config read fails", async () => {
        configFails = true
        const req = new Request("https://testshul.vercel.app/api/x", {
            headers: { authorization: "Bearer idtoken", "x-org-id": "testshul" },
        })
        expect((await requireAuth(req)).orgId).toBe("testshul")
    })

    it("getServerUser primes the host tenant", async () => {
        headerStore.set("x-org-id", "testshul")
        const user = await getServerUser()
        expect(user?.orgId).toBe("testshul")
        expect(getOrgConfig).toHaveBeenCalledWith("testshul")
    })

    it("SMS senders prime the tenant they are called with", async () => {
        await sendSchedulingAssignmentSMS({
            to: "+15555550100",
            musicianName: "A B",
            setlistName: "S",
            eventDate: "2026-10-16",
            status: "pending",
            scheduleUrl: "https://testshul.vercel.app/schedule",
            org: "testshul",
        })
        expect(getOrgConfig).toHaveBeenCalledWith("testshul")
    })
})
