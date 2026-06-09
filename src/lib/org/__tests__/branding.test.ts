import { describe, it, expect } from "vitest"
import { getOrgBranding } from "@/lib/org/branding"

describe("getOrgBranding", () => {
    it("returns the Brothers Lazaroff band chrome (forced dark)", () => {
        const b = getOrgBranding("brotherslazaroff")
        expect(b.shortName).toBe("Brothers Lazaroff")
        expect(b.forceDark).toBe(true)
        expect(b.tagline.length).toBeGreaterThan(0)
    })

    it("keeps CRC on system theme (forceDark false) so CRC chrome is unchanged", () => {
        const b = getOrgBranding("crc")
        expect(b.forceDark).toBe(false)
        expect(b.shortName).toBe("CRC Music")
    })
})
