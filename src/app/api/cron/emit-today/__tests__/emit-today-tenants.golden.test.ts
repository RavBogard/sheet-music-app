import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

/**
 * Multi-tenant phase 1 GOLDEN — the emit-today cron's tenant loop as it runs
 * today: one emit per tenant, crc then brotherslazaroff, each to its own file.
 * Written against the code BEFORE the registry-loop change and never edited
 * afterwards.
 */

let db: FakeFirestore
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/env.mjs", () => ({ env: { CRON_SECRET: "secret" } }))
vi.mock("@/lib/email", () => ({ sendBridgeHealthAlert: vi.fn() }))
const emitToday = vi.fn(async (org: string) => ({ ok: true as const, path: `public/today/${org}.json`, serviceCount: org.length }))
const readStoredToday = vi.fn(async (_org: string) => ({ schemaVersion: 1, generatedAt: new Date().toISOString(), services: [] }))
vi.mock("@/lib/today/emit-today", () => ({
    emitToday: (org: string) => emitToday(org),
    readStoredToday: (org: string) => readStoredToday(org),
}))

beforeEach(() => {
    db = new FakeFirestore()
    emitToday.mockClear()
    readStoredToday.mockClear()
})

export async function runEmitToday() {
    const { GET } = await import("../route")
    const res = await GET(new NextRequest("https://x.test/api/cron/emit-today", { headers: { authorization: "Bearer secret" } }))
    return (await res.json()) as { ok: boolean; healthy: boolean; results: unknown[] }
}

describe("golden emit-today tenant loop", () => {
    it("emits crc then brotherslazaroff, each to its own file", async () => {
        const body = await runEmitToday()
        expect(emitToday.mock.calls.map((c) => c[0])).toEqual(["crc", "brotherslazaroff"])
        expect(readStoredToday.mock.calls.map((c) => c[0])).toEqual(["crc", "brotherslazaroff"])
        expect(body.ok).toBe(true)
        expect(body.healthy).toBe(true)
        expect(body.results).toEqual([
            { org: "crc", ok: true, serviceCount: 3 },
            { org: "brotherslazaroff", ok: true, serviceCount: 16 },
        ])
    })
})
