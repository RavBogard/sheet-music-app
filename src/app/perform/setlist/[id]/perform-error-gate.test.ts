import { describe, it, expect } from "vitest"
import { shouldShowFatalSetlistError } from "./perform-error-gate"

// WS-12 (v11.6-03-02): the fatal full-screen error only shows when there is no
// loaded content; an already-hydrated set survives a transient offline error.
describe("shouldShowFatalSetlistError", () => {
    it("AC-1: error with an already-loaded set → keep the set (no fatal screen)", () => {
        expect(shouldShowFatalSetlistError("Couldn't load setlist — check your connection", true)).toBe(false)
    })
    it("AC-1: error with NO loaded tracks → show the fatal screen", () => {
        expect(shouldShowFatalSetlistError("Setlist not found — it may have been deleted.", false)).toBe(true)
    })
    it("no error → never fatal (regardless of tracks)", () => {
        expect(shouldShowFatalSetlistError(null, false)).toBe(false)
        expect(shouldShowFatalSetlistError(null, true)).toBe(false)
    })
})
