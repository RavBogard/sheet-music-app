/**
 * Cowork #9 (cowork-2026-05-22) — pure tests for the list_library enrichment
 * backlog tally. `computeEnrichmentCoverage` is pure (rows in, counts out) so
 * it tests without the emulator. The end-to-end list_library wiring is covered
 * in `mcp-list-library.emulator.test.ts`.
 */
import { describe, expect, it } from "vitest"

import { computeEnrichmentCoverage } from "../tools/library"

const row = (enrichmentStatus: string | null) =>
    ({ enrichmentStatus }) as Parameters<typeof computeEnrichmentCoverage>[0][number]

describe("computeEnrichmentCoverage (cowork #9)", () => {
    it("tallies every status bucket", () => {
        const cov = computeEnrichmentCoverage([
            row("pending"),
            row("review_pending"),
            row("enriched"),
            row("failed"),
            row("human_curated"),
            row("human_rejected"),
            row(null),
        ])
        expect(cov.byStatus).toEqual({
            pending: 1,
            review_pending: 1,
            enriched: 1,
            failed: 1,
            human_curated: 1,
            human_rejected: 1,
            unenriched: 1,
        })
    })

    it("pendingEnrichmentCount sums pending + review_pending + failed + unenriched", () => {
        const cov = computeEnrichmentCoverage([
            row("pending"),
            row("pending"),
            row("review_pending"),
            row("failed"),
            row(null),
            row(null),
            // settled rows do NOT count toward the backlog
            row("enriched"),
            row("human_curated"),
            row("human_rejected"),
        ])
        // 2 pending + 1 review_pending + 1 failed + 2 unenriched = 6
        expect(cov.pendingEnrichmentCount).toBe(6)
    })

    it("empty input → all zeros", () => {
        const cov = computeEnrichmentCoverage([])
        expect(cov.pendingEnrichmentCount).toBe(0)
        expect(cov.byStatus.unenriched).toBe(0)
    })

    it("treats undefined enrichmentStatus as unenriched (defensive)", () => {
        const cov = computeEnrichmentCoverage([
            { enrichmentStatus: undefined } as Parameters<
                typeof computeEnrichmentCoverage
            >[0][number],
        ])
        expect(cov.byStatus.unenriched).toBe(1)
        expect(cov.pendingEnrichmentCount).toBe(1)
    })
})
