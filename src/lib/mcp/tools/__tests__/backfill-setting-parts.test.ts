import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { id: string; data: Record<string, unknown> }
let ROWS: Row[] = []
const batchSet = vi.fn()
const batchCommit = vi.fn(async () => undefined)
const mockAssertEditor = vi.fn(async () => ({ ok: true }))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: vi.fn(() => ({
            get: async () => ({ docs: ROWS.map((r) => ({ id: r.id, data: () => r.data })) }),
            doc: (id: string) => ({ id }),
        })),
        batch: () => ({ set: batchSet, commit: batchCommit }),
    })),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: (...a: unknown[]) => mockAssertEditor(...(a as [])),
}))

import { backfillLibrarySettingParts } from "../backfill-setting-parts"

beforeEach(() => {
    vi.clearAllMocks()
    ROWS = [
        { id: "a", data: { orgId: "crc", name: "Barchu (Walkdown) Bb" } },
        { id: "b", data: { orgId: "crc", name: "Barchu (Friedman)", settingSource: "human", setting: "Mine" } },
        { id: "c", data: { name: "Hashkivenu", setting: null, part: null, partGroup: "hashkivenu" } },
        { id: "d", data: { orgId: "brotherslazaroff", name: "Wonderwall (Oasis)" } },
    ]
})

describe("backfillLibrarySettingParts", () => {
    it("dry run reports the changes and writes nothing", async () => {
        const r = await backfillLibrarySettingParts("u", {}, "crc")
        expect(r).toMatchObject({ ok: true, dryRun: true, scanned: 3, skippedHuman: 1 })
        const ok = r as { changed: Array<{ fileId: string; setting: string | null; part: string | null }> }
        expect(ok.changed).toEqual([
            expect.objectContaining({ fileId: "a", setting: "Walkdown", part: "Bb" }),
        ])
        expect(batchSet).not.toHaveBeenCalled()
    })

    it("a real run without force is refused", async () => {
        const r = (await backfillLibrarySettingParts("u", { dryRun: false }, "crc")) as {
            error?: { machine_code?: string }
        }
        expect(r.error?.machine_code).toBe("force_required")
        expect(batchSet).not.toHaveBeenCalled()
    })

    it("a forced run writes only the three fields, never a human row", async () => {
        await backfillLibrarySettingParts("u", { dryRun: false, force: true }, "crc")
        expect(batchSet).toHaveBeenCalledTimes(1)
        const [ref, patch, opts] = batchSet.mock.calls[0]
        expect(ref).toEqual({ id: "a" })
        expect(Object.keys(patch).sort()).toEqual(["part", "partGroup", "setting"])
        expect(opts).toEqual({ merge: true })
        expect(batchCommit).toHaveBeenCalledTimes(1)
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
