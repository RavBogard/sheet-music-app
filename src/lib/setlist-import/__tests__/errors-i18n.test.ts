// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { extractDocumentText } from "../extract-document"
import { extractSetlistStructure } from "../extract-structure"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7 (lane D): the importer's lib errors carry their sentence as a
 * catalogue key + vars for the browser routes; in English it must equal the
 * lib's `message` byte for byte.
 */
const en = tForOrg("crc", "en")
const qps = tForOrg("crc", "qps")

describe("setlist-import error i18n", () => {
    it("extractDocumentText: unsupported format and empty document", async () => {
        for (const [buf, name] of [[Buffer.from("x"), "outline.xyz"], [Buffer.from("   "), "outline.txt"]] as const) {
            const r = await extractDocumentText(buf, { fileName: name })
            expect(r.ok).toBe(false)
            if (r.ok || !r.i18n) throw new Error("expected a keyed error")
            expect(en(r.i18n.key, r.i18n.vars)).toBe(r.message)
            expect(qps(r.i18n.key, r.i18n.vars).startsWith("⟦")).toBe(true)
        }
    })

    it("extractSetlistStructure: no text", async () => {
        const r = await extractSetlistStructure("   ")
        expect(r.ok).toBe(false)
        if (r.ok || !r.i18n) throw new Error("expected a keyed error")
        expect(en(r.i18n.key, r.i18n.vars)).toBe(r.message)
    })

    it("the remaining keys' English matches the lib's literal sentences", () => {
        expect(en("api-setlists.extractPdfPageLimit", { maxPages: 50 })).toBe("PDF exceeds the 50-page limit.")
        expect(en("api-setlists.extractFailed", { format: "pdf" })).toBe("Failed to extract text from pdf document.")
        expect(en("api-setlists.structureAiFailed")).toBe("Gemini structured extraction failed.")
        expect(en("api-setlists.structureAiEmpty")).toBe("Gemini returned an empty response.")
        expect(en("api-setlists.structureAiNotJson")).toBe("Gemini returned output that is not valid JSON.")
        expect(en("api-setlists.structureAiMismatch", { detail: "a: b" })).toBe("Gemini output did not match the expected setlist structure: a: b")
    })
})
