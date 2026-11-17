import { describe, expect, it } from "vitest"

import { bearerSecretMatches, safeCompare } from "@/lib/http/bearer-secret"

const SECRET = "s3cret-value"

describe("bearerSecretMatches", () => {
    it("accepts the correct secret", () => {
        expect(bearerSecretMatches(`Bearer ${SECRET}`, SECRET)).toBe(true)
    })

    it("rejects a wrong secret of the same length", () => {
        expect(bearerSecretMatches("Bearer s3cret-valuX", SECRET)).toBe(false)
    })

    it("rejects a missing header", () => {
        expect(bearerSecretMatches(null, SECRET)).toBe(false)
        expect(bearerSecretMatches(undefined, SECRET)).toBe(false)
        expect(bearerSecretMatches("", SECRET)).toBe(false)
    })

    it("rejects when the secret is not configured, whatever the header says", () => {
        expect(bearerSecretMatches("Bearer ", undefined)).toBe(false)
        expect(bearerSecretMatches("Bearer ", "")).toBe(false)
        expect(bearerSecretMatches("Bearer undefined", undefined)).toBe(false)
        expect(bearerSecretMatches(`Bearer ${SECRET}`, null)).toBe(false)
    })

    it("rejects a header of a different length", () => {
        expect(bearerSecretMatches(`Bearer ${SECRET}x`, SECRET)).toBe(false)
        expect(bearerSecretMatches("Bearer s", SECRET)).toBe(false)
        expect(bearerSecretMatches(SECRET, SECRET)).toBe(false)
    })

    it("rejects, without throwing, a non-ASCII header of the same string length", () => {
        // Same JS string length as the expected value, more UTF-8 bytes:
        // the case that made timingSafeEqual throw in the old copies.
        const nonAscii = `Bearer ${"é".repeat(SECRET.length)}`
        expect(nonAscii.length).toBe(`Bearer ${SECRET}`.length)
        expect(() => bearerSecretMatches(nonAscii, SECRET)).not.toThrow()
        expect(bearerSecretMatches(nonAscii, SECRET)).toBe(false)
    })

    it("accepts a non-ASCII secret when the header matches it", () => {
        expect(bearerSecretMatches("Bearer pässwörd", "pässwörd")).toBe(true)
        expect(bearerSecretMatches("Bearer passwörd", "pässwörd")).toBe(false)
    })
})

describe("safeCompare", () => {
    it("is false on unequal byte lengths and never throws", () => {
        expect(() => safeCompare("a", "é")).not.toThrow()
        expect(safeCompare("a", "é")).toBe(false)
        expect(safeCompare("abc", "abc")).toBe(true)
    })
})
