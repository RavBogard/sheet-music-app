// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    callerRole: "admin" as string | undefined,
    change: vi.fn(),
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({ email: "x@example.test", displayName: "X" }) }) }) }),
    })),
}))
vi.mock("@/lib/org/access", () => ({
    readTenantRole: vi.fn(async () => h.callerRole),
    listTenantMembers: vi.fn(async () => []),
}))
vi.mock("@/lib/org/tenant-role-change", () => ({ changeTenantRole: h.change }))
vi.mock("@/lib/mcp/server-tracks-write", () => ({ assertEditor: vi.fn(async () => ({ ok: true })) }))

import { setMemberRole } from "@/lib/mcp/tools/people-access"
import { READ_TOOLS, WRITE_TOOLS } from "@/lib/mcp/tool-access"
import { OPS_TOOLS } from "@/lib/mcp/surfaces"

const PLAN = { ok: true, dryRun: true, before: { role: "pending", soundEngineer: false }, after: { role: "musician", soundEngineer: false }, changed: true, notified: false }

describe("set_member_role gates", () => {
    beforeEach(() => {
        h.callerRole = "admin"
        h.change.mockReset()
        h.change.mockImplementation(async (a: { dryRun: boolean }) => ({ ...PLAN, dryRun: a.dryRun }))
    })

    it("is classified: list is a read, set is a write, both on the authoring surface", () => {
        expect(READ_TOOLS.has("list_access_requests")).toBe(true)
        expect(WRITE_TOOLS.has("set_member_role")).toBe(true)
        expect(OPS_TOOLS.has("set_member_role") || OPS_TOOLS.has("list_access_requests")).toBe(false)
    })

    it("dry run is the default and never calls the real change", async () => {
        const r = await setMemberRole("me", { uid: "p", role: "musician" }, "crc")
        expect(r).toMatchObject({ ok: true, dryRun: true, before: { role: "pending" }, after: { role: "musician" } })
        expect(h.change).toHaveBeenCalledTimes(1)
        expect(h.change.mock.calls[0][0]).toMatchObject({ dryRun: true, strict: true, memberOnly: true, via: "mcp", orgId: "crc" })
    })

    it("a real run needs dryRun:false and force:true", async () => {
        expect(await setMemberRole("me", { uid: "p", role: "musician", dryRun: false }, "crc")).toMatchObject({ error: { machine_code: "force_required" } })
        expect(h.change).toHaveBeenCalledTimes(1)
        expect(await setMemberRole("me", { uid: "p", role: "musician", dryRun: false, force: true, reason: " r " }, "crc")).toMatchObject({ ok: true, dryRun: false })
        expect(h.change.mock.calls.at(-1)?.[0]).toMatchObject({ dryRun: false, note: "r" })
    })

    it("maps the shared refusals to rich errors", async () => {
        for (const [code, machine] of [["SELF_CHANGE", "self_change_refused"], ["LAST_ADMIN", "last_admin"], ["USER_NOT_FOUND", "user_not_found"]]) {
            h.change.mockResolvedValueOnce({ ok: false, code, message: "m" })
            expect(await setMemberRole("me", { uid: "p", role: "member" }, "crc")).toMatchObject({ ok: false, error: { machine_code: machine } })
        }
    })

    it("refuses a non-admin before reading anything else", async () => {
        h.callerRole = "band_leader"
        expect(await setMemberRole("me", { uid: "p", role: "member" }, "crc")).toMatchObject({ error: { machine_code: "forbidden_role" } })
        expect(h.change).not.toHaveBeenCalled()
    })
})
