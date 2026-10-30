import { describe, it, expect } from "vitest"
import { parsePart, parseSetting, partGroupFor, settingPartWriteFields } from "../setting-part"

describe("parseSetting", () => {
    it.each([
        ["Barchu (Friedman)", "Friedman"],
        ["Sim Shalom (Silver, Dm)", "Silver"],
        ["Adonai S'fatai (trad)", "trad"],
        ["Mi chamocha (Moshav) morning", "Moshav"],
        ["Eitz chayim - Weisenberg", "Weisenberg"],
        ["V'Shamru (Old Skool)", "Old Skool"],
        ["Adonai S'fatai (Em)", null],
        ["Wonderwall (band format)", null],
        ["Mi chamocha (6-8)", "6-8"],
        ["Shema (major)", "major"],
        ["B'sefer Chayim - Full Score", null],
        ["Hashkivenu", null],
    ])("%s → %s", (title, expected) => {
        expect(parseSetting(title)).toBe(expected)
    })

    it("does not read an instrument part as a setting", () => {
        expect(parseSetting("2. Porter Haus - C Lead")).toBeNull()
        expect(parseSetting("Barchu (Walkdown) Bb")).toBe("Walkdown")
    })
})

describe("parsePart", () => {
    it.each([
        ["Barchu (Walkdown) Bb", { baseTitle: "Barchu (Walkdown)", part: "Bb" }],
        ["Shema (Major) Bass", { baseTitle: "Shema (Major)", part: "Bass" }],
        ["L'cha Dodi (Simpler) Clarinet in Bb", { baseTitle: "L'cha Dodi (Simpler)", part: "Clarinet in Bb" }],
        ["L'cha Dodi Tenor Saxophone", { baseTitle: "L'cha Dodi", part: "Tenor Saxophone" }],
        ["2. Porter Haus - C Lead", { baseTitle: "2. Porter Haus", part: "C Lead" }],
    ])("%s", (title, expected) => {
        expect(parsePart(title)).toEqual(expected)
    })

    it.each(["Barchu Walkdown", "Shake It Off", "Bb"])("%s has no part", (title) => {
        expect(parsePart(title)).toBeNull()
    })
})

describe("partGroupFor", () => {
    it("groups an instrument copy with its base chart", () => {
        expect(partGroupFor("Barchu (Walkdown) Eb")).toBe(partGroupFor("Barchu (Walkdown)"))
        expect(partGroupFor("Barchu (Walkdown)")).not.toBe(partGroupFor("Barchu (Friedman)"))
    })
})

describe("settingPartWriteFields", () => {
    it("computes all three fields", () => {
        expect(settingPartWriteFields("Barchu (Walkdown) Bb")).toEqual({
            setting: "Walkdown",
            part: "Bb",
            partGroup: partGroupFor("Barchu (Walkdown)"),
        })
    })

    it("leaves a person's own setting alone", () => {
        expect(settingPartWriteFields("Barchu (Walkdown) Bb", { settingSource: "human" })).toEqual({})
    })
})
