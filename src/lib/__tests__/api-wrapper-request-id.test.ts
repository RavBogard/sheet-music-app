/**
 * Tests for request-id propagation through createApiHandler.
 * Locks:
 *   - every response carries x-request-id (success, validation error, thrown error, auth failure)
 *   - inbound header is echoed when valid, replaced when invalid
 *   - apiError() body carries requestId
 *   - handlers can read getCurrentRequestId() during execution
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"
import { z } from "zod"

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    verifyIdToken: vi.fn(async () => ({ uid: "u-1", email: "a@b.c", role: "musician" })),
    getFirestore: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { makeReq } from "@/__tests__/api-test-helpers"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { getCurrentRequestId } from "@/lib/request-id"

describe("createApiHandler: request-id propagation", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("success response carries x-request-id header", async () => {
        const handler = createApiHandler(async () => NextResponse.json({ ok: true }))
        const req = makeReq("/api/x", { token: "t" })
        const res = await handler(req as never)

        const rid = res.headers.get("x-request-id")
        expect(rid).toBeTruthy()
        expect(rid).toMatch(/^[0-9a-f-]{36}$/i)
    })

    it("echoes a valid inbound x-request-id", async () => {
        const handler = createApiHandler(async () => NextResponse.json({ ok: true }))
        const req = makeReq("/api/x", { token: "t", headers: { "x-request-id": "client_abc-123" } })
        const res = await handler(req as never)
        expect(res.headers.get("x-request-id")).toBe("client_abc-123")
    })

    it("replaces an invalid inbound x-request-id with a fresh UUID", async () => {
        const handler = createApiHandler(async () => NextResponse.json({ ok: true }))
        const req = makeReq("/api/x", { token: "t", headers: { "x-request-id": "bad value with spaces" } })
        const res = await handler(req as never)
        const rid = res.headers.get("x-request-id")
        expect(rid).not.toBe("bad value with spaces")
        expect(rid).toMatch(/^[0-9a-f-]{36}$/i)
    })

    it("validation-error response body has requestId and matching header", async () => {
        const schema = z.object({ must: z.string() })
        const handler = createApiHandler(async () => NextResponse.json({ ok: true }), { schema })
        const req = makeReq("/api/x", { token: "t", method: "POST", body: { wrong: 1 } })
        const res = await handler(req as never)

        expect(res.status).toBe(400)
        const body = await res.json()
        const headerId = res.headers.get("x-request-id")
        expect(headerId).toBeTruthy()
        expect(body.requestId).toBe(headerId)
        expect(body.code).toBe("VALIDATION_ERROR")
    })

    it("thrown-handler error returns 500 with requestId in body + header", async () => {
        const handler = createApiHandler(async () => {
            throw new Error("boom")
        })
        const req = makeReq("/api/x", { token: "t" })
        const res = await handler(req as never)
        expect(res.status).toBe(500)
        const body = await res.json()
        const headerId = res.headers.get("x-request-id")
        expect(headerId).toBeTruthy()
        expect(body.requestId).toBe(headerId)
        expect(body.code).toBe("INTERNAL_ERROR")
    })

    it("auth failure (no token) still carries x-request-id header", async () => {
        const handler = createApiHandler(async () => NextResponse.json({ ok: true }))
        // No token → 401
        const req = makeReq("/api/x", {})
        const res = await handler(req as never)
        expect(res.status).toBe(401)
        expect(res.headers.get("x-request-id")).toBeTruthy()
    })

    it("handler can read getCurrentRequestId() during execution", async () => {
        let seen: string | undefined
        const handler = createApiHandler(async () => {
            seen = getCurrentRequestId()
            return NextResponse.json({ ok: true })
        })
        const req = makeReq("/api/x", { token: "t", headers: { "x-request-id": "known-id" } })
        const res = await handler(req as never)
        expect(seen).toBe("known-id")
        expect(res.headers.get("x-request-id")).toBe("known-id")
    })

    it("apiError() called inside ALS scope includes requestId in body", async () => {
        const handler = createApiHandler(async () => apiError("nope", 403, "FORBIDDEN"))
        const req = makeReq("/api/x", { token: "t", headers: { "x-request-id": "rid-403" } })
        const res = await handler(req as never)
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.requestId).toBe("rid-403")
        expect(body.error).toBe("nope")
        expect(body.code).toBe("FORBIDDEN")
    })

    it("apiError() called outside ALS scope omits requestId (backward compatible)", async () => {
        const res = apiError("standalone", 400)
        const body = await res.json()
        expect(body.error).toBe("standalone")
        expect(body.requestId).toBeUndefined()
        expect(res.headers.get("x-request-id")).toBeNull()
    })
})
