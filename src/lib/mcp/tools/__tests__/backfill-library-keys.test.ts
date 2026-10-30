import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { id: string; data: Record<string, unknown> }
let ROWS: Row[] = []
let ROLE = "admin"
const batchSet = vi.fn()
const batchCommit = vi.fn(async () => undefined)

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
const mockReadTenantRole = vi.fn(async () => ROLE)
vi.mock("@/lib/org/access", () => ({
    readTenantRole: (...a: unknown[]) => mockReadTenantRole(...(a as [])),
}))

import { backfillLibraryKeys } from "../backfill-library-keys"

function sug(key: string | null, confidence: number) {
    return { suggested_key: key, confidence }
}

beforeEach(() => {
    vi.clearAllMocks()
    ROLE = "admin"
    ROWS = [
        { id: "good", data: { orgId: "crc", name: "Sim Shalom", key: "", aiSuggestion: sug("Dm", 0.95) } },
        { id: "low", data: { orgId: "crc", name: "Shalom Rav", aiSuggestion: sug("F", 0.85) } },
        { id: "human", data: { orgId: "crc", name: "Hodu", enrichmentStatus: "human_curated", aiSuggestion: sug("G", 0.99) } },
        { id: "keyed", data: { name: "Barchu", key: "Em", aiSuggestion: sug("Dm", 0.99) } },
        { id: "none", data: { orgId: "crc", name: "Oseh Shalom", aiSuggestion: sug(null, 0.99) } },
        { id: "bl", data: { orgId: "brotherslazaroff", name: "Wonderwall", aiSuggestion: sug("F#m", 0.97) } },
    ]
})

function code(r: unknown): string | undefined {
    return (r as { error?: { machine_code?: string } }).error?.machine_code
}

describe("backfillLibraryKeys", () => {
    it("reports high-confidence keys and counts each skip", async () => {
        const r = await backfillLibraryKeys("u", {}, "crc")
        expect(r).toMatchObject({
            ok: true,
            dryRun: true,
            scanned: 5,
            changed: [{ fileId: "good", key: "Dm", confidence: 0.95 }],
            skipped: { human: 1, lowConfidence: 1, noSuggestion: 1, hasKey: 1 },
        })
        expect(batchSet).not.toHaveBeenCalled()
    })

    it("clamps minConfidence to the 0.9 floor", async () => {
        const r = (await backfillLibraryKeys("u", { minConfidence: 0.5 }, "crc")) as {
            changed: Array<{ fileId: string }>
            skipped: { lowConfidence: number }
        }
        expect(r.changed.map((c) => c.fileId)).toEqual(["good"])
        expect(r.skipped.lowConfidence).toBe(1)
    })

    it("can raise the floor", async () => {
        const r = (await backfillLibraryKeys("u", { minConfidence: 0.96 }, "crc")) as {
            changed: unknown[]
            skipped: { lowConfidence: number }
        }
        expect(r.changed).toEqual([])
        expect(r.skipped.lowConfidence).toBe(2)
    })

    it("refuses a real run without force", async () => {
        expect(code(await backfillLibraryKeys("u", { dryRun: false }, "crc"))).toBe("force_required")
        expect(batchSet).not.toHaveBeenCalled()
    })

    it("a forced run writes key and keySource only", async () => {
        await backfillLibraryKeys("u", { dryRun: false, force: true }, "crc")
        expect(batchSet).toHaveBeenCalledTimes(1)
        expect(batchSet).toHaveBeenCalledWith({ id: "good" }, { key: "Dm", keySource: "ai_backfill" }, { merge: true })
    })

    it("only reads the caller's org", async () => {
        const r = (await backfillLibraryKeys("u", {}, "brotherslazaroff")) as {
            scanned: number
            changed: Array<{ fileId: string }>
        }
        expect(r.scanned).toBe(1)
        expect(r.changed.map((c) => c.fileId)).toEqual(["bl"])
        expect(mockReadTenantRole).toHaveBeenCalledWith(expect.anything(), "u", "brotherslazaroff")
    })

    it("allows a band leader", async () => {
        ROLE = "band_leader"
        expect((await backfillLibraryKeys("u", {}, "crc")) as { ok: boolean }).toMatchObject({ ok: true })
    })

    it("refuses a musician", async () => {
        ROLE = "musician"
        expect(code(await backfillLibraryKeys("u", {}, "crc"))).toBe("forbidden_role")
    })
})
