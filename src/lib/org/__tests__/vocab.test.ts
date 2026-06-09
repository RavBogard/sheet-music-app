import { describe, it, expect } from "vitest"
import { hidesLiturgicalFields, label } from "@/lib/org/vocab"

describe("hidesLiturgicalFields", () => {
    it("hides synagogue fields for Brothers Lazaroff", () => {
        expect(hidesLiturgicalFields("brotherslazaroff")).toBe(true)
    })
    it("keeps synagogue fields for CRC", () => {
        expect(hidesLiturgicalFields("crc")).toBe(false)
    })
})

describe("label", () => {
    it("returns band vocab overrides for Brothers Lazaroff", () => {
        expect(label("brotherslazaroff", "setlist")).toBe("set")
        expect(label("brotherslazaroff", "editSetlistDetails")).toBe("Edit set details")
        expect(label("brotherslazaroff", "namePlaceholder")).toBe("e.g., Friday night set")
    })
    it("returns base synagogue terms for CRC", () => {
        expect(label("crc", "setlist")).toBe("setlist")
        expect(label("crc", "editSetlistDetails")).toBe("Edit setlist details")
        expect(label("crc", "namePlaceholder")).toBe("e.g., Shabbat Morning")
    })
})
