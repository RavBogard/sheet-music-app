import { describe, it, expect } from "vitest"
import { upstashRestCredentials } from "../upstash-env"

/**
 * R6-b. The public chart path fails CLOSED when there is no distributed
 * limiter, so "are these credentials present" is a security decision, not a
 * convenience. The cases that matter are the half-configured ones.
 */
describe("upstashRestCredentials", () => {
    it("finds nothing when neither pair is set", () => {
        expect(upstashRestCredentials({})).toBeNull()
    })

    it("reads the documented UPSTASH_ pair", () => {
        expect(
            upstashRestCredentials({
                UPSTASH_REDIS_REST_URL: "https://a.upstash.io",
                UPSTASH_REDIS_REST_TOKEN: "tok-a",
            }),
        ).toEqual({ url: "https://a.upstash.io", token: "tok-a", source: "UPSTASH_REDIS_REST_URL" })
    })

    it("reads the KV_ pair the Vercel marketplace provisions", () => {
        expect(
            upstashRestCredentials({
                KV_REST_API_URL: "https://b.upstash.io",
                KV_REST_API_TOKEN: "tok-b",
            }),
        ).toEqual({ url: "https://b.upstash.io", token: "tok-b", source: "KV_REST_API_URL" })
    })

    it("never mixes a url from one source with a token from the other", () => {
        // This is the failure the pair rule exists for: it would look
        // configured and authenticate against nothing.
        expect(
            upstashRestCredentials({
                UPSTASH_REDIS_REST_URL: "https://a.upstash.io",
                KV_REST_API_TOKEN: "tok-b",
            }),
        ).toBeNull()
        expect(
            upstashRestCredentials({
                KV_REST_API_URL: "https://b.upstash.io",
                UPSTASH_REDIS_REST_TOKEN: "tok-a",
            }),
        ).toBeNull()
    })

    it("prefers the explicit UPSTASH_ pair when both are complete", () => {
        expect(
            upstashRestCredentials({
                UPSTASH_REDIS_REST_URL: "https://a.upstash.io",
                UPSTASH_REDIS_REST_TOKEN: "tok-a",
                KV_REST_API_URL: "https://b.upstash.io",
                KV_REST_API_TOKEN: "tok-b",
            })?.url,
        ).toBe("https://a.upstash.io")
    })

    it("treats whitespace-only values as absent", () => {
        // A variable set to an empty string is how a switch gets turned off by
        // hand, and a trailing newline is how one gets set by a pipe.
        expect(
            upstashRestCredentials({
                UPSTASH_REDIS_REST_URL: "  ",
                UPSTASH_REDIS_REST_TOKEN: "tok-a",
            }),
        ).toBeNull()
        expect(
            upstashRestCredentials({
                KV_REST_API_URL: " https://b.upstash.io\n",
                KV_REST_API_TOKEN: "tok-b\n",
            }),
        ).toEqual({ url: "https://b.upstash.io", token: "tok-b", source: "KV_REST_API_URL" })
    })
})
