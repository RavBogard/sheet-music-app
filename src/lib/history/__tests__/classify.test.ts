import { describe, it, expect } from "vitest"
import { classifyService } from "../classify"

describe("classifyService", () => {
    it.each([
        ["Shir Shabbat — Nov 6, 2026 (w/ Duo Andalus)", "friday_night", null, "shir_shabbat", null, true, null],
        ["Shir Shabbat — Oct 2, 2026 · Bb", "shir-shabbat", null, "shir_shabbat", null, false, "Bb"],
        ["Shir Shabbat — Oct 2, 2026 · Piano/Keys", "shir_shabbat", null, "shir_shabbat", null, false, "Piano/Keys"],
        ["Kabbalat Shabbat — May 22, 2026", "kabbalat-shabbat", "Daniel", "friday_night", "daniel_karen", false, null],
        ["Shabbat Morning — Parashat Ha'azinu — September 19", "shabbat_morning", "Randy Fleisher", "shabbat_morning", "randy", false, null],
        ["Ami Chesed Bar Mitzvah — Oct 24", null, "Daniel Bogard &amp; Karen Bogard (Rabbi Randy — Torah service)", "bnei_mitzvah_saturday", "daniel_karen", false, null],
        ["Eliana Levine Bat Mitzvah — October 10", "bnei_mitzvah_saturday", "Daniel Bogard", "bnei_mitzvah_saturday", "daniel_karen", false, null],
        ["Yom Kippur Morning — September 21", "yom-kippur-morning", "Karen / Randy", "yom_kippur_morning", null, true, null],
        ["Erev Sukkot with Nefesh Mountain — September 25", "friday_night", null, "friday_night", null, true, null],
        ["David Sterneck Memorial Bar Mitzvah — Oct 31", "bnei_mitzvah_saturday", "Randy Fleisher", "bnei_mitzvah_saturday", "randy", true, null],
        ["Camp Sabra Campfire — June 7", "campfire", null, null, null, true, null],
        ["Bar Mitzvah — Chase — May 16 (4pm Havdallah)", "bnei_mitzvah_havdallah", null, "havdalah_bnei_mitzvah", null, false, null],
    ] as const)(
        "%s (%s, rabbi %s)",
        (name, templateType, rabbi, serviceType, rabbiSlot, special, part) => {
            expect(classifyService({ name, templateType, rabbi })).toEqual({
                serviceType,
                rabbiSlot,
                special,
                part,
            })
        },
    )

    it("maps the holiday template aliases to catalog keys", () => {
        expect(classifyService({ name: "x", templateType: "rosh-hashanah-day" }).serviceType).toBe("rosh_hashanah_morning")
        expect(classifyService({ name: "x", templateType: "erev-rosh-hashanah" }).serviceType).toBe("rosh_hashanah_evening")
        expect(classifyService({ name: "x", templateType: "kol-nidre" }).serviceType).toBe("yom_kippur_kol_nidre")
        expect(classifyService({ name: "x", templateType: "kol-nidre-alt" }).serviceType).toBe("yom_kippur_kol_nidre")
        expect(classifyService({ name: "x", templateType: "neilah" }).serviceType).toBe("yom_kippur_afternoon")
    })

    it("never reads a rabbi name inside a longer word", () => {
        expect(classifyService({ name: "Shabbat Morning", rabbi: "Danielle" }).rabbiSlot).toBeNull()
    })

    describe("stored service class", () => {
        it("a stored value wins over inference", () => {
            const c = classifyService({ name: "Shabbat with guests", serviceType: "shabbat_morning", special: false })
            expect(c.special).toBe(false)
            expect(c.serviceType).toBe("shabbat_morning")
        })

        it("a stored special:true marks an ordinary-looking week", () => {
            expect(classifyService({ name: "Shabbat Morning", templateType: "shabbat_morning", special: true }).special).toBe(true)
        })

        it("a stored rabbiSlot wins over the rabbi text", () => {
            expect(classifyService({ name: "Shabbat Morning", rabbi: "Daniel", rabbiSlot: "randy" }).rabbiSlot).toBe("randy")
        })

        it("null or unknown stored values fall back to inference", () => {
            const c = classifyService({
                name: "Kabbalat Shabbat — May 22, 2026",
                templateType: "kabbalat-shabbat",
                rabbi: "Daniel",
                serviceType: "nonsense",
                rabbiSlot: null,
                special: null,
            })
            expect(c).toEqual({ serviceType: "friday_night", rabbiSlot: "daniel_karen", special: false, part: null })
        })

        it("a stored holiday type with no stored special is still special", () => {
            expect(classifyService({ name: "x", serviceType: "yom_kippur_morning" }).special).toBe(true)
        })
    })
})
