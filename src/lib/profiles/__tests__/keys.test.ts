import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CRC_CORE_PROFILES, profileKeyFor, rabbiRequired, serviceLabelFor, slotKeyFor } from "../keys"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"

describe("profileKeyFor", () => {
    it("joins the rabbi slot when there is one", () => {
        expect(profileKeyFor("friday_night", "randy")).toBe("friday_night:randy")
        expect(profileKeyFor("shir_shabbat", null)).toBe("shir_shabbat")
    })
})

describe("CRC_CORE_PROFILES", () => {
    it("lists the six core profiles with keys derived from type and slot", () => {
        expect(CRC_CORE_PROFILES.map((p) => p.key)).toEqual([
            "friday_night:daniel_karen",
            "friday_night:randy",
            "shabbat_morning:daniel_karen",
            "shabbat_morning:randy",
            "shir_shabbat",
            "bnei_mitzvah_saturday",
        ])
        for (const p of CRC_CORE_PROFILES) {
            expect(p.key).toBe(profileKeyFor(p.serviceType, p.rabbiSlot))
            expect(SERVICE_TYPE_CATALOG.some((e) => e.key === p.serviceType)).toBe(true)
        }
    })

    it("carries the books", () => {
        const book = Object.fromEntries(CRC_CORE_PROFILES.map((p) => [p.key, p.book]))
        expect(book).toEqual({
            "friday_night:daniel_karen": "crc-friday",
            "friday_night:randy": "crc-friday",
            "shabbat_morning:daniel_karen": "crc-saturday",
            "shabbat_morning:randy": "crc-saturday",
            shir_shabbat: "legacy-shabbat-evening",
            bnei_mitzvah_saturday: "legacy-beit-mitzvah",
        })
    })

    it("profile labels (the one wording check)", () => {
        expect(CRC_CORE_PROFILES.map((p) => p.label)).toEqual([
            "Daniel Friday night",
            "Randy Friday night",
            "Daniel Shabbat morning",
            "Randy Shabbat morning",
            "Shir Shabbat",
            "B'nei Mitzvah",
        ])
    })
})

describe("rabbiRequired", () => {
    it("is true only for friday_night and shabbat_morning", () => {
        expect(rabbiRequired("friday_night")).toBe(true)
        expect(rabbiRequired("shabbat_morning")).toBe(true)
        expect(rabbiRequired("shir_shabbat")).toBe(false)
        expect(rabbiRequired("bnei_mitzvah_saturday")).toBe(false)
    })
})

describe("serviceLabelFor", () => {
    it("returns the catalog label", () => {
        expect(serviceLabelFor("shir_shabbat")).toBe(SERVICE_TYPE_CATALOG.find((e) => e.key === "shir_shabbat")!.label)
        expect(serviceLabelFor(null)).toBeNull()
    })
})

describe("slotKeyFor", () => {
    const partGroups: Record<string, string> = { "barchu-bb": "barchu walkdown", barchu: "barchu walkdown" }
    const pg = (f: string) => partGroups[f] ?? null

    it("uses the moment when there is one", () => {
        expect(slotKeyFor({ momentId: "barchu", title: "Barchu", fileId: "barchu-bb" }, pg)).toBe("moment:barchu")
    })

    it("instrument parts share the song slot via partGroup", () => {
        const a = slotKeyFor({ title: "Barchu (Walkdown) Bb", fileId: "barchu-bb" }, pg)
        const b = slotKeyFor({ title: "Barchu (Walkdown)", fileId: "barchu" }, pg)
        expect(a).toBe("song:barchu walkdown")
        expect(b).toBe(a)
    })

    it("falls back to the title stem without a partGroup", () => {
        expect(slotKeyFor({ title: "Oseh Shalom", fileId: "unknown" }, pg)).toMatch(/^song:oseh shalom/)
        expect(slotKeyFor({ momentId: "", title: "Oseh Shalom" }, pg)).toMatch(/^song:oseh shalom/)
    })
})

describe("purity", () => {
    it("keys.ts and tiers.ts import no Firestore or server-only code", () => {
        for (const f of ["keys.ts", "tiers.ts"]) {
            const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8")
            expect(src).not.toMatch(/firebase|server-only/)
        }
    })
})
