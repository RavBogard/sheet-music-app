import { describe, it, expect } from "vitest"
import {
    matchPartIndices,
    partMatchesPattern,
    resolvePartSelection,
    sanitizeDevicePick,
    type PartPreset,
} from "../part-presets"

const PARTS = ["Vocals", "Bass Guitar", "Piano", "Drum Set"]
const preset = (patterns: string[], scope: PartPreset["scope"]): PartPreset => ({ scope, patterns })

describe("part matching", () => {
    it("is case-insensitive and loose by whole word", () => {
        expect(partMatchesPattern("Bass Guitar", "bass")).toBe(true)
        expect(partMatchesPattern("Bass Guitar", "BASS GUITAR")).toBe(true)
        expect(partMatchesPattern("Bass Guitar", "bas")).toBe(false)
        expect(partMatchesPattern("Piano", "")).toBe(false)
    })

    it("returns the matching indices in score order", () => {
        expect(matchPartIndices(PARTS, ["piano", "bass"])).toEqual([1, 2])
        expect(matchPartIndices(PARTS, ["tuba"])).toEqual([])
    })
})

describe("resolvePartSelection precedence", () => {
    const user = preset(["Piano"], { kind: "user", uid: "u1" })
    const instrument = preset(["Bass"], { kind: "instrument", instrument: "bass" })

    it("opens the full score when nothing is chosen", () => {
        expect(resolvePartSelection({ partNames: PARTS })).toEqual({ source: "full", visible: [0, 1, 2, 3] })
    })

    it("device pick beats the user preset, which beats the instrument preset", () => {
        expect(resolvePartSelection({ partNames: PARTS, devicePick: [3], userPreset: user, instrumentPreset: instrument }))
            .toEqual({ source: "device", visible: [3] })
        expect(resolvePartSelection({ partNames: PARTS, userPreset: user, instrumentPreset: instrument }))
            .toEqual({ source: "user", visible: [2] })
        expect(resolvePartSelection({ partNames: PARTS, instrumentPreset: instrument }))
            .toEqual({ source: "instrument", visible: [1] })
    })

    it("never guesses: a preset that matches nothing shows the full score", () => {
        const none = preset(["Tuba"], { kind: "user", uid: "u1" })
        expect(resolvePartSelection({ partNames: PARTS, userPreset: none }).source).toBe("full")
    })

    it("ignores a stale or empty device pick", () => {
        expect(sanitizeDevicePick([], 4)).toBeNull()
        expect(sanitizeDevicePick([9], 4)).toBeNull()
        expect(resolvePartSelection({ partNames: PARTS, devicePick: [9], userPreset: user }).source).toBe("user")
    })
})
