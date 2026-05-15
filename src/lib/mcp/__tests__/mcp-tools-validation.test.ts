import { describe, expect, it } from "vitest"
import { eventDateSchema } from "../tools"

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
