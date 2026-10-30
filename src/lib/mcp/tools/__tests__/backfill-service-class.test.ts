import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { id: string; data: Record<string, unknown> }
let ROWS: Row[] = []
const docUpdate = vi.fn(async (..._a: unknown[]) => undefined)
const collectionName = vi.fn()
const mockAssertEditor = vi.fn(async () => ({ ok: true }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: vi.fn((name: string) => {
            collectionName(name)
            return {
                get: async () => ({
                    docs: ROWS.map((r) => ({ id: r.id, data: () => r.data, updateTime: `t-${r.id}` })),
                }),
                doc: (id: string) => ({ id, update: (...a: unknown[]) => docUpdate(id, ...a) }),
            }
        }),
    })),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: (...a: unknown[]) => mockAssertEditor(...(a as [])),
}))

import { backfillSetlistServiceClass } from "../backfill-service-class"

type Ok = {
    ok: true
    dryRun: boolean
    scanned: number
    changed: Array<{ setlistId: string; patch: Record<string, unknown> }>
    skipped: { alreadySet: number; changedDuringRun: number }
}

beforeEach(() => {
    vi.clearAllMocks()
    ROWS = [
        { id: "a", data: { orgId: "crc", name: "Kabbalat Shabbat — May 22", templateType: "kabbalat-shabbat", rabbi: "Daniel" } },
        { id: "b", data: { orgId: "crc", name: "Shabbat Morning", serviceType: "shabbat_morning", rabbiSlot: "randy", special: false } },
        { id: "c", data: { name: "Shabbat Morning with guests", templateType: "shabbat_morning", rabbi: "Randy", rabbiSlot: "daniel_karen" } },
        { id: "d", data: { orgId: "brotherslazaroff", name: "Wedding gig" } },
    ]
})

describe("backfillSetlistServiceClass", () => {
    it("dry run reports {scanned, changed[], skipped:{alreadySet, changedDuringRun}} and writes nothing", async () => {
        const r = (await backfillSetlistServiceClass("u", {}, "crc")) as Ok
        expect(r).toMatchObject({ ok: true, dryRun: true, scanned: 3, skipped: { alreadySet: 1, changedDuringRun: 0 } })
        expect(r.changed).toEqual([
            expect.objectContaining({ setlistId: "a", patch: { serviceType: "friday_night", rabbiSlot: "daniel_karen", special: false } }),
            // c's stored rabbiSlot is kept; only the unset fields are filled.
            expect.objectContaining({ setlistId: "c", patch: { serviceType: "shabbat_morning", special: true } }),
        ])
        expect(docUpdate).not.toHaveBeenCalled()
    })

    it("a real run without force is refused", async () => {
        const r = (await backfillSetlistServiceClass("u", { dryRun: false }, "crc")) as {
            error?: { machine_code?: string }
        }
        expect(r.error?.machine_code).toBe("force_required")
        expect(docUpdate).not.toHaveBeenCalled()
    })

    it("a forced run updates setlists conditionally with only the unset fields", async () => {
        await backfillSetlistServiceClass("u", { dryRun: false, force: true }, "crc")
        expect(collectionName).toHaveBeenCalledWith("setlists")
        expect(collectionName).not.toHaveBeenCalledWith("library_index")
        expect(docUpdate.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "c"])
        const [, patch, precondition] = docUpdate.mock.calls.find((c) => c[0] === "c")!
        expect(Object.keys(patch as object).sort()).toEqual(["serviceType", "special"])
        expect(precondition).toEqual({ lastUpdateTime: "t-c" })
    })

    it("a setlist changed mid-run is counted, not fatal", async () => {
        docUpdate.mockImplementation(async (id: unknown) => {
            if (id === "a") throw Object.assign(new Error("precondition"), { code: 9 })
        })
        const r = (await backfillSetlistServiceClass("u", { dryRun: false, force: true }, "crc")) as Ok
        expect(r.ok).toBe(true)
        expect(r.changed.map((c) => c.setlistId)).toEqual(["c"])
        expect(r.skipped.changedDuringRun).toBe(1)
    })

    it("only reads the caller's org", async () => {
        const r = (await backfillSetlistServiceClass("u", {}, "brotherslazaroff")) as Ok
        expect(r.scanned).toBe(1)
        expect(r.changed.map((c) => c.setlistId)).toEqual(["d"])
        expect(mockAssertEditor).toHaveBeenCalledWith(expect.anything(), "u", "brotherslazaroff")
    })

    it("passes on a role refusal", async () => {
        mockAssertEditor.mockResolvedValueOnce({ ok: false, error: { machine_code: "forbidden_role" } } as never)
        const r = (await backfillSetlistServiceClass("u", {}, "crc")) as { error?: { machine_code?: string } }
        expect(r.error?.machine_code).toBe("forbidden_role")
    })
})
