import { describe, expect, it } from "vitest"
import {
    applyCeilingsPatch,
    ceilingFor,
    DEFAULT_MASTER_CEILING,
    DEFAULT_SEND_CEILING,
    doubleTapTarget,
    faderToDb,
    formatDb,
    normalizeCeilings,
    raisedAboveUnity,
} from "@/lib/monitor/limits"

describe("BET-4 ceilings: resolution (same order as the bridge)", () => {
    const stored = {
        default: { send: 0.65, master: 0.72 },
        perBus: { "2": { send: 0.6 }, "3": { master: 0.5 } },
        perChannel: { "7": { send: 0.4 } },
    }

    it("absent or malformed ceilings fall back to 0.70 / 0.70 (about -2 dB)", () => {
        expect(DEFAULT_SEND_CEILING).toBe(0.7)
        expect(DEFAULT_MASTER_CEILING).toBe(0.7)
        for (const raw of [undefined, null, "x", [], { default: { send: "loud", master: 2 } }]) {
            expect(ceilingFor(raw, "send", 1, 1)).toBe(0.7)
            expect(ceilingFor(raw, "master", 1)).toBe(0.7)
        }
        expect(faderToDb(0.7)).toBe(-2)
    })

    it("a send: channel beats bus beats default", () => {
        expect(ceilingFor(stored, "send", 2, 7)).toBe(0.4)
        expect(ceilingFor(stored, "send", 2, 1)).toBe(0.6)
        expect(ceilingFor(stored, "send", 1, 1)).toBe(0.65)
    })

    it("a master: bus beats default; channel caps never touch a master", () => {
        expect(ceilingFor(stored, "master", 3)).toBe(0.5)
        expect(ceilingFor(stored, "master", 2)).toBe(0.72)
    })

    it("normalize drops bad entries and reports whether anything was stored", () => {
        const { ceilings, stored: isStored } = normalizeCeilings({
            default: { send: 0.6 },
            perBus: { "9": { send: 0.5 }, "1": { send: 3 }, "2": { master: 0.55 } },
            perChannel: { "40": { send: 0.1 }, "3": { send: 0.2 } },
        })
        expect(isStored).toBe(true)
        expect(ceilings.default).toEqual({ send: 0.6, master: 0.7 })
        expect(ceilings.perBus).toEqual({ "2": { master: 0.55 } })
        expect(ceilings.perChannel).toEqual({ "3": { send: 0.2 } })
        expect(normalizeCeilings(undefined).stored).toBe(false)
    })
})

describe("BET-4 ceilings: patching", () => {
    it("merges, removes overrides with null, and keeps what it was not told about", () => {
        const r = applyCeilingsPatch(
            { default: { send: 0.7, master: 0.7 }, perBus: { "1": { send: 0.6 }, "2": { send: 0.5 } } },
            { default: { master: 0.65 }, perBus: { "1": null, "4": { send: 0.55 } }, perChannel: { "5": { send: 0.3 } } },
        )
        expect(r).toEqual({
            ok: true,
            ceilings: {
                default: { send: 0.7, master: 0.65 },
                perBus: { "2": { send: 0.5 }, "4": { send: 0.55 } },
                perChannel: { "5": { send: 0.3 } },
            },
        })
    })

    it("refuses anything that is not a finite fader position on a real bus or channel", () => {
        expect(applyCeilingsPatch(undefined, { default: { send: 1.2 } })).toEqual({ ok: false, field: "default.send" })
        expect(applyCeilingsPatch(undefined, { default: { send: Number.NaN } })).toMatchObject({ ok: false })
        expect(applyCeilingsPatch(undefined, { default: { master: Infinity } })).toMatchObject({ ok: false })
        expect(applyCeilingsPatch(undefined, { perBus: { "6": { send: 0.5 } } })).toEqual({ ok: false, field: "perBus.6" })
        expect(applyCeilingsPatch(undefined, { perChannel: { "33": { send: 0.5 } } })).toMatchObject({ ok: false })
        expect(applyCeilingsPatch(undefined, { perBus: { "2": { master: -0.1 } } })).toMatchObject({ ok: false })
    })
})

describe("BET-4 raising a limit above 0 dB", () => {
    const before = { default: { send: 0.7, master: 0.7 }, perBus: { "2": { send: 0.8 } } }

    it("lists only limits that rise above 0.75", () => {
        const raised = raisedAboveUnity(before, {
            default: { send: 0.78, master: 0.7 },
            perBus: { "2": { send: 0.8 }, "3": { master: 0.9 } },
            perChannel: { "4": { send: 0.76 } },
        })
        expect(raised.map((r) => r.field)).toEqual(["default.send", "perBus.3.master", "perChannel.4.send"])
        expect(raised[1]).toEqual({ field: "perBus.3.master", from: 0.7, to: 0.9 })
    })

    it("lowering, keeping, or raising up to 0 dB is never listed", () => {
        expect(raisedAboveUnity(before, { default: { send: 0.75, master: 0.6 }, perBus: { "2": { send: 0.78 } } })).toEqual([])
        expect(raisedAboveUnity(undefined, { default: { send: 0.7, master: 0.75 } })).toEqual([])
    })
})

describe("BET-4 fader law and readouts", () => {
    it("uses the X32 taper", () => {
        expect(faderToDb(0.75)).toBe(0)
        expect(faderToDb(0.8)).toBe(2)
        expect(faderToDb(0.6)).toBe(-6)
        expect(faderToDb(1)).toBe(10)
        expect(faderToDb(0)).toBeNull()
    })

    it("formats with a sign and a true minus", () => {
        expect(formatDb(0.7)).toBe("−2 dB")
        expect(formatDb(0.8)).toBe("+2 dB")
        expect(formatDb(0.75)).toBe("0 dB")
        expect(formatDb(0)).toBe("−∞ dB")
    })

    it("double-tap goes to the saved level, else 0.6, never above the cap and never 0.75 by default", () => {
        expect(doubleTapTarget(null)).toBe(0.6)
        expect(doubleTapTarget(undefined, 0.7)).toBe(0.6)
        expect(doubleTapTarget(0.68)).toBe(0.68)
        expect(doubleTapTarget(0.9, 0.7)).toBe(0.7)
        expect(doubleTapTarget(Number.NaN)).toBe(0.6)
    })
})
