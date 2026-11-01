import { describe, it, expect, vi, beforeEach } from "vitest"

type Row = { id: string; data: Record<string, unknown> }
let ROWS: Row[] = []
let ROLE = "admin"
const docUpdate = vi.fn(async (..._a: unknown[]) => undefined)

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
const mockReadTenantRole = vi.fn(async () => ROLE)
vi.mock("@/lib/org/access", () => ({
    readMembershipRole: (...a: unknown[]) => mockReadTenantRole(...(a as [])),
}))

import { backfillLibraryKeys } from "../backfill-library-keys"

function sug(key: string | null, confidence: number, extra: Record<string, unknown> = {}) {
    return { suggested_key: key, confidence, is_chart: true, review_required: false, ...extra }
}

function row(id: string, data: Record<string, unknown>): Row {
    return { id, data: { orgId: "crc", name: id, ...data } }
}

beforeEach(() => {
    vi.clearAllMocks()
    ROLE = "admin"
    ROWS = [
        row("good", { key: "", aiSuggestion: sug("Dm", 0.95) }),
        row("low", { aiSuggestion: sug("F", 0.85) }),
        row("human", { enrichmentStatus: "human_curated", aiSuggestion: sug("G", 0.99) }),
        row("rejected", { enrichmentStatus: "human_rejected", aiSuggestion: sug("G", 0.99) }),
        row("pending", { enrichmentStatus: "review_pending", aiSuggestion: sug("G", 0.99) }),
        row("flagged", { aiSuggestion: sug("G", 0.99, { review_required: true }) }),
        row("notchart", { aiSuggestion: sug("G", 0.99, { is_chart: false }) }),
        row("badkey", { aiSuggestion: sug("G major", 0.99) }),
        { id: "keyed", data: { name: "Barchu", key: "Em", aiSuggestion: sug("Dm", 0.99) } },
        row("none", { aiSuggestion: sug(null, 0.99) }),
        { id: "bl", data: { orgId: "brotherslazaroff", name: "Wonderwall", aiSuggestion: sug("F#m", 0.97) } },
    ]
})

function code(r: unknown): string | undefined {
    return (r as { error?: { machine_code?: string } }).error?.machine_code
}

describe("backfillLibraryKeys", () => {
    it("reports high-confidence plain keys and counts each skip reason", async () => {
        const r = await backfillLibraryKeys("u", {}, "crc")
        expect(r).toMatchObject({
            ok: true,
            dryRun: true,
            scanned: 10,
            changed: [{ fileId: "good", key: "Dm", confidence: 0.95 }],
            skipped: {
                human: 1,
                rejected: 1,
                reviewHeld: 2,
                notChart: 1,
                badKey: 1,
                lowConfidence: 1,
                noSuggestion: 1,
                hasKey: 1,
                changedDuringRun: 0,
            },
        })
        expect(docUpdate).not.toHaveBeenCalled()
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
        expect(docUpdate).not.toHaveBeenCalled()
    })

    it("a forced run updates key and keySource only, conditionally", async () => {
        await backfillLibraryKeys("u", { dryRun: false, force: true }, "crc")
        expect(docUpdate).toHaveBeenCalledTimes(1)
        expect(docUpdate).toHaveBeenCalledWith(
            "good",
            { key: "Dm", keySource: "ai_backfill" },
            { lastUpdateTime: "t-good" },
        )
    })

    it("a row changed or deleted mid-run is counted, not fatal", async () => {
        docUpdate.mockRejectedValueOnce(Object.assign(new Error("not found"), { code: 5 }))
        const r = (await backfillLibraryKeys("u", { dryRun: false, force: true }, "crc")) as {
            ok: boolean
            changed: unknown[]
            skipped: { changedDuringRun: number }
        }
        expect(r.ok).toBe(true)
        expect(r.changed).toEqual([])
        expect(r.skipped.changedDuringRun).toBe(1)
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
