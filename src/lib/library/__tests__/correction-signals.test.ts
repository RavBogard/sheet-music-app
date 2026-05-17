/**
 * Cycle-3 c3 — correction-signal unit tests.
 *
 * Pure tests for:
 *  - `CorrectionSignalInputSchema` / `CorrectionSignalSchema` Zod shape.
 *  - `aggregateCorrectionSignals` counter correctness over an in-memory
 *    fake Firestore (no emulator needed for the deterministic math).
 *
 * The emulator-driven flow (emit-from-review-queue + admin gate + cron)
 * lives in `correction-signals.emulator.test.ts`.
 */

import { describe, expect, it } from "vitest"

import {
    CORRECTION_ACTIONS,
    CorrectionSignalInputSchema,
    CorrectionSignalSchema,
    aggregateCorrectionSignals,
    type CorrectionSignal,
} from "../correction-signals"

// ─── Fake Firestore (just what the aggregator touches) ────────────────────

function makeFakeDb(docs: CorrectionSignal[]) {
    const sorted = [...docs].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
    )
    const collectionImpl = (name: string) => {
        if (name !== "aiCorrectionSignals") {
            throw new Error(`fake-db: unexpected collection ${name}`)
        }
        const state = {
            since: null as string | null,
            until: null as string | null,
            limit: 5000,
        }
        const query: {
            where: (f: string, op: string, v: string) => typeof query
            orderBy: (f: string, d: string) => typeof query
            limit: (n: number) => typeof query
            get: () => Promise<{
                size: number
                docs: Array<{ id: string; data: () => CorrectionSignal }>
            }>
        } = {
            where(field, op, value) {
                if (field === "timestamp") {
                    if (op === ">=") state.since = value
                    if (op === "<") state.until = value
                }
                return query
            },
            orderBy() {
                return query
            },
            limit(n) {
                state.limit = n
                return query
            },
            async get() {
                let out = sorted
                if (state.since)
                    out = out.filter((d) => d.timestamp >= state.since!)
                if (state.until)
                    out = out.filter((d) => d.timestamp < state.until!)
                const sliced = out.slice(0, state.limit)
                return {
                    size: sliced.length,
                    docs: sliced.map((d) => ({
                        id: d.signalId,
                        data: () => d,
                    })),
                }
            },
        }
        return query
    }
    return { collection: collectionImpl } as unknown as Parameters<
        typeof aggregateCorrectionSignals
    >[0]
}

function makeSignal(
    overrides: Partial<CorrectionSignal> = {},
): CorrectionSignal {
    return {
        signalId: `signal-${Math.random().toString(36).slice(2)}`,
        rowId: "upload-shalom-rav-1",
        uid: "rabbi-daniel",
        action: "accept",
        beforeState: {
            enrichmentStatus: "review_pending",
            confidence: 0.85,
            aiSuggestion: {
                collection_disagrees_with_folder: false,
            },
            reviewTriggers: ["low_confidence"],
        },
        afterState: { enrichmentStatus: "enriched" },
        fieldsChanged: [],
        fieldsAccepted: ["key", "tags"],
        timestamp: "2026-05-18T18:00:00.000Z",
        ...overrides,
    }
}

// ─── Schema ───────────────────────────────────────────────────────────────

describe("CorrectionSignalInputSchema", () => {
    it("accepts a minimal happy-path input", () => {
        const r = CorrectionSignalInputSchema.safeParse({
            rowId: "x",
            uid: "y",
            action: "accept",
            beforeState: {
                enrichmentStatus: "review_pending",
                confidence: 0.9,
                aiSuggestion: { foo: "bar" },
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "enriched" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(true)
    })

    it("rejects empty rowId / uid", () => {
        const r = CorrectionSignalInputSchema.safeParse({
            rowId: "",
            uid: "",
            action: "accept",
            beforeState: {
                enrichmentStatus: "x",
                confidence: null,
                aiSuggestion: null,
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "x" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(false)
    })

    it("rejects unknown action verbs", () => {
        const r = CorrectionSignalInputSchema.safeParse({
            rowId: "x",
            uid: "y",
            action: "delete-everything",
            beforeState: {
                enrichmentStatus: "x",
                confidence: null,
                aiSuggestion: null,
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "x" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(false)
    })

    it.each(CORRECTION_ACTIONS)("accepts action=%s", (action) => {
        const r = CorrectionSignalInputSchema.safeParse({
            rowId: "x",
            uid: "y",
            action,
            beforeState: {
                enrichmentStatus: "x",
                confidence: null,
                aiSuggestion: null,
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "x" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(true)
    })

    it("accepts null confidence + null aiSuggestion (retry-on-import path)", () => {
        const r = CorrectionSignalInputSchema.safeParse({
            rowId: "drive-file-1",
            uid: "rabbi-daniel",
            action: "retry",
            beforeState: {
                enrichmentStatus: "import_drive_404",
                confidence: null,
                aiSuggestion: null,
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "deleted_for_retry" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(true)
    })
})

describe("CorrectionSignalSchema (persisted shape)", () => {
    it("requires signalId + timestamp", () => {
        const r = CorrectionSignalSchema.safeParse({
            rowId: "x",
            uid: "y",
            action: "accept",
            beforeState: {
                enrichmentStatus: "x",
                confidence: null,
                aiSuggestion: null,
                reviewTriggers: [],
            },
            afterState: { enrichmentStatus: "x" },
            fieldsChanged: [],
            fieldsAccepted: [],
        })
        expect(r.success).toBe(false)
    })
})

// ─── Aggregator ───────────────────────────────────────────────────────────

describe("aggregateCorrectionSignals", () => {
    it("returns zero-counters shape when collection is empty", async () => {
        const db = makeFakeDb([])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.totalSignals).toBe(0)
        expect(stats.actionDistribution).toEqual({
            accept: 0,
            reject: 0,
            edit: 0,
            retry: 0,
            dismiss: 0,
        })
        expect(stats.collectionMismatchAcceptanceRate.rate).toBeNull()
        expect(stats.editFieldFrequency).toEqual({})
        expect(stats.rejectionTriggerAttribution).toEqual({})
        for (const a of CORRECTION_ACTIONS) {
            expect(stats.confidenceDistributionByAction[a]).toEqual({
                count: 0,
                mean: null,
                p50: null,
                p90: null,
            })
        }
        expect(stats.truncated).toBe(false)
        expect(typeof stats.computedAt).toBe("string")
    })

    it("counts actions per action verb", async () => {
        const db = makeFakeDb([
            makeSignal({ signalId: "s1", action: "accept" }),
            makeSignal({ signalId: "s2", action: "accept" }),
            makeSignal({ signalId: "s3", action: "reject" }),
            makeSignal({ signalId: "s4", action: "edit" }),
            makeSignal({ signalId: "s5", action: "edit" }),
            makeSignal({ signalId: "s6", action: "retry" }),
            makeSignal({ signalId: "s7", action: "dismiss" }),
        ])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.totalSignals).toBe(7)
        expect(stats.actionDistribution).toEqual({
            accept: 2,
            reject: 1,
            edit: 2,
            retry: 1,
            dismiss: 1,
        })
    })

    it("computes confidence mean/p50/p90 per action", async () => {
        // Ten signals on action=accept with confidence 0.1..1.0.
        const docs = Array.from({ length: 10 }, (_, i) =>
            makeSignal({
                signalId: `s-${i}`,
                action: "accept",
                beforeState: {
                    enrichmentStatus: "review_pending",
                    confidence: (i + 1) / 10,
                    aiSuggestion: { collection_disagrees_with_folder: false },
                    reviewTriggers: [],
                },
            }),
        )
        const db = makeFakeDb(docs)
        const stats = await aggregateCorrectionSignals(db)
        const acceptCD = stats.confidenceDistributionByAction.accept
        expect(acceptCD.count).toBe(10)
        // Mean of 0.1..1.0 = 0.55.
        expect(acceptCD.mean).toBeCloseTo(0.55, 4)
        // p50 of a 10-element sorted [0.1..1.0] with linear interpolation
        // at index (10-1)*0.5 = 4.5 → midpoint of 0.5 and 0.6 = 0.55.
        expect(acceptCD.p50).toBeCloseTo(0.55, 4)
        // p90 at index 8.1 → 0.9 + 0.1*(1.0-0.9) = 0.91.
        expect(acceptCD.p90).toBeCloseTo(0.91, 4)
    })

    it("skips null confidence when computing per-action stats", async () => {
        const db = makeFakeDb([
            makeSignal({
                signalId: "with-conf",
                action: "retry",
                beforeState: {
                    enrichmentStatus: "failed",
                    confidence: 0.5,
                    aiSuggestion: null,
                    reviewTriggers: [],
                },
            }),
            makeSignal({
                signalId: "no-conf",
                action: "retry",
                beforeState: {
                    enrichmentStatus: "failed",
                    confidence: null,
                    aiSuggestion: null,
                    reviewTriggers: [],
                },
            }),
        ])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.confidenceDistributionByAction.retry.count).toBe(1)
        expect(stats.confidenceDistributionByAction.retry.mean).toBe(0.5)
    })

    it("computes collection-mismatch acceptance rate", async () => {
        const flaggedAccepted = makeSignal({
            signalId: "fa",
            action: "accept",
            beforeState: {
                enrichmentStatus: "review_pending",
                confidence: 0.9,
                aiSuggestion: { collection_disagrees_with_folder: true },
                reviewTriggers: ["collection_disagrees_with_folder"],
            },
        })
        const flaggedRejected = makeSignal({
            signalId: "fr",
            action: "reject",
            beforeState: {
                enrichmentStatus: "review_pending",
                confidence: 0.8,
                aiSuggestion: { collection_disagrees_with_folder: true },
                reviewTriggers: ["collection_disagrees_with_folder"],
            },
        })
        const unflaggedAccepted = makeSignal({
            signalId: "ua",
            action: "accept",
            beforeState: {
                enrichmentStatus: "review_pending",
                confidence: 0.95,
                aiSuggestion: { collection_disagrees_with_folder: false },
                reviewTriggers: [],
            },
        })
        const db = makeFakeDb([
            flaggedAccepted,
            flaggedRejected,
            unflaggedAccepted,
        ])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.collectionMismatchAcceptanceRate.flaggedTotal).toBe(2)
        expect(stats.collectionMismatchAcceptanceRate.acceptedCount).toBe(1)
        expect(stats.collectionMismatchAcceptanceRate.rate).toBe(0.5)
    })

    it("counts edit-field frequency from edit signals only", async () => {
        const db = makeFakeDb([
            makeSignal({
                signalId: "e1",
                action: "edit",
                fieldsChanged: ["title", "key"],
            }),
            makeSignal({
                signalId: "e2",
                action: "edit",
                fieldsChanged: ["title", "tags"],
            }),
            // Non-edit signals never contribute to editFieldFrequency, even
            // if their fieldsChanged happens to be populated for any reason.
            makeSignal({
                signalId: "a1",
                action: "accept",
                fieldsChanged: ["title"],
            }),
        ])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.editFieldFrequency).toEqual({ title: 2, key: 1, tags: 1 })
    })

    it("attributes rejection triggers from reject + dismiss signals", async () => {
        const db = makeFakeDb([
            makeSignal({
                signalId: "r1",
                action: "reject",
                beforeState: {
                    enrichmentStatus: "review_pending",
                    confidence: 0.3,
                    aiSuggestion: { collection_disagrees_with_folder: false },
                    reviewTriggers: ["low_confidence", "is_chart_false"],
                },
            }),
            makeSignal({
                signalId: "d1",
                action: "dismiss",
                beforeState: {
                    enrichmentStatus: "failed",
                    confidence: null,
                    aiSuggestion: null,
                    reviewTriggers: ["low_confidence"],
                },
            }),
            // accept signals MUST NOT contribute to rejection attribution.
            makeSignal({
                signalId: "a1",
                action: "accept",
                beforeState: {
                    enrichmentStatus: "review_pending",
                    confidence: 0.9,
                    aiSuggestion: { collection_disagrees_with_folder: false },
                    reviewTriggers: ["low_confidence"],
                },
            }),
        ])
        const stats = await aggregateCorrectionSignals(db)
        expect(stats.rejectionTriggerAttribution).toEqual({
            low_confidence: 2,
            is_chart_false: 1,
        })
    })

    it("respects since/until window", async () => {
        const db = makeFakeDb([
            makeSignal({
                signalId: "early",
                action: "accept",
                timestamp: "2026-04-01T00:00:00.000Z",
            }),
            makeSignal({
                signalId: "mid",
                action: "reject",
                timestamp: "2026-05-15T00:00:00.000Z",
            }),
            makeSignal({
                signalId: "late",
                action: "edit",
                timestamp: "2026-06-15T00:00:00.000Z",
            }),
        ])
        const stats = await aggregateCorrectionSignals(db, {
            since: "2026-05-01T00:00:00Z",
            until: "2026-06-01T00:00:00Z",
        })
        expect(stats.totalSignals).toBe(1)
        expect(stats.actionDistribution.reject).toBe(1)
        expect(stats.actionDistribution.accept).toBe(0)
        expect(stats.since).toBe("2026-05-01T00:00:00Z")
        expect(stats.until).toBe("2026-06-01T00:00:00Z")
    })

    it("flags truncated when scan limit is hit", async () => {
        const docs = Array.from({ length: 12 }, (_, i) =>
            makeSignal({
                signalId: `s-${i}`,
                timestamp: `2026-05-18T18:00:0${i}.000Z`,
            }),
        )
        const db = makeFakeDb(docs)
        const stats = await aggregateCorrectionSignals(db, { limit: 10 })
        expect(stats.totalSignals).toBe(10)
        expect(stats.truncated).toBe(true)
    })
})
