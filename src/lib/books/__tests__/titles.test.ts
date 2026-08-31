import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { bookTitle } from "@/lib/books/titles"

describe("bookTitle", () => {
    it("resolves a known slug to its display title", () => {
        expect(bookTitle("crc-friday")).toBeTruthy()
        expect(typeof bookTitle("crc-friday")).toBe("string")
    })

    it("returns undefined for an unknown slug or no slug", () => {
        expect(bookTitle("not-a-book")).toBeUndefined()
        expect(bookTitle(undefined)).toBeUndefined()
    })

    it("never says 'legacy' in a user-facing title", () => {
        for (const slug of ["crc-friday", "crc-saturday"]) {
            expect(bookTitle(slug)?.toLowerCase()).not.toContain("legacy")
        }
    })

    // BUNDLE GUARD: titles.ts must not pull in registry.ts, which statically
    // imports all five book JSON files (~80KB). This module exists precisely
    // so a client component can name a book without that payload.
    it("does not import the heavy registry module", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/books/titles.ts"), "utf8")
        expect(src).not.toMatch(/from\s+["'](\.\/registry|@\/lib\/books\/registry)["']/)
        expect(src).not.toMatch(/data\/books\/(crc|shabbat|shirei)/)
    })
})
