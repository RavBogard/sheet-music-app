import { describe, it, expect } from "vitest"
import { createHash, randomBytes } from "crypto"

import {
    verifyPkceS256,
    originFromRequest,
    authorizationServerMetadata,
} from "../oauth"

/**
 * MCP OAuth — pure-logic unit tests (no Firestore).
 *
 * PKCE S256 verification, request-origin derivation, and AS metadata shape.
 * The Firestore-backed client/code stores and the full register → authorize →
 * token round-trip are covered in mcp-oauth-flow.emulator.test.ts.
 */

function s256(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url")
}

describe("verifyPkceS256", () => {
    it("accepts a matching verifier/challenge pair", () => {
        const verifier = randomBytes(32).toString("base64url")
        expect(verifyPkceS256(verifier, s256(verifier))).toBe(true)
    })

    it("rejects a mismatched verifier", () => {
        const challenge = s256(randomBytes(32).toString("base64url"))
        expect(verifyPkceS256(randomBytes(32).toString("base64url"), challenge)).toBe(false)
    })

    it("rejects empty inputs", () => {
        expect(verifyPkceS256("", "")).toBe(false)
        expect(verifyPkceS256("verifier", "")).toBe(false)
        expect(verifyPkceS256("", "challenge")).toBe(false)
    })

    it("rejects a plain (non-hashed) verifier passed as the challenge", () => {
        const verifier = randomBytes(32).toString("base64url")
        // A client that wrongly sent `plain` PKCE would put the verifier itself
        // in code_challenge — must not validate against S256.
        expect(verifyPkceS256(verifier, verifier)).toBe(false)
    })
})

describe("originFromRequest", () => {
    it("prefers x-forwarded-host + x-forwarded-proto", () => {
        const req = new Request("http://internal.local/whatever", {
            headers: {
                "x-forwarded-proto": "https",
                "x-forwarded-host": "www.centralreform.live",
                host: "internal.local",
            },
        })
        expect(originFromRequest(req)).toBe("https://www.centralreform.live")
    })

    it("falls back to host with an https proto default", () => {
        const req = new Request("http://example.test/x", {
            headers: { host: "example.test" },
        })
        expect(originFromRequest(req)).toBe("https://example.test")
    })

    it("falls back to the canonical host when no host headers are present", () => {
        const req = new Request("http://example.test/x")
        expect(originFromRequest(req)).toBe("https://www.centralreform.live")
    })
})

describe("authorizationServerMetadata", () => {
    const meta = authorizationServerMetadata("https://www.centralreform.live")

    it("advertises this origin as the issuer", () => {
        expect(meta.issuer).toBe("https://www.centralreform.live")
    })

    it("points at the /api/mcp/oauth/* endpoints", () => {
        expect(meta.authorization_endpoint).toBe(
            "https://www.centralreform.live/api/mcp/oauth/authorize",
        )
        expect(meta.token_endpoint).toBe(
            "https://www.centralreform.live/api/mcp/oauth/token",
        )
        expect(meta.registration_endpoint).toBe(
            "https://www.centralreform.live/api/mcp/oauth/register",
        )
    })

    it("supports only the authorization_code grant with PKCE S256", () => {
        expect(meta.grant_types_supported).toEqual(["authorization_code"])
        expect(meta.response_types_supported).toEqual(["code"])
        expect(meta.code_challenge_methods_supported).toEqual(["S256"])
        expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"])
    })
})
