import { describe, it, expect } from "vitest"
import {
    alwaysRowFamilies,
    alwaysRowsFor,
    mergeAlwaysRows,
} from "../always-rows"
import {
    FRIDAY_NIGHT_TEMPLATE,
    SHABBAT_MORNING_TEMPLATE,
    SHIR_SHABBAT_TEMPLATE,
    BNEI_MITZVAH_SATURDAY_TEMPLATE,
    type TemplateSlot,
} from "@/lib/liturgical-templates"

/**
 * A-W3" — the Always rows, merged into the two families that have a list.
 *
 * The danger in this merge is not that a row is missing; a missing row is
 * visible the first time Daniel reads the template. The danger is a row that
 * is PRESENT and carries the wrong page, or one that Daniel already had as a
 * song slot and now has twice. Those are what these tests watch.
 */

const labels = (slots: TemplateSlot[]) => slots.map((s) => s.label)
const at = (slots: TemplateSlot[], label: string) =>
    slots.findIndex((s) => s.label === label)

describe("the Always lists", () => {
    it("covers exactly the two families Daniel ruled on", () => {
        expect(alwaysRowFamilies().sort()).toEqual([
            "friday_night",
            "shabbat_morning",
        ])
        expect(alwaysRowsFor("friday_night")).toHaveLength(21)
        expect(alwaysRowsFor("shabbat_morning")).toHaveLength(24)
        expect(alwaysRowsFor("shir_shabbat")).toEqual([])
    })

    it("leaves a family with no list untouched", () => {
        const base: TemplateSlot[] = [{ label: "Anything", queries: [] }]
        expect(mergeAlwaysRows(base, "bnei_mitzvah_saturday").slots).toBe(base)
        expect(mergeAlwaysRows(base, "bnei_mitzvah_saturday").notes).toEqual([])
    })
})

describe("merged Friday night", () => {
    it("binds a moment the template already sang, instead of duplicating it", () => {
        const barchu = FRIDAY_NIGHT_TEMPLATE.filter((s) =>
            /^Bar.chu$/.test(s.label),
        )
        expect(barchu).toHaveLength(1)
        // Still the band's song slot — it kept its type and its queries.
        expect(barchu[0].type).toBe("song")
        expect(barchu[0].queries.length).toBeGreaterThan(0)
        expect(barchu[0].fixed).toBeUndefined()
        expect(barchu[0].liturgyRefs?.["crc-friday"]).toEqual({ folio: 10 })
    })

    it("binds through an alias the template spells differently", () => {
        // Template says "Candle Lighting"; the booklet prints "Candle
        // Blessing"; Daniel writes "Lighting the Candles". One row, p.5.
        const slot = FRIDAY_NIGHT_TEMPLATE.find((s) => s.label === "Candle Lighting")
        expect(slot?.liturgyRefs?.["crc-friday"]).toEqual({ folio: 5 })
        expect(labels(FRIDAY_NIGHT_TEMPLATE)).not.toContain("Lighting the Candles")
    })

    it("inserts the Amidah as fixed rows, in booklet page order", () => {
        const amidah = [
            "Avot v’Imahot",
            "G’vurot",
            "K’dushat HaShem",
            "K’dushat HaYom",
            "Avodah",
            "Modim",
            "Shalom Rav",
        ]
        const positions = amidah.map((l) => at(FRIDAY_NIGHT_TEMPLATE, l))
        expect(positions.every((p) => p >= 0)).toBe(true)
        expect([...positions].sort((a, b) => a - b)).toEqual(positions)

        const pages = amidah.map(
            (l) => FRIDAY_NIGHT_TEMPLATE[at(FRIDAY_NIGHT_TEMPLATE, l)]
                .liturgyRefs?.["crc-friday"]?.folio,
        )
        expect(pages).toEqual([24, 26, 27, 27, 28, 29, 30])
    })

    it("puts the inserted Amidah under the T'filah header, not above it", () => {
        expect(at(FRIDAY_NIGHT_TEMPLATE, "T'filah")).toBeLessThan(
            at(FRIDAY_NIGHT_TEMPLATE, "Avot v’Imahot"),
        )
    })

    it("marks every inserted row fixed, page-bearing and chart-free", () => {
        for (const slot of FRIDAY_NIGHT_TEMPLATE.filter((s) => s.fixed)) {
            expect(slot.queries).toEqual([])
            expect(slot.fileId).toBeUndefined()
            expect(slot.type).not.toBe("header")
        }
    })

    it("adds nothing Daniel did not mark Always", () => {
        // `Emet v'Emunah` and `Vayechulu` are confirmed moments of this
        // service and are in the lookup — and are NOT on the Always list.
        expect(labels(FRIDAY_NIGHT_TEMPLATE)).not.toContain("Emet v’Emunah")
        expect(labels(FRIDAY_NIGHT_TEMPLATE)).not.toContain("Vayechulu")
    })

    it("keeps every base slot", () => {
        for (const l of ["Welcome & Announcements", "Hinei Mah Tov", "Oseh Shalom", "Closing Song"]) {
            expect(labels(FRIDAY_NIGHT_TEMPLATE)).toContain(l)
        }
    })
})

describe("merged Shabbat morning", () => {
    it("clones K'dushat HaYom page-less rather than borrowing a page", () => {
        const slot = SHABBAT_MORNING_TEMPLATE.find(
            (s) => s.label === "K’dushat HaYom",
        )
        expect(slot).toBeDefined()
        expect(slot?.fixed).toBe(true)
        expect(slot?.liturgyRefs?.["crc-saturday"]).toBeUndefined()
        // It keeps its draft-feed identity; only the page is absent.
        expect(slot?.liturgyRefs?.["shabbat-shacharit"]?.unitId).toBe(
            "amidah.kdushat-hayom@shabbat-shacharit",
        )
    })

    it("does not bind the Amidah's Avot to the Torah procession", () => {
        // "Avot" is a booklet alias of "Avot v'Imahot" (p.71) and also half of
        // the Torah-service slot "Avot / Torah Processional" thirteen pages
        // later. Binding the second to the first printed a Torah-service row
        // at p.71 and dragged the Amidah out of place behind it.
        const procession = SHABBAT_MORNING_TEMPLATE.find(
            (s) => s.label === "Avot / Torah Processional",
        )
        expect(procession?.liturgyRefs).toBeUndefined()
        expect(at(SHABBAT_MORNING_TEMPLATE, "Avot v’Imahot")).toBeLessThan(
            at(SHABBAT_MORNING_TEMPLATE, "Avot / Torah Processional"),
        )
    })

    it("binds the compound Modeh Ani slot to Modeh Ani, not to both halves", () => {
        const slot = SHABBAT_MORNING_TEMPLATE.find(
            (s) => s.label === "Modeh Ani / Morning Blessings",
        )
        expect(slot?.liturgyRefs?.["crc-saturday"]).toEqual({ folio: 51 })
        // Birchot HaShachar is its own Always row and comes in separately.
        const birchot = SHABBAT_MORNING_TEMPLATE.filter(
            (s) => s.label === "Birchot HaShachar" && s.type !== "header",
        )
        expect(birchot).toHaveLength(1)
        expect(birchot[0].liturgyRefs?.["crc-saturday"]).toEqual({ folio: 53 })
    })

    it("runs the whole service forward through the booklet", () => {
        const pages = SHABBAT_MORNING_TEMPLATE.map(
            (s) => s.liturgyRefs?.["crc-saturday"]?.folio,
        ).filter((p): p is number => typeof p === "number")
        expect([...pages].sort((a, b) => a - b)).toEqual(pages)
    })

    it("ends on the concluding Birkat Kohanim, not the Amidah's", () => {
        // Daniel superseded his own earlier ruling: the Amidah's Birkat
        // Kohanim is Never; only the concluding one, which ends every CRC
        // service, is a row — and the booklet prints it at p.100.
        const rows = SHABBAT_MORNING_TEMPLATE.filter(
            (s) => s.label === "Birkat Kohanim",
        )
        expect(rows).toHaveLength(1)
        expect(rows[0].liturgyRefs?.["crc-saturday"]).toEqual({ folio: 100 })
    })
})

describe("families with no Always list", () => {
    it("gains no rows and no pages", () => {
        for (const tpl of [SHIR_SHABBAT_TEMPLATE, BNEI_MITZVAH_SATURDAY_TEMPLATE]) {
            expect(tpl.some((s) => s.fixed)).toBe(false)
            expect(tpl.some((s) => s.liturgyRefs)).toBe(false)
        }
    })
})
