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

    // v11.1-01: authed-nav logo source. CRC keeps "/logo.jpg" (byte-identical
    // to the prior DesktopHeader/MobileHeader hardcode); broslaz is empty so the
    // nav renders the brand-colored "BL" monogram.
    it("exposes the authed-nav logoUrl per org (crc keeps /logo.jpg, broslaz empty → monogram)", () => {
        expect(getOrgBranding("crc").logoUrl).toBe("/logo.jpg")
        expect(getOrgBranding("brotherslazaroff").logoUrl).toBe("")
        // unknown tenant falls back to CRC branding → CRC logo.
        expect(getOrgBranding("unknown-tenant").logoUrl).toBe("/logo.jpg")
    })

    it("falls back to CRC branding for an unknown org id", () => {
        const b = getOrgBranding("unknown-tenant")
        expect(b.shortName).toBe("CRC Music")
        expect(b.manifestPath).toBe("/manifest.json")
    })

    // v11-04-02: consumer-surface metadata is data-driven. CRC values MUST stay
    // byte-identical to the strings previously hardcoded in src/app/layout.tsx
    // (the head output must not change for centralreform.live).
    it("carries CRC metadata fields byte-identical to the prior layout.tsx strings", () => {
        const b = getOrgBranding("crc")
        expect(b.appName).toBe("Central Reform Congregation Music")
        expect(b.metaTitleDefault).toBe("CRC Music | Digital Sheet Library")
        expect(b.metaTitleTemplate).toBe("%s | CRC Music")
        expect(b.metaDescription).toBe("Digital Sheet Music Library for Central Reform Congregation")
        expect(b.ogTitle).toBe("Central Reform Congregation — Music")
        expect(b.themeColor).toBe("#0e0d18")
        expect(b.manifestPath).toBe("/manifest.json")
        // NEXT_PUBLIC_BASE_URL is unset in test/prod → the prior fallback origin.
        expect(b.baseUrl).toBe(process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live")
    })

    it("carries Brothers Lazaroff consumer metadata (no CRC/synagogue strings)", () => {
        const b = getOrgBranding("brotherslazaroff")
        expect(b.appName).toBe("Brothers Lazaroff")
        expect(b.metaTitleDefault).toBe("Brothers Lazaroff")
        expect(b.metaTitleTemplate).toBe("%s | Brothers Lazaroff")
        expect(b.manifestPath).toBe("/manifest-brotherslazaroff.json")
        expect(b.baseUrl).toBe("https://brotherslazaroff.live")
        // No leaked CRC / synagogue branding anywhere in BL's metadata.
        const blob = [b.appName, b.metaTitleDefault, b.metaTitleTemplate, b.metaDescription, b.ogTitle].join(" ")
        expect(blob).not.toMatch(/CRC|Central Reform|Congregation/i)
    })
})
