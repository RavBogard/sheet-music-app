// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({})),
}))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { processChartUpload } from "@/lib/library-upload"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7 (lane D): every processChartUpload error carries its sentence as a
 * catalogue key + vars for the browser route; in English it must equal the
 * `error` the MCP tools return, byte for byte.
 */
describe("processChartUpload error i18n", () => {
    const base = { originalFileName: "test.pdf", uploaderUid: "u1", orgId: "crc" as const }
    const cases = [
        { name: "empty file", input: { ...base, buffer: Buffer.alloc(0), mimeType: "application/pdf" } },
        { name: "too large", input: { ...base, buffer: Buffer.alloc(25 * 1024 * 1024 + 1), mimeType: "application/pdf" } },
        { name: "octet-stream", input: { ...base, buffer: Buffer.from("x"), mimeType: "application/octet-stream" } },
        { name: "unsupported type", input: { ...base, buffer: Buffer.from("x"), mimeType: "text/x-unknown" } },
        { name: "unknown collection", input: { ...base, buffer: Buffer.from("x"), mimeType: "application/pdf", collection: "nope" } },
    ]
    for (const c of cases) {
        it(`${c.name}: English from the catalogue equals the lib's sentence; the pseudo-locale wraps it`, async () => {
            const r = await processChartUpload(c.input as never)
            expect(r.ok).toBe(false)
            if (r.ok || !r.i18n) throw new Error("expected a keyed error")
            expect(tForOrg("crc", "en")(r.i18n.key, r.i18n.vars)).toBe(r.error)
            expect(tForOrg("crc", "qps")(r.i18n.key, r.i18n.vars).startsWith("⟦")).toBe(true)
        })
    }
})
