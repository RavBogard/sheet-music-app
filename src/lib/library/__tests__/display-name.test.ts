import { describe, it, expect } from "vitest"
import { libraryDisplayName } from "../display-name"

describe("libraryDisplayName (R-0902-live-cw-1 §2)", () => {
    it("strips one trailing media extension", () => {
        expect(libraryDisplayName("Hashkivenu.pdf")).toBe("Hashkivenu")
        expect(libraryDisplayName("Lecha Dodi.musicxml")).toBe("Lecha Dodi")
        expect(libraryDisplayName("Shalom Rav - Full Score.PDF")).toBe(
            "Shalom Rav - Full Score",
        )
    })

    it("strips only the LAST extension", () => {
        expect(libraryDisplayName("Avinu Malkeinu.v2.pdf")).toBe(
            "Avinu Malkeinu.v2",
        )
    })

    it("leaves real dots in a song name alone — the set is closed on purpose", () => {
        expect(libraryDisplayName("Ps. 23")).toBe("Ps. 23")
        expect(libraryDisplayName("Shalom Rav no. 2")).toBe("Shalom Rav no. 2")
        expect(libraryDisplayName("Kedusha (Nava Tehila)")).toBe(
            "Kedusha (Nava Tehila)",
        )
    })

    it("leaves an unknown trailing token alone", () => {
        expect(libraryDisplayName("Barchu.final")).toBe("Barchu.final")
    })

    it("leaves a dotfile whole — there is no stem to keep", () => {
        expect(libraryDisplayName(".pdf")).toBe(".pdf")
    })

    it("degrades on empty input", () => {
        expect(libraryDisplayName(undefined)).toBe("")
        expect(libraryDisplayName(null)).toBe("")
        expect(libraryDisplayName("")).toBe("")
    })
})
