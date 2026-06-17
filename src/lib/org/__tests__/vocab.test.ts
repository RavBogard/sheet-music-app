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

    // v11-05-05: CreationWizard / public listing / display-card keys.
    const V11_05_05_KEYS: Array<[Parameters<typeof label>[1], string, string]> = [
        ["newSetlist", "New Setlist", "New Set"],
        ["blankSetlist", "Blank setlist", "Blank set"],
        ["cloneSetlistAction", "Clone Setlist", "Clone Set"],
        ["createSetlistAction", "Create Setlist", "Create Set"],
        ["wizardNamePlaceholder", "e.g., Shabbat Morning, Friday Night...", "e.g., Friday night set"],
        ["pastSection", "Past services", "Past shows"],
        ["planPlaceholder", "Plan Service", "Plan Show"],
        // v11.1-04: dashboard headers + matrix title.
        ["upcomingSection", "Upcoming Services", "Upcoming Shows"],
        ["createNewSetlistHeading", "Create New Setlist", "Create New Set"],
        ["matrixTitle", "Liturgical Matrix", "Set Matrix"],
        // v11.5-05 (Q6): public /perform listing subtitle.
        ["publicListingSubtitle", "Public setlists", "Public sets"],
    ]
    it("CRC base strings are byte-identical to the current hardcoded UI", () => {
        for (const [key, crc] of V11_05_05_KEYS) {
            expect(label("crc", key)).toBe(crc)
        }
    })
    it("Brothers Lazaroff gets the band-voice override", () => {
        for (const [key, , bl] of V11_05_05_KEYS) {
            expect(label("brotherslazaroff", key)).toBe(bl)
        }
    })
})
