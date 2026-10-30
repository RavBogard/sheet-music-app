import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { id: string; data: Record<string, unknown> }
let ROWS: Row[] = []
const docUpdate = vi.fn(async (..._a: unknown[]) => undefined)
const mockAssertEditor = vi.fn(async () => ({ ok: true }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => ({
            get: async () => ({
                docs: ROWS.map((r) => ({ id: r.id, data: () => r.data, updateTime: `t-${r.id}` })),
            }),
            doc: (id: string) => ({ id, update: (...a: unknown[]) => docUpdate(id, ...a) }),
        })),
    })),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: (...a: unknown[]) => mockAssertEditor(...(a as [])),
}))

import { backfillLibrarySettingParts } from "../backfill-setting-parts"

beforeEach(() => {
    vi.clearAllMocks()
    docUpdate.mockReset()
    docUpdate.mockImplementation(async () => undefined)
    ROWS = [
        { id: "a", data: { orgId: "crc", name: "Barchu (Walkdown) Bb" } },
        { id: "b", data: { orgId: "crc", name: "Barchu (Friedman)", settingSource: "human", setting: "Mine" } },
        { id: "c", data: { name: "Hashkivenu", setting: null, part: null, partGroup: "hashkivenu" } },
        { id: "d", data: { orgId: "brotherslazaroff", name: "Wonderwall (Oasis)" } },
        { id: "e", data: { orgId: "crc", name: "Shema (Major) Bass" } },
    ]
})

describe("backfillLibrarySettingParts", () => {
    it("dry run reports the changes and writes nothing", async () => {
        const r = await backfillLibrarySettingParts("u", {}, "crc")
        expect(r).toMatchObject({ ok: true, dryRun: true, scanned: 4, skippedHuman: 1 })
        const ok = r as { changed: Array<{ fileId: string; setting: string | null; part: string | null }> }
        expect(ok.changed).toEqual([
            expect.objectContaining({ fileId: "a", setting: "Walkdown", part: "Bb" }),
            expect.objectContaining({ fileId: "e", setting: "Major", part: "Bass" }),
        ])
        expect(docUpdate).not.toHaveBeenCalled()
    })

    it("a real run without force is refused", async () => {
        const r = (await backfillLibrarySettingParts("u", { dryRun: false }, "crc")) as {
            error?: { machine_code?: string }
        }
        expect(r.error?.machine_code).toBe("force_required")
        expect(docUpdate).not.toHaveBeenCalled()
    })

    it("a forced run updates only the three fields, conditionally, never a human row", async () => {
        await backfillLibrarySettingParts("u", { dryRun: false, force: true }, "crc")
        expect(docUpdate.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "e"])
        const [, patch, precondition] = docUpdate.mock.calls.find((c) => c[0] === "a")!
        expect(Object.keys(patch as object).sort()).toEqual(["part", "partGroup", "setting"])
        expect(precondition).toEqual({ lastUpdateTime: "t-a" })
    })

    it("a row changed mid-run is counted, not fatal", async () => {
        docUpdate.mockImplementation(async (id: unknown) => {
            if (id === "a") throw Object.assign(new Error("precondition"), { code: 9 })
        })
        const r = (await backfillLibrarySettingParts("u", { dryRun: false, force: true }, "crc")) as {
            ok: boolean
            changed: Array<{ fileId: string }>
            skipped: { changedDuringRun: number }
        }
        expect(r.ok).toBe(true)
        expect(r.changed.map((c) => c.fileId)).toEqual(["e"])
        expect(r.skipped.changedDuringRun).toBe(1)
    })

    it("a row whose write fails is skipped and reported; the run keeps going", async () => {
        docUpdate.mockImplementation(async (id: unknown) => {
            if (id === "a") throw new Error("boom")
        })
        const r = (await backfillLibrarySettingParts("u", { dryRun: false, force: true }, "crc")) as {
            ok: boolean
            changed: Array<{ fileId: string }>
            failed: Array<{ id: string; message: string }>
        }
        expect(r.ok).toBe(true)
        expect(r.failed).toEqual([{ id: "a", message: "boom" }])
        expect(r.changed.map((c) => c.fileId)).toEqual(["e"])
        expect(docUpdate.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "e"])
    })

    it("failed is empty when every write lands", async () => {
        const r = (await backfillLibrarySettingParts("u", { dryRun: false, force: true }, "crc")) as {
            failed: unknown[]
        }
        expect(r.failed).toEqual([])
    })

    it("only reads the caller's org", async () => {
        const r = (await backfillLibrarySettingParts("u", {}, "brotherslazaroff")) as {
            scanned: number
            changed: Array<{ fileId: string }>
        }
        expect(r.scanned).toBe(1)
        expect(r.changed.map((c) => c.fileId)).toEqual(["d"])
        expect(mockAssertEditor).toHaveBeenCalledWith(expect.anything(), "u", "brotherslazaroff")
    })

    it("passes on a role refusal", async () => {
        mockAssertEditor.mockResolvedValueOnce({
            ok: false,
            error: { machine_code: "forbidden_role" },
        } as never)
        const r = (await backfillLibrarySettingParts("u", {}, "crc")) as { error?: { machine_code?: string } }
        expect(r.error?.machine_code).toBe("forbidden_role")
    })
})
