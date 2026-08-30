import { describe, it, expect } from "vitest"
import { lookupBookPage } from "../lookup"

describe("lookupBookPage", () => {
    it("returns unknown_book for an unregistered slug", () => {
        expect(lookupBookPage("no-such-book", "Mi Chamocha")).toMatchObject({
            ok: false,
            machineCode: "unknown_book",
        })
    })

    it("finds a feed-tier unit by name and returns its first folio and unitId", () => {
        const res = lookupBookPage("shirei-tshuvah", "Barchu")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches.length).toBeGreaterThan(0)
        const top = res.matches[0]
        expect(top.unitId).toMatch(/@/)
        expect(top.folio).toBeGreaterThan(0)
        expect(["high", "medium", "low"]).toContain(top.confidence)
    })

    it("is case- and punctuation-insensitive", () => {
        const a = lookupBookPage("shirei-tshuvah", "barchu")
        const b = lookupBookPage("shirei-tshuvah", "Bar'chu!")
        expect(a.ok && b.ok).toBe(true)
        if (!a.ok || !b.ok) return
        expect(a.matches[0]?.unitId).toBe(b.matches[0]?.unitId)
    })

    it("matches a pagemap alias, not just the primary name", () => {
        const res = lookupBookPage("crc-friday", "Mi Khamokha")
        expect(res.ok).toBe(true)
        if (!res.ok) return
        expect(res.matches[0]?.name).toBe("Mi Chamochah")
        expect(res.matches[0]?.unitId).toBeUndefined()
    })

    it("returns an empty match list rather than an error when nothing matches", () => {
        const res = lookupBookPage("crc-friday", "Zzzz Not A Prayer")
        expect(res).toMatchObject({ ok: true })
        if (!res.ok) return
        expect(res.matches).toEqual([])
    })

    it("marks a single exact match high and multiple partial matches low", () => {
        const exact = lookupBookPage("crc-friday", "Mi Chamocha")
        expect(exact.ok).toBe(true)
        if (!exact.ok) return
        expect(exact.matches[0].confidence).toBe("high")
    })
})
