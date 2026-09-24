import { describe, it, expect } from "vitest"
import { companionOf, companionUnitFor, isCompanionUnit } from "../companion"
import { liturgyLookup } from "@/lib/liturgy/lookup"

describe("companion feeds for the Shabbat booklets", () => {
    it("pairs each booklet with the legacy feed that prints its pages", () => {
        expect(companionOf("crc-friday")).toBe("legacy-shabbat-evening")
        expect(companionOf("crc-saturday")).toBe("legacy-shabbat-morning")
        expect(companionOf("crc-machzor-2008")).toBeNull()
        expect(companionOf("shabbat-shacharit")).toBeNull()
        expect(companionOf(null)).toBeNull()
    })

    it("crosswalks a draft id through its moment, on the same page only", () => {
        expect(companionUnitFor("crc-saturday", 51, "awakening.modeh-ani@shabbat-shacharit")).toBe(
            "awakening.modeh-ani@legacy-shabbat-morning",
        )
        expect(companionUnitFor("crc-saturday", 52, "awakening.modeh-ani@shabbat-shacharit")).toBeNull()
    })

    it("passes a companion id through unchanged, and answers null for nothing", () => {
        expect(companionUnitFor("crc-friday", 10, "shma.barchu@legacy-shabbat-evening")).toBe(
            "shma.barchu@legacy-shabbat-evening",
        )
        expect(companionUnitFor("crc-friday", 10, null)).toBeNull()
        expect(companionUnitFor("crc-friday", null, "shma.barchu@shabbat-maariv")).toBeNull()
        expect(companionUnitFor("crc-machzor-2008", 9, "shma.barchu@crc-rh-morning")).toBeNull()
        expect(companionUnitFor("crc-friday", 10, "no.such-unit@shabbat-maariv")).toBeNull()
    })

    it("never yields an id that is not printed on the entry's own page", () => {
        // The measured coverage at landing: 16 of 27 Friday and 33 of 38
        // Saturday confirmed entries crosswalk. Whatever the count becomes as
        // moments.json is regenerated, every id produced must sit on the page.
        let crosswalked = 0
        for (const book of ["crc-friday", "crc-saturday"]) {
            for (const e of liturgyLookup(book)) {
                if (typeof e.folio !== "number" || !e.unitId) continue
                const id = companionUnitFor(book, e.folio, e.unitId)
                if (!id) continue
                crosswalked++
                expect(isCompanionUnit(book, id, e.folio), `${book} ${e.label}`).toBe(true)
            }
        }
        expect(crosswalked).toBeGreaterThanOrEqual(49)
    })
})
