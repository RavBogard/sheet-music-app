/**
 * PGR-04 — pure-helper unit tests (no emulator):
 *  - estimateEnrichmentCostUsd: input/output token pricing math
 *  - exceedsInlineInputCap: only inline-binary paths gate on the byte cap
 *  - rollupSpend: trailing-window aggregation + per-model breakdown
 */
import { describe, expect, it } from "vitest"

import {
    estimateEnrichmentCostUsd,
    exceedsInlineInputCap,
} from "../ai-enrichment"
import { rollupSpend, type SpendDoc } from "@/lib/mcp/tools/ai-spend-summary"

const MB = 1024 * 1024

describe("PGR-04 estimateEnrichmentCostUsd", () => {
    it("prices prompt at input rate + remainder at output rate", () => {
        // 1000 prompt @ $1.25/1M + 200 output @ $10/1M.
        expect(
            estimateEnrichmentCostUsd({
                promptTokenCount: 1000,
                candidatesTokenCount: 200,
                totalTokenCount: 1200,
            }),
        ).toBeCloseTo(0.00325, 10)
    })

    it("bills thought tokens hidden in the total-minus-prompt remainder", () => {
        // candidates reports 200 but total is 1700 → 500 reasoning tokens are
        // not in candidatesTokenCount. Output billed = max(200, 1700-1000) =
        // 700. 1000 prompt @1.25 = 0.00125; 700 output @10 = 0.007 → 0.00825.
        expect(
            estimateEnrichmentCostUsd({
                promptTokenCount: 1000,
                candidatesTokenCount: 200,
                totalTokenCount: 1700,
            }),
        ).toBeCloseTo(0.00825, 10)
    })

    it("returns 0 for null / undefined usage", () => {
        expect(estimateEnrichmentCostUsd(null)).toBe(0)
        expect(estimateEnrichmentCostUsd(undefined)).toBe(0)
    })
})

describe("PGR-04 exceedsInlineInputCap", () => {
    it("caps oversized PDF inline input", () => {
        expect(exceedsInlineInputCap("application/pdf", 11 * MB)).toBe(true)
        expect(exceedsInlineInputCap("application/pdf", 9 * MB)).toBe(false)
    })

    it("caps oversized supported-image inline input", () => {
        expect(exceedsInlineInputCap("image/jpeg", 11 * MB)).toBe(true)
        expect(exceedsInlineInputCap("image/png", 1 * MB)).toBe(false)
    })

    it("never caps text / xml / unsupported mimes (not inlined as binary)", () => {
        // These go through the truncated-text or metadata-only path.
        expect(exceedsInlineInputCap("text/plain", 50 * MB)).toBe(false)
        expect(exceedsInlineInputCap("application/xml", 50 * MB)).toBe(false)
        expect(exceedsInlineInputCap("image/heic", 50 * MB)).toBe(false)
        expect(
            exceedsInlineInputCap("application/octet-stream", 50 * MB),
        ).toBe(false)
    })
})

describe("PGR-04 rollupSpend", () => {
    const now = Date.parse("2026-05-21T12:00:00Z")
    const daysAgo = (n: number) =>
        new Date(now - n * 24 * 60 * 60 * 1000).toISOString()

    const docs: SpendDoc[] = [
        { model: "gemini-3.1-pro-preview", totalTokens: 100, costUsd: 0.001, ts: daysAgo(1) },
        { model: "gemini-3.1-pro-preview", totalTokens: 200, costUsd: 0.002, ts: daysAgo(5) },
        { model: "gemini-3.1-pro-preview", totalTokens: 400, costUsd: 0.004, ts: daysAgo(20) },
        { model: "other-model", totalTokens: 50, costUsd: 0.0005, ts: daysAgo(2) },
    ]

    it("7-day window excludes docs older than 7d", () => {
        const w = rollupSpend(docs, 7, now)
        // 1d + 5d + 2d included; 20d excluded.
        expect(w.sampleCount).toBe(3)
        expect(w.totalTokens).toBe(350)
        expect(w.totalCostUsd).toBeCloseTo(0.0035, 10)
        expect(w.sinceDays).toBe(7)
    })

    it("30-day window includes all four + breaks down per model", () => {
        const w = rollupSpend(docs, 30, now)
        expect(w.sampleCount).toBe(4)
        expect(w.totalTokens).toBe(750)
        expect(w.byModel["gemini-3.1-pro-preview"].sampleCount).toBe(3)
        expect(w.byModel["gemini-3.1-pro-preview"].totalTokens).toBe(700)
        expect(w.byModel["other-model"].sampleCount).toBe(1)
    })

    it("ignores malformed docs (missing ts, non-numeric fields)", () => {
        const messy: SpendDoc[] = [
            { ts: daysAgo(1), totalTokens: 100, costUsd: 0.001 },
            { totalTokens: 999 }, // no ts → skipped
            { ts: daysAgo(1), totalTokens: undefined, costUsd: undefined }, // counted, zero
        ]
        const w = rollupSpend(messy, 7, now)
        expect(w.sampleCount).toBe(2)
        expect(w.totalTokens).toBe(100)
        expect(w.totalCostUsd).toBeCloseTo(0.001, 10)
    })

    it("empty input → zeroed window", () => {
        const w = rollupSpend([], 7, now)
        expect(w.sampleCount).toBe(0)
        expect(w.totalTokens).toBe(0)
        expect(w.totalCostUsd).toBe(0)
        expect(w.byModel).toEqual({})
    })
})
