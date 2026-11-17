// @vitest-environment node
/**
 * MCP delete_setlist runs the same cascade as POST /api/setlist/delete
 * (deleteSetlistCascade), after its own permission and version checks, and
 * only when they pass. The response envelope is unchanged.
 * The emulator suite (mcp-setlist-write.emulator.test.ts) checks the real
 * documents; this pins the wiring without Firestore.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    role: "admin" as string,
    setlist: { exists: true, data: { ownerId: "owner-1", orgId: "crc", version: 3 } as Record<string, unknown> },
    trackIds: ["t1", "t2"],
    deletes: [] as string[],
}))

const cascade = vi.hoisted(() =>
    vi.fn(async (_db: unknown, _org: string, _id: string) => ({
        assignments: 1,
        tasks: 0,
        notifications: 2,
        tracks: 0,
        errors: [] as string[],
    })),
)

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock("@/lib/org/access", () => ({
    readMembershipRole: vi.fn(async () => state.role),
    readTenantRole: vi.fn(async () => state.role),
}))
vi.mock("@/lib/setlist-ops", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/setlist-ops")>()
    return { ...actual, deleteSetlistCascade: cascade }
})

const fakeDb = {
    collection: (name: string) => ({
        doc: (id: string) => ({ path: `${name}/${id}`, id }),
        where: () => ({ kind: "tracks-query" }),
    }),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
            get: async (ref: { kind?: string }) =>
                ref.kind === "tracks-query"
                    ? { size: state.trackIds.length, docs: state.trackIds.map((id) => ({ id })) }
                    : { exists: state.setlist.exists, data: () => state.setlist.data },
            delete: (ref: { path: string }) => state.deletes.push(ref.path),
            set: vi.fn(),
            update: vi.fn(),
            create: vi.fn(),
        }),
}
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => fakeDb),
}))

import { deleteSetlist } from "@/lib/mcp/tools/setlist-write"

beforeEach(() => {
    cascade.mockClear()
    state.role = "admin"
    state.setlist = { exists: true, data: { ownerId: "owner-1", orgId: "crc", version: 3 } }
    state.deletes = []
})

describe("MCP delete_setlist cascade", () => {
    it("deletes the setlist and rows, then runs the shared cascade for the caller's tenant", async () => {
        const res = await deleteSetlist("admin-1", { id: "s-1" }, "crc")
        expect(res).toEqual({ ok: true, tracksDeleted: 2 })
        expect(state.deletes).toEqual(["tracks/t1", "tracks/t2", "setlists/s-1"])
        expect(cascade).toHaveBeenCalledTimes(1)
        expect(cascade.mock.calls[0].slice(1)).toEqual(["crc", "s-1"])
    })

    it("keeps the envelope when a cascade phase fails", async () => {
        cascade.mockResolvedValueOnce({ assignments: 0, tasks: 0, notifications: 0, tracks: 0, errors: ["tasks: boom"] })
        expect(await deleteSetlist("admin-1", { id: "s-1" }, "crc")).toEqual({ ok: true, tracksDeleted: 2 })
    })

    it("does not cascade when the caller is not the owner or an admin", async () => {
        state.role = "band_leader"
        const res = (await deleteSetlist("leader-1", { id: "s-1" }, "crc")) as { error?: { machine_code: string } }
        expect(res.error?.machine_code).toBe("forbidden_owner")
        expect(cascade).not.toHaveBeenCalled()
        expect(state.deletes).toEqual([])
    })

    it("does not cascade another tenant's setlist", async () => {
        const res = (await deleteSetlist("admin-1", { id: "s-1" }, "brotherslazaroff")) as {
            error?: { machine_code: string }
        }
        expect(res.error?.machine_code).toBe("setlist_not_found")
        expect(cascade).not.toHaveBeenCalled()
    })

    it("does not cascade on a stale version", async () => {
        const res = (await deleteSetlist("admin-1", { id: "s-1", lastSeenVersion: 2 }, "crc")) as { error?: unknown }
        expect(res.error).toBeDefined()
        expect(cascade).not.toHaveBeenCalled()
    })

    it("does not cascade a missing setlist", async () => {
        state.setlist = { exists: false, data: {} }
        const res = (await deleteSetlist("admin-1", { id: "nope" }, "crc")) as { error?: { machine_code: string } }
        expect(res.error?.machine_code).toBe("setlist_not_found")
        expect(cascade).not.toHaveBeenCalled()
    })
})
