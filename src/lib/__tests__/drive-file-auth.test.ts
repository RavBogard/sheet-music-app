/**
 * v4.3 S03 — /api/drive/file auth-heuristic regression tests.
 *
 * Verifies hasBrowserFetchMetadata no longer admits forgeable signals
 * (Referer, Accept) and still admits genuine browser fetches.
 */
import { describe, it, expect } from "vitest"
import { hasBrowserFetchMetadata } from "@/lib/drive-file-auth"

function fake(headers: Record<string, string>) {
    return {
        headers: {
            get(name: string): string | null {
                const v = headers[name.toLowerCase()]
                return typeof v === 'string' ? v : null
            },
        },
    } as { headers: { get(n: string): string | null } }
}

describe("hasBrowserFetchMetadata (S03)", () => {
    it("accepts Sec-Fetch-Site: same-origin", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-site': 'same-origin' }))).toBe(true)
    })

    it("accepts Sec-Fetch-Site: same-site", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-site': 'same-site' }))).toBe(true)
    })

    it("rejects Sec-Fetch-Site: cross-site", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-site': 'cross-site' }))).toBe(false)
    })

    it("rejects Sec-Fetch-Site: none", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-site': 'none' }))).toBe(false)
    })

    it("accepts Sec-Fetch-Dest: image (no Sec-Fetch-Site)", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-dest': 'image' }))).toBe(true)
    })

    it("accepts Sec-Fetch-Dest: document (no Sec-Fetch-Site)", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-dest': 'document' }))).toBe(true)
    })

    it("rejects Sec-Fetch-Dest: empty", () => {
        expect(hasBrowserFetchMetadata(fake({ 'sec-fetch-dest': 'empty' }))).toBe(false)
    })

    it("REGRESSION: rejects request with only Referer from our domain", () => {
        expect(hasBrowserFetchMetadata(fake({ 'referer': 'https://centralreform.live/perform/abc' }))).toBe(false)
    })

    it("REGRESSION: rejects request with only Accept: image/png", () => {
        expect(hasBrowserFetchMetadata(fake({ 'accept': 'image/png' }))).toBe(false)
    })

    it("REGRESSION: rejects request with only Accept: text/html", () => {
        expect(hasBrowserFetchMetadata(fake({ 'accept': 'text/html,application/xhtml+xml' }))).toBe(false)
    })

    it("REGRESSION: rejects request with only Accept: application/pdf", () => {
        expect(hasBrowserFetchMetadata(fake({ 'accept': 'application/pdf' }))).toBe(false)
    })

    it("rejects request with no headers", () => {
        expect(hasBrowserFetchMetadata(fake({}))).toBe(false)
    })
})
