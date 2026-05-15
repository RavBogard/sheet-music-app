import { describe, expect, it } from "vitest"
import {
    eventDateSchema,
    bulkTrackPatchSchema,
    updateTrackPatchSchema,
} from "../tools"

/**
 * Schema-level regression tests for MCP tool input validation.
 *
 * F-9 — previously `update_setlist({ eventDate: "not-a-date" })` leaked the
 * raw Firestore SDK error `"Value for argument 'seconds' is not a valid
 * integer."` to the caller. The refine on `eventDateSchema` now catches it
 * at the MCP layer with a structured, friendly message.
 */
describe("eventDateSchema (F-9)", () => {
    it("accepts ISO date strings", () => {
        expect(eventDateSchema.parse("2026-06-07")).toBe("2026-06-07")
        expect(eventDateSchema.parse("2099-12-31")).toBe("2099-12-31")
    })

    it("accepts full ISO datetimes", () => {
        expect(eventDateSchema.parse("2026-06-07T19:00:00Z")).toBe(
            "2026-06-07T19:00:00Z",
        )
    })

    it("accepts undefined (the field is optional)", () => {
        expect(eventDateSchema.parse(undefined)).toBeUndefined()
    })

    it("rejects non-parseable strings with the friendly message", () => {
        const result = eventDateSchema.safeParse("not-a-date")
        expect(result.success).toBe(false)
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "eventDate must be an ISO date string",
            )
        }
    })

    it("rejects empty strings", () => {
        const result = eventDateSchema.safeParse("")
        expect(result.success).toBe(false)
    })
})

/**
 * H-2 — 2026-05-15 stress test caught bulk_update_tracks silently
 * dropping `position` from patches via Zod's default strip, then returning
 * the downstream "patch must include at least one field" error. The
 * operator had no way to learn position was unsupported. The schema now
 * passthrough()'s + refines to reject the field explicitly with guidance.
 *
 * update_track keeps the field — single-row in-place reorder is supported
 * there. This pair of tests pins both halves of the contract.
 */
describe("bulkTrackPatchSchema (H-2)", () => {
    it("accepts the documented field-patch fields", () => {
        const result = bulkTrackPatchSchema.safeParse({
            key: "G",
            leadMusician: "David",
            title: "Hinei Ma Tov",
            notes: "fast",
            type: "song",
            songId: "song-id",
            referenceLink: "https://example.com",
        })
        expect(result.success).toBe(true)
    })

    it("rejects a patch that includes position, with a message pointing at update_track / reorder_setlist", () => {
        const result = bulkTrackPatchSchema.safeParse({ position: 1 })
        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues[0]
            expect(issue.message).toContain("position is not supported")
            expect(issue.message).toContain("update_track")
            expect(issue.message).toContain("reorder_setlist")
            expect(issue.path).toContain("position")
        }
    })

    it("rejects a patch that includes position even when other fields are present", () => {
        const result = bulkTrackPatchSchema.safeParse({
            key: "G",
            position: 3,
        })
        expect(result.success).toBe(false)
    })
})

describe("updateTrackPatchSchema (H-2 partner)", () => {
    it("accepts position alongside field patches (update_track DOES support in-place moves)", () => {
        const result = updateTrackPatchSchema.safeParse({
            key: "G",
            position: 0,
        })
        expect(result.success).toBe(true)
    })

    it("accepts position by itself (pure move)", () => {
        const result = updateTrackPatchSchema.safeParse({ position: 5 })
        expect(result.success).toBe(true)
    })

    it("rejects negative position", () => {
        const result = updateTrackPatchSchema.safeParse({ position: -1 })
        expect(result.success).toBe(false)
    })
})
