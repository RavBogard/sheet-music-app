/**
 * Tests for request-id module + logger integration.
 * Locks the invariant that every API handler emission carries a traceable ID.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import {
    generateRequestId,
    validateInboundRequestId,
    runWithRequestId,
    getCurrentRequestId,
} from "@/lib/request-id"
import { logger } from "@/lib/logger"

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe("request-id: generateRequestId", () => {
    it("returns a 36-char UUIDv4", () => {
        const id = generateRequestId()
        expect(id).toHaveLength(36)
        expect(id).toMatch(UUID_V4_RE)
    })

    it("produces a fresh value each call", () => {
        expect(generateRequestId()).not.toBe(generateRequestId())
    })
})

describe("request-id: validateInboundRequestId", () => {
    it("accepts a simple safe id", () => {
        expect(validateInboundRequestId("abc123")).toBe("abc123")
    })

    it("accepts dashes and underscores", () => {
        expect(validateInboundRequestId("req_abc-123")).toBe("req_abc-123")
    })

    it("rejects null and undefined", () => {
        expect(validateInboundRequestId(null)).toBeNull()
        expect(validateInboundRequestId(undefined)).toBeNull()
    })

    it("rejects the empty string", () => {
        expect(validateInboundRequestId("")).toBeNull()
    })

    it("rejects strings longer than 128 chars", () => {
        expect(validateInboundRequestId("x".repeat(129))).toBeNull()
    })

    it("accepts exactly 128 chars", () => {
        expect(validateInboundRequestId("x".repeat(128))).toBe("x".repeat(128))
    })

    it("rejects control characters / header smuggling", () => {
        expect(validateInboundRequestId("bad\x00char")).toBeNull()
        expect(validateInboundRequestId("bad\nchar")).toBeNull()
        expect(validateInboundRequestId("bad char")).toBeNull()
    })
})

describe("request-id: AsyncLocalStorage round-trip", () => {
    it("getCurrentRequestId is undefined outside a scope", () => {
        expect(getCurrentRequestId()).toBeUndefined()
    })

    it("getCurrentRequestId returns the bound id inside runWithRequestId", () => {
        runWithRequestId("fixed-id-123", () => {
            expect(getCurrentRequestId()).toBe("fixed-id-123")
        })
        expect(getCurrentRequestId()).toBeUndefined()
    })

    it("scope survives across awaited promise continuations", async () => {
        await runWithRequestId("async-id", async () => {
            await Promise.resolve()
            expect(getCurrentRequestId()).toBe("async-id")
        })
    })
})

describe("logger: request-id annotation", () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("prepends [req=<id>] to string messages when inside a scope", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { /* silence */ })
        runWithRequestId("rid-warn", () => {
            logger.warn("something happened", { extra: 1 })
        })
        expect(spy).toHaveBeenCalledWith("[req=rid-warn] something happened", { extra: 1 })
    })

    it("merges requestId into a plain-object first arg", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ })
        runWithRequestId("rid-obj", () => {
            logger.error({ event: "boom", status: 500 })
        })
        expect(spy).toHaveBeenCalledWith({ event: "boom", status: 500, requestId: "rid-obj" })
    })

    it("does NOT annotate when no scope is active", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { /* silence */ })
        logger.error("bare error", 42)
        expect(spy).toHaveBeenCalledWith("bare error", 42)
    })
})
