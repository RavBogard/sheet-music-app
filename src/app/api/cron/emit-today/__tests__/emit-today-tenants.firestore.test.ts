import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { codeOrgConfig } from "@/lib/org/config-code"

/**
 * Multi-tenant phase 1 — with ORG_CONFIG_SOURCE=firestore the emit-today cron
 * also covers every active `orgs/{id}` tenant, after crc and brotherslazaroff.
 */

let db: FakeFirestore
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/env.mjs", () => ({ env: { CRON_SECRET: "secret" } }))
vi.mock("@/lib/email", () => ({ sendBridgeHealthAlert: vi.fn() }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }))
const emitToday = vi.fn(async (org: string) => ({ ok: true as const, path: `public/today/${org}.json`, serviceCount: 0 }))
vi.mock("@/lib/today/emit-today", () => ({
    emitToday: (org: string) => emitToday(org),
    readStoredToday: async () => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), services: [] }),
}))

beforeEach(() => {
    process.env.ORG_CONFIG_SOURCE = "firestore"
    db = new FakeFirestore().seed("orgs", {
        brotherslazaroff: { ...codeOrgConfig("brotherslazaroff") },
        testshul: { ...makeTestOrgConfig() },
        crc: { ...codeOrgConfig("crc") },
        gone: { ...makeTestOrgConfig({ id: "gone", status: "suspended" }) },
    })
    emitToday.mockClear()
})
afterEach(() => {
    delete process.env.ORG_CONFIG_SOURCE
})

describe("emit-today with Firestore tenant configs", () => {
    it("emits the code tenants first, then each active orgs/{id}", async () => {
        const { GET } = await import("../route")
        await GET(new NextRequest("https://x.test/api/cron/emit-today", { headers: { authorization: "Bearer secret" } }))
        expect(emitToday.mock.calls.map((c) => c[0])).toEqual(["crc", "brotherslazaroff", "testshul"])
    })
})
