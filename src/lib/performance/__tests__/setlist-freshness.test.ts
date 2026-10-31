import { describe, it, expect } from "vitest"
import { setlistMovedPast } from "../setlist-freshness"

describe("setlistMovedPast", () => {
    it("is true when the live version is ahead", () => {
        expect(setlistMovedPast({ version: 3 }, { version: 4 })).toBe(true)
    })
    it("is false for the same version, even if updatedAt differs", () => {
        expect(setlistMovedPast({ version: 3, updatedAt: "2026-01-01T00:00:00Z" }, { version: 3, updatedAt: "2026-02-01T00:00:00Z" })).toBe(false)
    })
    it("falls back to updatedAt across string and Timestamp shapes", () => {
        const later = { toDate: () => new Date("2026-02-01T00:00:00Z") }
        expect(setlistMovedPast({ updatedAt: "2026-01-01T00:00:00Z" }, { updatedAt: later })).toBe(true)
        expect(setlistMovedPast({ updatedAt: "2026-02-01T00:00:00Z" }, { updatedAt: later })).toBe(false)
    })
    it("never fires on missing data", () => {
        expect(setlistMovedPast(null, { version: 2 })).toBe(false)
        expect(setlistMovedPast({ version: 1 }, null)).toBe(false)
        expect(setlistMovedPast({}, { updatedAt: null })).toBe(false)
    })
})
