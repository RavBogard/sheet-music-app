import { describe, it, expect } from "vitest"
import { ceilingFor, clampToCeiling, DEFAULT_MASTER_CEILING, DEFAULT_SEND_CEILING } from "../ceilings"

describe("ceilings (BET-4 / MIXER-03)", () => {
    it("absent or malformed doc → the 0.80 defaults (fail safe)", () => {
        for (const raw of [undefined, null, "x", 42, [], { default: "nope" }]) {
            expect(ceilingFor(raw, "send", 5, 3)).toBe(DEFAULT_SEND_CEILING)
            expect(ceilingFor(raw, "master", 5)).toBe(DEFAULT_MASTER_CEILING)
        }
    })

    it("most specific wins: perChannel → perBus → default for sends; perBus → default for masters", () => {
        const raw = {
            default: { send: 0.75, master: 0.7 },
            perBus: { "2": { send: 0.9, master: 0.85 } },
            perChannel: { "3": { send: 0.6 } },
        }
        expect(ceilingFor(raw, "send", 1, 1)).toBe(0.75)
        expect(ceilingFor(raw, "send", 2, 1)).toBe(0.9)
        expect(ceilingFor(raw, "send", 2, 3)).toBe(0.6)
        expect(ceilingFor(raw, "master", 1)).toBe(0.7)
        expect(ceilingFor(raw, "master", 2)).toBe(0.85)
    })

    it("an out-of-range or non-numeric value falls through to the next level, never lifting the cap to 1", () => {
        const raw = { default: { send: 1.5, master: Number.NaN }, perBus: { "4": { send: -1, master: "0.9" } } }
        expect(ceilingFor(raw, "send", 4, 2)).toBe(DEFAULT_SEND_CEILING)
        expect(ceilingFor(raw, "master", 4)).toBe(DEFAULT_MASTER_CEILING)
    })

    it("clamp math: over the cap → cap with {requested, applied, cap}; at or under → unchanged", () => {
        expect(clampToCeiling(undefined, "send", 1, 5, 3)).toEqual({
            value: 0.8,
            clamped: { requested: 1, applied: 0.8, cap: 0.8 },
        })
        expect(clampToCeiling(undefined, "master", 0.8, 5)).toEqual({ value: 0.8 })
        expect(clampToCeiling(undefined, "master", 0.2, 5)).toEqual({ value: 0.2 })
        expect(clampToCeiling({ default: { send: 0.5, master: 0.5 } }, "master", 0.51, 1).clamped?.cap).toBe(0.5)
    })
})
