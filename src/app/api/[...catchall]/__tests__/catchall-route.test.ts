import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import {
    GET,
    POST,
    PUT,
    PATCH,
    DELETE,
    HEAD,
    OPTIONS,
} from "../route"

/**
 * API-namespace JSON 404 catch-all unit tests. Asserts every HTTP
 * method returns a rich-envelope 404 with `machine_code: route_not_found`
 * and the request path echoed in the context so an agent or Claude
 * Desktop session can recover. Cycle-3 cowork.
 *
 * Cycle-4 C4-009 fixture-migration-tail: assertions updated from
 * flat `body.error === 'route_not_found'` to the rich-object shape
 * `body.error.machine_code === 'route_not_found'` that `richError`
 * produces (cycle-3 REG-002 envelope foundation @ 2b8762f97).
 */

function req(path: string, method = "GET"): NextRequest {
    return new NextRequest(new URL(path, "https://example.com"), {
        method,
    })
}

describe("/api/[...catchall] — route_not_found envelope", () => {
    it("GET unmatched /api/* path returns 404 rich envelope", async () => {
        const r = await GET(req("/api/totally-unknown"))
        expect(r.status).toBe(404)
        const body = (await r.json()) as Record<string, unknown>
        expect(body.ok).toBe(false)
        const errObj = body.error as { machine_code: string; message: string }
        expect(errObj.machine_code).toBe("route_not_found")
        expect(typeof errObj.message).toBe("string")
        expect(body.path).toBe("/api/totally-unknown")
        expect(body.method).toBe("GET")
        expect(typeof body.hint).toBe("string")
        expect(r.headers.get("Cache-Control")).toContain("no-store")
    })

    it("POST unmatched /api/* path returns 404 rich envelope with method echoed", async () => {
        const r = await POST(req("/api/admin/library-review", "POST"))
        expect(r.status).toBe(404)
        const body = (await r.json()) as Record<string, unknown>
        expect(body.method).toBe("POST")
        expect(body.path).toBe("/api/admin/library-review")
    })

    it("every method emits the same envelope shape", async () => {
        const handlers = [
            ["PUT", PUT],
            ["PATCH", PATCH],
            ["DELETE", DELETE],
            ["HEAD", HEAD],
            ["OPTIONS", OPTIONS],
        ] as const
        for (const [method, fn] of handlers) {
            const r = await fn(req(`/api/missing/${method.toLowerCase()}`, method))
            expect(r.status).toBe(404)
            if (method === "HEAD") {
                // HEAD responses may have no body per HTTP spec; we still
                // construct the JSON shape but the runtime may strip it.
                // Just assert the status + headers stayed correct.
                expect(r.headers.get("Cache-Control")).toContain("no-store")
                continue
            }
            const body = (await r.json()) as Record<string, unknown>
            const errObj = body.error as { machine_code: string }
            expect(errObj.machine_code).toBe("route_not_found")
            expect(body.method).toBe(method)
        }
    })
})
