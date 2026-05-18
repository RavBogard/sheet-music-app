import { describe, it, expect } from "vitest"

import {
    classifyCallerContext,
    selectUnauthHint,
} from "@/lib/http/caller-context"

/**
 * Cycle-5 C5B-006 — unauth-hint branch helper.
 *
 * Confirms the heuristic used to decide whether an unauth envelope's `hint`
 * should reference MCP / internal endpoints (rich) or stay generic ("Sign
 * in to continue."). Daniel-ratified rule: bearer-carrying OR in-app
 * Sec-Fetch-* requests get the rich hint; bare HTTP probes get the
 * generic one.
 */
function makeReq(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/probe", { headers })
}

describe("classifyCallerContext", () => {
    it("Authorization: Bearer → 'bearer'", () => {
        expect(
            classifyCallerContext(makeReq({ Authorization: "Bearer abc.def.ghi" })),
        ).toBe("bearer")
    })

    it("Sec-Fetch-Site: same-origin → 'in_app'", () => {
        expect(
            classifyCallerContext(
                makeReq({ "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "empty" }),
            ),
        ).toBe("in_app")
    })

    it("Sec-Fetch-Dest: document → 'in_app' (browser nav)", () => {
        expect(
            classifyCallerContext(makeReq({ "Sec-Fetch-Dest": "document" })),
        ).toBe("in_app")
    })

    it("no auth + no Sec-Fetch-* → 'bare'", () => {
        expect(classifyCallerContext(makeReq({}))).toBe("bare")
        expect(
            classifyCallerContext(makeReq({ "User-Agent": "curl/8.4.0" })),
        ).toBe("bare")
    })

    it("Sec-Fetch-Site: cross-site (or none) → 'bare'", () => {
        expect(
            classifyCallerContext(
                makeReq({ "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Dest": "empty" }),
            ),
        ).toBe("bare")
    })
})

describe("selectUnauthHint", () => {
    const RICH =
        "Mint a fresh test bearer via /api/mcp/oauth/mint-test-token or the MCP create_test_account tool."

    it("bearer caller → rich hint preserved", () => {
        expect(
            selectUnauthHint(makeReq({ Authorization: "Bearer xyz" }), RICH),
        ).toBe(RICH)
    })

    it("in-app caller → rich hint preserved", () => {
        expect(
            selectUnauthHint(makeReq({ "Sec-Fetch-Site": "same-origin" }), RICH),
        ).toBe(RICH)
    })

    it("bare HTTP caller → generic hint, MCP refs stripped", () => {
        const hint = selectUnauthHint(makeReq({}), RICH)
        expect(hint).toBe("Sign in to continue.")
        expect(hint).not.toMatch(/mcp/i)
        expect(hint).not.toMatch(/mint-test-token/)
    })

    it("bare HTTP caller honors custom genericHint override", () => {
        expect(
            selectUnauthHint(makeReq({}), RICH, "The requested resource is not available."),
        ).toBe("The requested resource is not available.")
    })
})
