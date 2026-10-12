import { describe, it, expect, vi, beforeEach } from "vitest"
import { FakeFirestore, tenantFilters } from "@/lib/org/__tests__/fake-admin-firestore"
import { scopeRowsToTenant, scopeUsersToTenant, readsUntaggedRows } from "@/lib/org/tenant-query"

/**
 * Multi-tenant phase 1 — the scheduling reads query by tenant for every org
 * but crc. crc keeps the legacy read (its untagged rows cannot be queried by
 * orgId until phase 2 stamps them). A tenant whose rows sit behind more than
 * a window's worth of CRC rows now gets its own latest rows instead of none.
 */

let db: FakeFirestore
// Multi-tenant P2: role reads go through @/lib/org/access (spec behaviour fake).
vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: { req: Request }) => unknown) => (req: Request) => fn({ req }),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: async () => ({ ok: true }),
}))

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000)

function seedCrowded(): FakeFirestore {
    const history: Record<string, Record<string, unknown>> = {}
    const assignments: Record<string, Record<string, unknown>> = {}
    // 60 newer crc rows (half untagged) in front of 3 older BL rows.
    for (let i = 0; i < 60; i++) {
        const tag = i % 2 ? { orgId: "crc" } : {}
        history[`c${i}`] = { ...tag, musicianUid: "uc", recordedAt: day(100 + i) }
        assignments[`c${i}`] = { ...tag, status: "confirmed", musicianUid: "uc", musicianName: "C", instrument: "piano", setlistId: `cs${i}`, assignedAt: day(100 + i) }
    }
    for (let i = 0; i < 3; i++) {
        history[`b${i}`] = { orgId: "brotherslazaroff", musicianUid: "ub", recordedAt: day(i) }
    }
    return new FakeFirestore().seed("scheduling_history", history).seed("scheduling_assignments", assignments)
}

beforeEach(() => {
    db = seedCrowded()
})

describe("tenant-query helpers", () => {
    it("leave crc's query alone and narrow everyone else's", () => {
        const calls: unknown[][] = []
        const q = { where: (...a: unknown[]) => (calls.push(a), q) }
        expect(readsUntaggedRows("crc")).toBe(true)
        expect(scopeRowsToTenant(q, "crc")).toBe(q)
        expect(scopeUsersToTenant(q, "crc")).toBe(q)
        expect(calls).toEqual([])
        scopeRowsToTenant(q, "brotherslazaroff")
        scopeUsersToTenant(q, "testshul")
        expect(calls).toEqual([
            ["orgId", "==", "brotherslazaroff"],
            ["orgIds", "array-contains", "testshul"],
        ])
    })
})

describe("/api/scheduling/history", () => {
    const get = async (org: string, qs = "") => {
        const { GET } = await import("@/app/api/scheduling/history/route")
        const res = await (GET as unknown as (r: Request) => Promise<Response>)(
            new Request(`https://x.test/api/scheduling/history${qs}`, { headers: { "x-org-id": org } }),
        )
        return res.json()
    }

    it("BL gets its own latest rows even behind 60 newer CRC rows", async () => {
        const body = await get("brotherslazaroff")
        expect(body.history.map((h: { id: string }) => h.id)).toEqual(["b2", "b1", "b0"])
        expect(tenantFilters(db, "scheduling_history")).toEqual([{ field: "orgId", op: "==", value: "brotherslazaroff" }])
        expect(tenantFilters(db, "scheduling_assignments")).toEqual([{ field: "orgId", op: "==", value: "brotherslazaroff" }])
    })

    it("crc keeps the latest-50-then-filter read, untagged rows included", async () => {
        const body = await get("crc")
        expect(body.history).toHaveLength(50)
        expect(body.history.some((h: { orgId?: string }) => h.orgId === undefined)).toBe(true)
        expect(tenantFilters(db, "scheduling_history")).toEqual([])
        expect(tenantFilters(db, "scheduling_assignments")).toEqual([])
    })
})

describe("MCP roster reads for a third tenant", () => {
    it("list_pending_assignments and suggest_band query by the tenant", async () => {
        db.seed("scheduling_assignments", {
            t1: { orgId: "testshul", status: "pending", musicianUid: "ut", musicianName: "T", instrument: "voice", setlistId: "ts1", setlistName: "Shabbat", assignedAt: day(1) },
        })
            .seed("setlists", { ts1: { orgId: "testshul" } })
            .seed("users", { ut: { role: "musician", orgIds: ["testshul"], displayName: "T", musicianProfile: { instrument: "voice" } } })
        const { listPendingAssignments, suggestBand } = await import("@/lib/mcp/tools/roster")
        const pending = await listPendingAssignments("caller", {}, "testshul")
        expect(pending).toMatchObject({ ok: true, count: 1, assignments: [{ assignmentId: "t1" }] })
        const band = await suggestBand("caller", { setlistId: "ts1" }, "testshul")
        expect(band).toMatchObject({ ok: true, suggestions: [{ uid: "ut" }] })
        expect(tenantFilters(db, "scheduling_assignments")).toEqual([
            { field: "orgId", op: "==", value: "testshul" },
            { field: "orgId", op: "==", value: "testshul" },
        ])
        // Multi-tenant P2: the roster comes from listTenantMembers("testshul"),
        // not a users query — the suggestion above proves the tenant scoping.
    })
})
