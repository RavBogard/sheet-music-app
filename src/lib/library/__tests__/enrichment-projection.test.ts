/**
 * Cowork #9 (cowork-2026-05-22) — pure tests for the enrichment projection,
 * focused on the new `enrichmentRanAt` age/lag signal surfaced on every
 * library read tool (get_song / search_library / list_library / get_chart_status).
 *
 * `projectionFromLibraryIndexData` is pure (data blob + retryQueued boolean
 * in, projection out) so it tests without the emulator. The emulator-driven
 * read-tool integration lives in `mcp-enrichment-projection.emulator.test.ts`.
 */
import { describe, expect, it } from "vitest"

import {
    EMPTY_ENRICHMENT_PROJECTION,
    projectionFromLibraryIndexData,
} from "../enrichment-projection"

describe("projectionFromLibraryIndexData — enrichmentRanAt (cowork #9)", () => {
    it("surfaces enrichmentRanAt when the row carries one", () => {
        const ranAt = "2026-05-22T18:00:00.000Z"
        const p = projectionFromLibraryIndexData(
            { enrichmentStatus: "enriched", enrichmentRanAt: ranAt },
            false,
        )
        expect(p.enrichmentRanAt).toBe(ranAt)
        expect(p.enrichmentStatus).toBe("enriched")
    })

    it("enrichmentRanAt is null when the field is absent (pre-enrichment rows)", () => {
        const p = projectionFromLibraryIndexData(
            { enrichmentStatus: "pending" },
            false,
        )
        expect(p.enrichmentRanAt).toBeNull()
    })

    it("enrichmentRanAt is null when the field is not a string", () => {
        const p = projectionFromLibraryIndexData(
            { enrichmentStatus: "enriched", enrichmentRanAt: 1716400800000 },
            false,
        )
        expect(p.enrichmentRanAt).toBeNull()
    })

    it("null data → empty projection carries enrichmentRanAt: null", () => {
        const p = projectionFromLibraryIndexData(null, false)
        expect(p.enrichmentRanAt).toBeNull()
        expect(p.retryQueued).toBe(false)
    })

    it("EMPTY_ENRICHMENT_PROJECTION includes enrichmentRanAt: null (wire shape)", () => {
        expect(EMPTY_ENRICHMENT_PROJECTION.enrichmentRanAt).toBeNull()
    })
})
