import { describe, it, expect } from "vitest"
import { classifyService } from "../classify"

describe("classifyService strictness (MCP-12)", () => {
    it.each([
        "Shavuot Yizkor — May 22",
        "Sukkot I — Sep 26",
        "Maxine Weil Retirement Celebration",
        "Camp Sabra — June 7",
        "Simchat Torah — Oct 3",
    ])("%s counts as a special week", (name) => {
        expect(classifyService({ name }).special).toBe(true)
    })

    it("the tag decides the type, never the name (Daniel 2026-11-07)", () => {
        // A Shir Keter or Shir Shabbat filed as Friday night is a Friday night until it is retagged.
        expect(classifyService({ name: "Shir Keter Shabbat — Oct 16", templateType: "friday_night" }).serviceType).toBe("friday_night")
        expect(classifyService({ name: "Shir Keter Shabbat — Oct 16", serviceType: "shir_keter", templateType: "friday_night" }).serviceType).toBe("shir_keter")
        // A B'nei Mitzvah name no longer beats the stored type.
        expect(classifyService({ name: "Ami Chesed Bar Mitzvah — Oct 24", serviceType: "shabbat_morning" }).serviceType).toBe("shabbat_morning")
        expect(classifyService({ name: "Ray Slavin's 3rd Bar Mitzvah", serviceType: "adult_bnei_mitzvah", templateType: "shabbat_morning" }).serviceType).toBe("adult_bnei_mitzvah")
    })

    it.each(["Max bar Mitzvah", "Bnei Mitzvah Morning", "Shir Shabbat — Oct 2", "Kabbalat Shabbat — May 22"])(
        "an untagged setlist (%s) has no type and counts toward no profile",
        (name) => {
            const c = classifyService({ name })
            expect(c.serviceType).toBeNull()
            expect(c.special).toBe(true)
        },
    )

    it("a tagged regular Shir Shabbat, Shir Keter or Shabbat morning is not special", () => {
        expect(classifyService({ name: "Shir Shabbat — Oct 2", serviceType: "shir_shabbat" }).special).toBe(false)
        expect(classifyService({ name: "Shir Keter Shabbat — Oct 16 · Crown Center", serviceType: "shir_keter" }).special).toBe(false)
        expect(classifyService({ name: "Shabbat Morning — Parashat Noach", serviceType: "shabbat_morning" }).special).toBe(false)
    })

    it("leaves a Havdalah B'nei Mitzvah as its own type", () => {
        expect(classifyService({ name: "Bar Mitzvah — Chase", templateType: "bnei_mitzvah_havdallah" }).serviceType).toBe("havdalah_bnei_mitzvah")
    })
})
