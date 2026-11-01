import { describe, expect, it } from "vitest"
import { buildTodayDoc, type TodaySetlistInput } from "../build-today"

/**
 * BET-6 — `today.json` gains optional `weekKey`, `parasha` and `occasion`.
 * The reader parses this file, so the change must be strictly additive: every
 * key a service had before keeps its name and value, and Brothers Lazaroff's
 * file gains nothing.
 */

const NOW = new Date("2026-10-06T15:00:00.000Z") // Tue 6 Oct, 10:00 Chicago

const BASE: TodaySetlistInput = {
    id: "s1",
    name: "Shabbat Morning — October 10",
    templateType: "shabbat_morning",
    eventDate: "2026-10-10T15:00:00.000Z", // Sat 10 Oct, 10:00 Chicago
    book: "shabbat-shacharit",
    rabbi: "Rabbi Daniel Bogard",
    version: 4,
    startFolio: 3,
}
const WEEK = { weekKey: "5787-bereshit", weekKeyDay: "2026-10-10", parashaName: "Bereshit" }
const SERVICES = { shabbat_morning: { label: "Shabbat Morning", defaultStartLocal: "10:00" } }
const STREAM = { url: "https://example.org/live" }

function build(row: TodaySetlistInput, org: string) {
    return buildTodayDoc({ setlists: [row], services: SERVICES, stream: STREAM, now: NOW, org }).services[0]
}

const OLD_KEYS = ["setlistId", "name", "serviceType", "eventDate", "startsAt", "book", "readerBook", "startFolio", "rabbi", "stream", "version"]

describe("today.json family keys (BET-6)", () => {
    it("adds weekKey, parasha and occasion for CRC and leaves every old key unchanged", () => {
        const before = build(BASE, "crc")
        const after = build({ ...BASE, ...WEEK }, "crc")
        for (const k of OLD_KEYS) {
            if (k in before) expect(after[k as keyof typeof after], k).toEqual(before[k as keyof typeof before])
        }
        expect(Object.keys(after).filter((k) => !(k in before)).sort()).toEqual(["parasha", "weekKey"])
        expect(after.weekKey).toBe("5787-bereshit")
        expect(after.parasha).toEqual({ slug: "bereshit", name: "Bereshit" })
        expect(after.occasion).toBe("regular")
        expect(before.occasion).toBe("regular")
    })

    it("omits a stale key (the date moved since it was computed)", () => {
        const s = build({ ...BASE, ...WEEK, weekKeyDay: "2026-10-03" }, "crc")
        expect(s).not.toHaveProperty("weekKey")
        expect(s).not.toHaveProperty("parasha")
    })

    it("uses a live week from the caller when the stored one is missing", () => {
        const s = build({ ...BASE, liveWeek: { weekKey: "5787-bereshit", parasha: null } }, "crc")
        expect(s.weekKey).toBe("5787-bereshit")
        expect(s).not.toHaveProperty("parasha")
        expect(s).not.toHaveProperty("liveWeek")
    })

    it("Brothers Lazaroff gets nothing, even from a row that carries the fields", () => {
        const s = build({ ...BASE, ...WEEK, occasion: "bnei-mitzvah", liveWeek: { weekKey: "5787-bereshit", parasha: null } }, "brotherslazaroff")
        expect(s).not.toHaveProperty("weekKey")
        expect(s).not.toHaveProperty("parasha")
        expect(s).not.toHaveProperty("occasion")
    })
})
