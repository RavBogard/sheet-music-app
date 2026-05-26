import { describe, expect, it } from "vitest"

import { formatError } from "@/lib/format-error"
import { richError } from "@/lib/mcp/errors"

describe("formatError", () => {
    describe("string input", () => {
        it("returns the string as-is", () => {
            expect(formatError("Network down")).toBe("Network down")
        })

        it("returns empty string as-is (caller's choice; we don't paper over it)", () => {
            // Some callsites `throw ""` to signal something specific; preserve.
            expect(formatError("")).toBe("")
        })
    })

    describe("Error instance", () => {
        it("returns .message for a plain Error", () => {
            expect(formatError(new Error("boom"))).toBe("boom")
        })

        it("returns .message for an Error subclass (TypeError)", () => {
            expect(formatError(new TypeError("not a function"))).toBe("not a function")
        })

        it("returns the empty .message of an Error verbatim", () => {
            // Without this, an Error("") could regress to "Unknown error".
            expect(formatError(new Error(""))).toBe("")
        })
    })

    describe("RichErrorEnvelope shape", () => {
        it("extracts inner error.message", () => {
            const envelope = {
                ok: false,
                error: { code: 422, machine_code: "bad_input", message: "Field foo is required" },
            }
            expect(formatError(envelope)).toBe("Field foo is required")
        })

        it("matches a real richError() output", () => {
            const e = richError("stale_version", "Resource was updated")
            expect(formatError(e)).toBe("Resource was updated")
        })

        it("falls through to 'Unknown error' when ok:false but error.message is missing", () => {
            // Nested error object with no message — the dispatch's explicit case.
            expect(formatError({ ok: false, error: {} })).toBe("Unknown error")
        })

        it("falls through to 'Unknown error' when ok:false but error is not an object", () => {
            expect(formatError({ ok: false, error: "not-rich" })).toBe("Unknown error")
        })

        it("falls through to 'Unknown error' when ok:false but error.message is not a string", () => {
            expect(formatError({ ok: false, error: { message: 42 } })).toBe("Unknown error")
        })

        it("does NOT match when ok is not exactly false (e.g. ok: undefined)", () => {
            // `{ error: { message } }` without ok:false isn't an envelope; we
            // should still find the bare .message via the plain-message branch.
            expect(formatError({ error: { message: "ignored" } })).toBe("Unknown error")
        })
    })

    describe("plain { message: string } object", () => {
        it("extracts top-level .message", () => {
            expect(formatError({ message: "HTTP 503 service unavailable" })).toBe(
                "HTTP 503 service unavailable",
            )
        })

        it("ignores message when it is not a string", () => {
            expect(formatError({ message: 123 })).toBe("Unknown error")
        })

        it("ignores empty .message and falls through to 'Unknown error'", () => {
            // We treat empty as missing so the user sees *something* useful.
            expect(formatError({ message: "" })).toBe("Unknown error")
        })

        it("prefers envelope.error.message over top-level message when both exist", () => {
            // Envelope branch fires first because ok:false is set.
            expect(
                formatError({
                    ok: false,
                    error: { message: "inner" },
                    message: "top-level",
                }),
            ).toBe("inner")
        })
    })

    describe("unknown / unrecognized shapes return 'Unknown error'", () => {
        it("null → 'Unknown error'", () => {
            expect(formatError(null)).toBe("Unknown error")
        })

        it("undefined → 'Unknown error'", () => {
            expect(formatError(undefined)).toBe("Unknown error")
        })

        it("empty object {} → 'Unknown error'", () => {
            expect(formatError({})).toBe("Unknown error")
        })

        it("number → 'Unknown error' (we don't stringify primitives)", () => {
            // 42 here would historically have rendered as "42" via String() —
            // formatError is deliberately stricter to avoid leaking opaque
            // numeric error codes to users.
            expect(formatError(42)).toBe("Unknown error")
        })

        it("boolean → 'Unknown error'", () => {
            expect(formatError(true)).toBe("Unknown error")
            expect(formatError(false)).toBe("Unknown error")
        })

        it("array → 'Unknown error' even if elements have messages", () => {
            expect(formatError([{ message: "first" }])).toBe("Unknown error")
        })
    })

    describe("regression — no '[object Object]' anywhere", () => {
        // The whole point of this util. If any branch ever produces
        // "[object Object]", this regression suite catches it.
        const cases: Array<unknown> = [
            { ok: false, error: { message: "real" } },
            { ok: false, error: {} },
            { message: "nested" },
            { foo: "bar" },
            new Error("classic"),
            null,
            undefined,
            42,
            [],
            { ok: false, error: { code: 500 } },
        ]
        for (const c of cases) {
            it(`does not return '[object Object]' for ${JSON.stringify(c) ?? String(c)}`, () => {
                expect(formatError(c)).not.toContain("[object Object]")
            })
        }
    })
})
