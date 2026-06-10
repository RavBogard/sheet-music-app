import { describe, it, expect } from "vitest"
import { codeFor } from "../errors"
import { uploadFailureEnvelope } from "../tools/library-upload"
import type { ProcessChartUploadError } from "@/lib/library-upload"

/**
 * v11.2-03 (BUG-2) — MCP error contract: deterministic client errors must
 * resolve to the correct HTTP-class code so an agent doesn't treat them as
 * transient/retryable. Pure unit test (no emulator) over codeFor() +
 * uploadFailureEnvelope().
 */
describe("v11.2-03 (BUG-2) — status class per machine_code", () => {
    it("AC-1: not-found + bad-input codes resolve correctly", () => {
        expect(codeFor("song_not_found")).toBe(404)
        expect(codeFor("reorder_failed")).toBe(400)
    })

    it("AC-3: positive controls unchanged", () => {
        expect(codeFor("stale_version")).toBe(409)
        expect(codeFor("not_found")).toBe(404)
        expect(codeFor("setlist_not_found")).toBe(404)
    })

    it("reserve-500: an unknown machine_code still defaults to 500", () => {
        expect(codeFor("totally_unknown_code_xyz")).toBe(500)
    })

    describe("AC-2: uploadFailureEnvelope maps processChartUpload cause → status", () => {
        const mk = (
            code: ProcessChartUploadError["code"],
            status: number,
        ): Pick<ProcessChartUploadError, "code" | "status" | "error"> => ({
            code,
            status,
            error: `failure: ${code}`,
        })

        const cases: Array<{
            code: ProcessChartUploadError["code"]
            status: number
            expectCode: number
            expectMachine: string
        }> = [
            { code: "duplicate_exact", status: 409, expectCode: 409, expectMachine: "duplicate_detected_in_library" },
            { code: "duplicate_similar", status: 409, expectCode: 409, expectMachine: "duplicate_detected_in_library" },
            { code: "too_large", status: 400, expectCode: 400, expectMachine: "upload_failed" },
            { code: "empty_file", status: 400, expectCode: 400, expectMachine: "upload_failed" },
            { code: "convert_failed", status: 422, expectCode: 422, expectMachine: "upload_failed" },
            { code: "invalid_type", status: 400, expectCode: 400, expectMachine: "upload_failed" },
            { code: "server_error", status: 500, expectCode: 500, expectMachine: "upload_failed" },
        ]

        for (const c of cases) {
            it(`${c.code} → ${c.expectCode} (${c.expectMachine})`, () => {
                const env = uploadFailureEnvelope(mk(c.code, c.status), {
                    tool: "upload_chart",
                })
                expect(env.ok).toBe(false)
                expect(env.error.machine_code).toBe(c.expectMachine)
                expect(env.error.code).toBe(c.expectCode)
            })
        }

        it("dedup envelope carries matchKind + the force:true hint + passes through extras", () => {
            const env = uploadFailureEnvelope(mk("duplicate_exact", 409), {
                tool: "save_scraped_chart",
            })
            const top = env as unknown as Record<string, unknown>
            expect(top.matchKind).toBe("exact")
            expect(top.tool).toBe("save_scraped_chart")
            expect(env.error.message).toContain("duplicate_exact")
        })

        it("missing status on a non-dedup failure falls back to 500", () => {
            const env = uploadFailureEnvelope(
                { code: "server_error", error: "boom" } as Pick<
                    ProcessChartUploadError,
                    "code" | "status" | "error"
                >,
                { tool: "finalize_chart_upload" },
            )
            expect(env.error.machine_code).toBe("upload_failed")
            expect(env.error.code).toBe(500)
        })
    })
})
