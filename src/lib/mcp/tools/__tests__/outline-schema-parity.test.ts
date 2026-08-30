import { describe, it, expect } from "vitest"
import { z } from "zod"
import {
    outlineFields,
    updateTrackPatchSchema,
    bulkTrackPatchSchema,
    addTrackToSetlistFields,
    bulkAddTrackRowSchema,
    proposeChangeProposalSchema,
} from "../index"

const SAMPLE = {
    performer: "Congregation",
    description: "Read responsively.",
    estimatedMinutes: 3,
    liturgyRef: { book: "crc-friday", folio: 4 },
    honors: [{ name: "Rachel Cohen", note: "birthday" }],
}

describe("outline field parity across write schemas", () => {
    it("exports every outline field", () => {
        expect(Object.keys(outlineFields).sort()).toEqual([
            "description",
            "estimatedMinutes",
            "honors",
            "liturgyRef",
            "performer",
        ])
    })

    it("update_track's patch schema accepts the full outline field set", () => {
        expect(updateTrackPatchSchema.safeParse(SAMPLE).success).toBe(true)
    })

    it("bulk_update_tracks' patch schema accepts the full outline field set", () => {
        expect(bulkTrackPatchSchema.safeParse(SAMPLE).success).toBe(true)
    })

    // Fix round 2 (Task 6): these three exercise the EXACT exported schema
    // objects `registerWriteTools` registers for add_track_to_setlist,
    // bulk_add_tracks and propose_setlist_changes (via `trackRowFields`) —
    // not lookalikes. The first pass at this test only covered
    // update_track/bulk_update_tracks; a future accidental removal of
    // `...trackRowFields` from one of these three call sites would have
    // gone uncaught.
    it("add_track_to_setlist's fields accept the full outline field set", () => {
        expect(
            z.object(addTrackToSetlistFields).safeParse({ ...SAMPLE, setlistId: "setlist-1" }).success,
        ).toBe(true)
    })

    it("bulk_add_tracks' row schema accepts the full outline field set", () => {
        expect(bulkAddTrackRowSchema.safeParse(SAMPLE).success).toBe(true)
    })

    it("propose_setlist_changes' proposal schema accepts the full outline field set", () => {
        expect(proposeChangeProposalSchema.safeParse({ ...SAMPLE, action: "update" }).success).toBe(true)
    })

    it("rejects a liturgyRef missing its folio", () => {
        const bad = { liturgyRef: { book: "crc-friday" } }
        expect(updateTrackPatchSchema.safeParse(bad).success).toBe(false)
    })

    it("rejects a non-integer folio and a negative estimatedMinutes", () => {
        expect(updateTrackPatchSchema.safeParse({ liturgyRef: { book: "x", folio: 1.5 } }).success).toBe(false)
        expect(updateTrackPatchSchema.safeParse({ estimatedMinutes: -1 }).success).toBe(false)
    })

    it("rejects an honor with no name", () => {
        expect(updateTrackPatchSchema.safeParse({ honors: [{ note: "birthday" }] }).success).toBe(false)
    })

    it("every outline field is a Zod schema, so spreading into an inputSchema is valid", () => {
        for (const [, schema] of Object.entries(outlineFields)) {
            expect(schema instanceof z.ZodType).toBe(true)
        }
    })
})
