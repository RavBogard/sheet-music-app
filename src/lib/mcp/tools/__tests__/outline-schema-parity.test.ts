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

/**
 * Why these assertions look the way they do.
 *
 * The first version of this file asserted `safeParse(SAMPLE).success === true`
 * on every schema — and proved NOTHING. Zod's default mode STRIPS unknown keys
 * and returns `success: true`, so deleting `...outlineFields` from every write
 * schema left this suite 10/10 green while every page number, performer cue and
 * honoree name silently vanished from every write surface. `bulkTrackPatchSchema`
 * was worse still: it is `.passthrough()`, so its assertion was unconditionally
 * true no matter what the schema declared.
 *
 * A guard that cannot fail is worse than no guard, so each surface is now
 * checked two ways:
 *
 *  1. ROUND-TRIP — the parsed OUTPUT must still contain the fields. This is what
 *     catches a strip-mode schema that lost `...outlineFields`.
 *  2. DECLARED — for each outline field, a value that is invalid *under that
 *     field's own schema* must be REJECTED. A schema that no longer declares the
 *     field strips it (or, under passthrough, waves it through) and reports
 *     success. This is the only check that can fail for the passthrough schema.
 */

const SAMPLE = {
    performer: "Congregation",
    description: "Read responsively.",
    estimatedMinutes: 3,
    liturgyRef: { book: "crc-friday", folio: 4 },
    honors: [{ name: "Rachel Cohen", note: "birthday" }],
}

/** Per-field values that are invalid under the field's declared schema. */
const INVALID: Record<keyof typeof SAMPLE, unknown> = {
    performer: 42, // not a string
    description: 42, // not a string
    estimatedMinutes: -1, // below min(0)
    liturgyRef: { book: "crc-friday" }, // folio missing
    honors: [{ note: "birthday" }], // name missing
}

const OUTLINE_FIELD_NAMES = Object.keys(SAMPLE) as Array<keyof typeof SAMPLE>

type Parsed = { success: boolean; data?: unknown }
type Parse = (input: Record<string, unknown>) => Parsed

/**
 * The EXACT exported schema objects `registerWriteTools` registers — not
 * lookalikes — so an accidental field drop at any of the five call sites fails
 * here. Each surface's own required fields are merged in by the wrapper.
 */
const SURFACES: Array<{ name: string; parse: Parse }> = [
    {
        name: "update_track",
        parse: (i) => updateTrackPatchSchema.safeParse(i),
    },
    {
        name: "bulk_update_tracks",
        parse: (i) => bulkTrackPatchSchema.safeParse(i),
    },
    {
        name: "add_track_to_setlist",
        parse: (i) =>
            z.object(addTrackToSetlistFields).safeParse({ setlistId: "setlist-1", ...i }),
    },
    {
        name: "bulk_add_tracks",
        parse: (i) => bulkAddTrackRowSchema.safeParse(i),
    },
    {
        name: "propose_setlist_changes",
        parse: (i) => proposeChangeProposalSchema.safeParse({ action: "update", ...i }),
    },
]

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

    it("the parity matrix covers exactly the exported outline fields", () => {
        expect([...OUTLINE_FIELD_NAMES].sort()).toEqual(Object.keys(outlineFields).sort())
    })

    it("every outline field is a Zod schema, so spreading into an inputSchema is valid", () => {
        for (const [, schema] of Object.entries(outlineFields)) {
            expect(schema instanceof z.ZodType).toBe(true)
        }
    })
})

describe.each(SURFACES)("$name", ({ parse }) => {
    it("returns every outline field in the PARSED OUTPUT (not merely success: true)", () => {
        const res = parse(SAMPLE)
        expect(res.success).toBe(true)
        // toMatchObject on `.data`, never `.success`: a stripped field is still
        // a successful parse, so only the output proves the field survived.
        expect(res.data).toMatchObject(SAMPLE)
    })

    it.each(OUTLINE_FIELD_NAMES)(
        "declares %s — an invalid value is REJECTED, not stripped or passed through",
        (field) => {
            const res = parse({ [field]: INVALID[field] })
            expect(res.success).toBe(false)
        },
    )
})

describe("outline field validation rules", () => {
    it("rejects a liturgyRef missing its folio", () => {
        expect(updateTrackPatchSchema.safeParse({ liturgyRef: { book: "crc-friday" } }).success).toBe(false)
    })

    it("rejects a non-integer folio and a negative estimatedMinutes", () => {
        expect(updateTrackPatchSchema.safeParse({ liturgyRef: { book: "x", folio: 1.5 } }).success).toBe(false)
        expect(updateTrackPatchSchema.safeParse({ estimatedMinutes: -1 }).success).toBe(false)
    })

    it("rejects an honor with no name", () => {
        expect(updateTrackPatchSchema.safeParse({ honors: [{ note: "birthday" }] }).success).toBe(false)
    })
})
