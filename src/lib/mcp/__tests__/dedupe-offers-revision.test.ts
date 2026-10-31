import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: vi.fn(), getFirestore: vi.fn() }))

import { uploadFailureEnvelope } from "@/lib/mcp/tools/library-upload"

/** Bet 2 (MCP-19): a dedupe refusal offers revisionOf before force. */
describe("uploadFailureEnvelope on a duplicate", () => {
    it("lists every match and offers revisionOf first", () => {
        const env = uploadFailureEnvelope(
            {
                code: "duplicate_similar",
                status: 409,
                error: 'A chart with a similar name ("Adon Olam DRAFT") already exists in the library. Pass force: true to override if this is a legitimate variant.',
                matches: [
                    { fileId: "f1", title: "Adon Olam DRAFT", score: 0.9 },
                    { fileId: "f2", title: "Adon Olam", score: 0.87 },
                ],
            },
            { tool: "upload_chart" },
        ) as unknown as { ok: false; error: { machine_code: string; message: string }; matches: unknown[]; hint: string }
        expect(env.ok).toBe(false)
        expect(env.error.machine_code).toBe("duplicate_detected_in_library")
        expect(env.matches).toEqual([
            { fileId: "f1", title: "Adon Olam DRAFT", score: 0.9 },
            { fileId: "f2", title: "Adon Olam", score: 0.87 },
        ])
        expect(env.hint).toContain("revisionOf:<fileId>")
        expect(env.hint.indexOf("revisionOf")).toBeLessThan(env.hint.indexOf("force"))
        expect(env.error.message).not.toContain("force")
    })

    it("falls back to the single matched row", () => {
        const env = uploadFailureEnvelope(
            { code: "duplicate_exact", status: 409, error: "dup", matchedFileId: "f9", matchedTitle: "X", score: 1 },
            {},
        ) as unknown as { matches: unknown[] }
        expect(env.matches).toEqual([{ fileId: "f9", title: "X", score: 1 }])
    })
})
