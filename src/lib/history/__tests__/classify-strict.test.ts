import { describe, it, expect } from "vitest"
import { classifyService } from "../classify"

describe("classifyService strictness (MCP-12)", () => {
    it.each([
        "Shavuot Yizkor — May 22",
        "Sukkot I — Sep 26",
        "Maxine Weil Retirement Celebration",
        "Camp Sabra — June 7",
        "Simchat Torah — Oct 3",
        "Shir Keter Shabbat — Oct 16 · Crown Center",
    ])("%s counts as a special week", (name) => {
        expect(classifyService({ name }).special).toBe(true)
    })

    it("Shir Keter Shabbat is a Shir Shabbat, not a Friday night", () => {
        expect(classifyService({ name: "Shir Keter Shabbat — Oct 16", templateType: "friday_night" }).serviceType).toBe("shir_shabbat")
    })

    it("a regular Shir Shabbat or Shabbat morning is not special", () => {
        expect(classifyService({ name: "Shir Shabbat — Oct 2" }).special).toBe(false)
        expect(classifyService({ name: "Shabbat Morning — Parashat Noach", serviceType: "shabbat_morning" }).special).toBe(false)
    })

    it("a B'nei Mitzvah name beats a stored shabbat_morning", () => {
        const c = classifyService({ name: "Ami Chesed Bar Mitzvah — Oct 24", serviceType: "shabbat_morning" })
        expect(c.serviceType).toBe("bnei_mitzvah_saturday")
        expect(classifyService({ name: "Shabbat Morning — Parashat Noach", serviceType: "shabbat_morning" }).serviceType).toBe("shabbat_morning")
    })
})
