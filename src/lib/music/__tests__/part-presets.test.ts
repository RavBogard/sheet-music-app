import { describe, it, expect } from "vitest"
import {
    hasVocalRangeName,
    instrumentPresetApplies,
    matchPartIndices,
    pickPresets,
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

    it("exact matches win over whole-word containment", () => {
        const parts = ["Bass", "Bass Guitar", "Piano"]
        expect(matchPartIndices(parts, ["bass"])).toEqual([0])
        expect(matchPartIndices(parts, ["guitar"])).toEqual([1])
    })

    it("flags vocal-range names for a human look", () => {
        expect(hasVocalRangeName("Tenor 1")).toBe(true)
        expect(hasVocalRangeName("Piano")).toBe(false)
    })

    it("strips combining marks of any script when normalising", () => {
        expect(partMatchesPattern("Cafe\u0301 Bass", "cafe bass")).toBe(true)
    })

    it("returns the matching indices in score order", () => {
        expect(matchPartIndices(PARTS, ["piano", "vocals"])).toEqual([0, 2])
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
        expect(resolvePartSelection({ partNames: PARTS, devicePick: { names: PARTS, visible: [3] }, userPreset: user, instrumentPreset: instrument }))
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

    it("ignores a stale, empty or renamed device pick", () => {
        expect(sanitizeDevicePick({ names: PARTS, visible: [] }, PARTS)).toBeNull()
        expect(sanitizeDevicePick({ names: PARTS, visible: [9] }, PARTS)).toBeNull()
        const renamed = [...PARTS.slice(0, 3), "Drums"]
        expect(sanitizeDevicePick({ names: PARTS, visible: [1] }, renamed)).toBeNull()
        expect(resolvePartSelection({ partNames: renamed, devicePick: { names: PARTS, visible: [1] } }).source).toBe("full")
        expect(resolvePartSelection({ partNames: PARTS, devicePick: { names: PARTS, visible: [1, 2] } }))
            .toEqual({ source: "device", visible: [1, 2] })
    })

    it("applies an instrument preset to a profile instrument slug, loosely", () => {
        expect(instrumentPresetApplies("bass", "electric_bass")).toBe(true)
        expect(instrumentPresetApplies("bass", "piano")).toBe(false)
        const presets = [instrument, user]
        expect(pickPresets(presets, "u1", "electric_bass")).toEqual({ userPreset: user, instrumentPreset: instrument })
        expect(pickPresets(presets, null, "electric_bass")).toEqual({ userPreset: null, instrumentPreset: null })
        expect(pickPresets(presets, "u1", null).instrumentPreset).toBeNull()
    })
})
