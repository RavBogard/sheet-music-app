import type { ErrorEvent } from "@sentry/nextjs"
import { describe, expect, it } from "vitest"
import { redactBearerTokens } from "../sentry-redact"

// ErrorEvent is heavily-typed (status, exception shape, …); these tests only
// care about the scrubbed string surfaces, so widen via `as ErrorEvent`.
const evt = (partial: Record<string, unknown>) => partial as unknown as ErrorEvent

describe("redactBearerTokens", () => {
    it("scrubs bearer in top-level message", () => {
        const out = redactBearerTokens(
            evt({
                message: "failed call with token crl_live_deadbeef0123456789abcdef",
            }),
        )
        expect(out.message).toBe("failed call with token crl_live_<redacted>")
    })

    it("scrubs bearer nested in extra + breadcrumbs", () => {
        const out = redactBearerTokens(
            evt({
                extra: {
                    url: "/api/mcp?token=crl_live_aabbccdd",
                    body: { auth: "Bearer crl_live_ffffffff" },
                },
                breadcrumbs: [
                    {
                        type: "http",
                        message: "GET /api/mcp with Bearer crl_live_1234567890ab",
                    },
                ],
            }),
        )
        const extra = out.extra as { url: string; body: { auth: string } }
        expect(extra.url).toBe("/api/mcp?token=crl_live_<redacted>")
        expect(extra.body.auth).toBe("Bearer crl_live_<redacted>")
        expect(out.breadcrumbs?.[0]?.message).toBe(
            "GET /api/mcp with Bearer crl_live_<redacted>",
        )
    })

    it("passes through events with no bearer tokens", () => {
        const event = { message: "hello", extra: { foo: 1, bar: [true] } }
        const out = redactBearerTokens(evt(event))
        expect(out).toEqual(event)
    })

    it("does not crash on undefined/null fields", () => {
        const out = redactBearerTokens(
            evt({
                message: undefined,
                extra: { ok: null, items: [null, "crl_live_aa", undefined] },
            }),
        )
        const extra = out.extra as { items: Array<string | null | undefined> }
        expect(extra.items[1]).toBe("crl_live_<redacted>")
    })

    it("redacts case-insensitively", () => {
        const out = redactBearerTokens(evt({ message: "CRL_LIVE_ABCDEF99" }))
        expect(out.message).toBe("crl_live_<redacted>")
    })
})
