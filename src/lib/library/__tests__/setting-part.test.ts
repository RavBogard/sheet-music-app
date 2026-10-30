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
        // Download-copy counters and format words are not settings.
        ["fire on the mountain chords (1)", null],
        ["Kolomeykes Score(2)", null],
        ["L'chai Olamim - Full Score (1).pdf", null],
        ["Dreams (Fleetwood Mac, band format)", "Fleetwood Mac"],
        ["Modeh Ani (CRC band chart, Cm)", null],
        // A key written in front of the arranger is dropped.
        ["Modah Ani (Am Aly Halpert)", "Aly Halpert"],
        ["Baruch She'amar (Taubman, D)", "Taubman"],
    ])("%s → %s", (title, expected) => {
        expect(parseSetting(title)).toBe(expected)
    })

    it.each([
        ["Oseh Shalom (Alto)", null],
        ["Oseh Shalom (Hanson) Soprano", "Hanson"],
        ["Oseh Shalom (Hanson) - Tenor", "Hanson"],
        ["Oseh Shalom - Baritone", null],
        ["Oseh Shalom (Hanson) (Alto)", "Hanson"],
        ["Oseh Shalom (Alto, Hanson)", "Hanson"],
        ["Oseh Shalom (Soprano) extra", null],
    ])("a vocal part is not a setting: %s -> %s", (title, expected) => {
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
        ["Oseh Shalom (Alto)", { baseTitle: "Oseh Shalom", part: "Alto" }],
        ["Oseh Shalom (Hanson) Soprano", { baseTitle: "Oseh Shalom (Hanson)", part: "Soprano" }],
        ["Oseh Shalom - Tenor", { baseTitle: "Oseh Shalom", part: "Tenor" }],
        ["Oseh Shalom (Hanson) (Baritone)", { baseTitle: "Oseh Shalom (Hanson)", part: "Baritone" }],
        ["Oseh Shalom Alto Saxophone", { baseTitle: "Oseh Shalom", part: "Alto Saxophone" }],
        ["Oseh Shalom Soprano Saxophone", { baseTitle: "Oseh Shalom", part: "Soprano Saxophone" }],
    ])("%s", (title, expected) => {
        expect(parsePart(title)).toEqual(expected)
    })

    it.each([
        "Barchu Walkdown",
        "Shake It Off",
        "Bb",
        "All About That Bass",
        "Ain't No Sunshine in C",
        "Hava Nagila in Bb",
        "Alto Rhapsody",
        "Tenor of Our Ways",
        "Sing Soprano Loud",
        "Shir Alto",
    ])("%s has no part", (title) => {
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

    it("leaves a person's own setting and part alone, but keeps partGroup current", () => {
        expect(settingPartWriteFields("Barchu (Walkdown) Bb", { settingSource: "human" })).toEqual({
            partGroup: partGroupFor("Barchu (Walkdown)"),
        })
    })

    it("still finds short labels after a hyphen", () => {
        expect(parsePart("Porter Haus - Piano")).toEqual({ baseTitle: "Porter Haus", part: "Piano" })
    })
})
