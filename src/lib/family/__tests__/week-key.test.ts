// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { HebcalWeekItem } from "@/lib/liturgical-calendar"
import {
    computeWeek,
    familyWeekFields,
    occasionOf,
    storedWeek,
    weekFields,
    weekFromHebcal,
    weekSlug,
} from "../week-key"

/**
 * BET-6 — the week key. Fixtures are Hebcal Shabbat-API items as Hebcal
 * returned them on 2026-10-31 (Diaspora), trimmed to the fields used.
 */
const h = (category: string, title: string, date: string, hdate?: string, subcat?: string): HebcalWeekItem => ({ category, title, date, hdate, subcat })

const WEEK = {
    nitzavim: [h("candles", "Candle lighting: 7:05pm", "2026-09-04T19:05:00-04:00"), h("parashat", "Parashat Nitzavim-Vayeilech", "2026-09-05", "23 Elul 5786"), h("holiday", "Leil Selichot", "2026-09-05", "23 Elul 5786", "minor")],
    erevRoshHashana: [h("holiday", "Erev Rosh Hashana", "2026-09-11", "29 Elul 5786", "major"), h("holiday", "Rosh Hashana 5787", "2026-09-12", "1 Tishrei 5787", "major"), h("holiday", "Rosh Hashana II", "2026-09-13", "2 Tishrei 5787", "major"), h("holiday", "Tzom Gedaliah", "2026-09-14", "3 Tishrei 5787", "fast")],
    haazinu: [h("parashat", "Parashat Ha’azinu", "2026-09-19", "8 Tishrei 5787"), h("holiday", "Shabbat Shuva", "2026-09-19", "8 Tishrei 5787", "shabbat"), h("holiday", "Erev Yom Kippur", "2026-09-20", "9 Tishrei 5787", "major"), h("holiday", "Yom Kippur", "2026-09-21", "10 Tishrei 5787", "major")],
    sukkot: [h("holiday", "Erev Sukkot", "2026-09-25", "14 Tishrei 5787", "major"), h("holiday", "Sukkot I", "2026-09-26", "15 Tishrei 5787", "major"), h("holiday", "Sukkot II", "2026-09-27", "16 Tishrei 5787", "major"), h("holiday", "Sukkot III (CH’’M)", "2026-09-28", "17 Tishrei 5787", "major")],
    shminiAtzeret: [h("holiday", "Sukkot VII (Hoshana Raba)", "2026-10-02", "21 Tishrei 5787", "major"), h("holiday", "Shmini Atzeret", "2026-10-03", "22 Tishrei 5787", "major"), h("holiday", "Simchat Torah", "2026-10-04", "23 Tishrei 5787", "major")],
    bereshit: [h("parashat", "Parashat Bereshit", "2026-10-10", "29 Tishrei 5787"), h("mevarchim", "Mevarchim Chodesh Cheshvan", "2026-10-10", "29 Tishrei 5787"), h("roshchodesh", "Rosh Chodesh Cheshvan", "2026-10-11", "30 Tishrei 5787")],
    chanukah: [h("holiday", "Chanukah: 8 Candles", "2026-12-11T16:10:00-05:00", undefined, "major"), h("parashat", "Parashat Miketz", "2026-12-12", "2 Tevet 5787"), h("holiday", "Chanukah: 8th Day", "2026-12-12", "2 Tevet 5787", "major")],
    pesachChm: [h("holiday", "Pesach II", "2027-04-23", "16 Nisan 5787", "major"), h("holiday", "Pesach III (CH’’M)", "2027-04-24", "17 Nisan 5787", "major")],
}

describe("weekSlug", () => {
    it("normalises Hebcal titles", () => {
        expect(weekSlug("Parashat Ha’azinu")).toBe("haazinu")
        expect(weekSlug("Parashat Nitzavim-Vayeilech")).toBe("nitzavim-vayeilech")
        expect(weekSlug("Sukkot VII (Hoshana Raba)")).toBe("sukkot-7")
        expect(weekSlug("Rosh Hashana 5787")).toBe("rosh-hashana")
        expect(weekSlug("Pesach III (CH’’M)")).toBe("pesach-3")
    })
})

describe("weekFromHebcal — regular weeks", () => {
    it("keys a Shabbat to its parasha, Friday and Saturday alike", () => {
        expect(weekFromHebcal("2026-10-10", WEEK.bereshit)).toEqual({ weekKey: "5787-bereshit", day: "2026-10-10", parasha: { slug: "bereshit", name: "Bereshit" } })
        expect(weekFromHebcal("2026-10-09", WEEK.bereshit)?.weekKey).toBe("5787-bereshit")
    })

    it("a Shabbat in Chanukah keeps its parasha", () => {
        expect(weekFromHebcal("2026-12-12", WEEK.chanukah)?.weekKey).toBe("5787-miketz")
    })
})

describe("weekFromHebcal — holidays", () => {
    it("a festival day keys to the holiday and carries no parasha", () => {
        expect(weekFromHebcal("2026-09-26", WEEK.sukkot)).toEqual({ weekKey: "5787-sukkot-1", day: "2026-09-26", parasha: null })
        expect(weekFromHebcal("2026-10-03", WEEK.shminiAtzeret)?.weekKey).toBe("5787-shmini-atzeret")
        expect(weekFromHebcal("2026-09-21", WEEK.haazinu)?.weekKey).toBe("5787-yom-kippur")
    })

    it("a Friday evening that opens a festival Shabbat keys to the festival", () => {
        expect(weekFromHebcal("2026-09-25", WEEK.sukkot)?.weekKey).toBe("5787-sukkot-1")
    })

    it("Shabbat Chol HaMoed keys to its festival day", () => {
        expect(weekFromHebcal("2027-04-24", WEEK.pesachChm)?.weekKey).toBe("5787-pesach-3")
    })
})

describe("weekFromHebcal — the year boundary", () => {
    it("the last Shabbat of 5786 stays in 5786", () => {
        expect(weekFromHebcal("2026-09-05", WEEK.nitzavim)?.weekKey).toBe("5786-nitzavim-vayeilech")
    })
    it("Erev Rosh Hashanah (29 Elul) keys to the new year's holiday", () => {
        expect(weekFromHebcal("2026-09-11", WEEK.erevRoshHashana)?.weekKey).toBe("5787-rosh-hashana")
    })
    it("Shabbat Shuva is 5787's Ha'azinu, not the holiday around it", () => {
        expect(weekFromHebcal("2026-09-19", WEEK.haazinu)?.weekKey).toBe("5787-haazinu")
    })
    it("no items, or a bad day, is no key", () => {
        expect(weekFromHebcal("2026-10-10", [])).toBeNull()
        expect(weekFromHebcal("not-a-day", WEEK.bereshit)).toBeNull()
    })
})

describe("storedWeek — a stale key reads as absent", () => {
    const fields = weekFields(weekFromHebcal("2026-10-10", WEEK.bereshit)!)
    it("reads a key that matches the service day", () => {
        // 10:00 Chicago on Sat 10 Oct.
        expect(storedWeek({ eventDate: "2026-10-10T15:00:00.000Z", ...fields }, "crc")).toEqual({ weekKey: "5787-bereshit", parasha: { slug: "bereshit", name: "Bereshit" } })
    })
    it("drops a key whose date moved", () => {
        expect(storedWeek({ eventDate: "2026-10-17T15:00:00.000Z", ...fields }, "crc")).toBeNull()
    })
})

describe("occasion", () => {
    it("stored bridge value wins; otherwise the stricter classification", () => {
        expect(occasionOf({ name: "Shabbat Morning", occasion: "bnei-mitzvah" }, "crc")).toBe("bnei-mitzvah")
        expect(occasionOf({ name: "Bat Mitzvah of R. — Nov 7", templateType: "shabbat_morning" }, "crc")).toBe("bnei-mitzvah")
        expect(occasionOf({ name: "Yom Kippur Morning", templateType: "yom_kippur_morning" }, "crc")).toBe("holiday")
        expect(occasionOf({ name: "Shabbat with Joe Buchanan", templateType: "shabbat_morning" }, "crc")).toBe("guest")
        expect(occasionOf({ name: "Shabbat Morning — Oct 10", templateType: "shabbat_morning" }, "crc")).toBe("regular")
        expect(occasionOf({ name: "Rehearsal" }, "crc")).toBeUndefined()
    })
})

describe("tenant wall: Brothers Lazaroff gets nothing", () => {
    afterEach(() => vi.unstubAllGlobals())
    const fields = weekFields(weekFromHebcal("2026-10-10", WEEK.bereshit)!)
    const row = { name: "Bat Mitzvah gig", eventDate: "2026-10-10T15:00:00.000Z", occasion: "bnei-mitzvah", ceremonyId: "x", ...fields }

    it("never computes a week, and never calls Hebcal", async () => {
        const fetchSpy = vi.fn()
        vi.stubGlobal("fetch", fetchSpy)
        expect(await computeWeek("2026-10-10", "brotherslazaroff")).toBeNull()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it("reads no week, parasha or occasion even from a doc that carries them", () => {
        expect(storedWeek(row, "brotherslazaroff")).toBeNull()
        expect(occasionOf(row, "brotherslazaroff")).toBeUndefined()
        expect(familyWeekFields(row, "brotherslazaroff")).toEqual({})
        expect(familyWeekFields(row, "crc")).toEqual({ weekKey: "5787-bereshit", parasha: { slug: "bereshit", name: "Bereshit" }, occasion: "bnei-mitzvah" })
    })
})
