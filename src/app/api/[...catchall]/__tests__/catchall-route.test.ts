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
 * Cycle-3 envelope foundation (`2b8762f97`) migrated the wire shape
 * from flat `error: <slug>` to rich `error: {code, machine_code,
 * message}`. Cycle-4 C4-023 additionally pins `error.code === 404` to
 * match the HTTP status line — without the `errorCode` override in the
 * catchall route, `codeFor("route_not_found")` falls through to the
 * 500 default since `route_not_found` isn't in `ERROR_CODE_MAP`. This
 * test file is updated in the same commit as the route fix.
 */

interface RichErrorBody {
    code: number
    machine_code: string
    message: string
}
function readBody(body: Record<string, unknown>): RichErrorBody {
    expect(typeof body.error).toBe("object")
    return body.error as RichErrorBody
}

function req(path: string, method = "GET"): NextRequest {
    return new NextRequest(new URL(path, "https://example.com"), {
        method,
    })
}

describe("/api/[...catchall] — route_not_found envelope", () => {
    it("GET unmatched /api/* path returns 404 rich envelope (envelope code matches HTTP status)", async () => {
        const r = await GET(req("/api/totally-unknown"))
        expect(r.status).toBe(404)
        const body = (await r.json()) as Record<string, unknown>
        expect(body.ok).toBe(false)
        const err = readBody(body)
        expect(err.machine_code).toBe("route_not_found")
        // C4-023: `error.code` must equal the HTTP status. Pre-fix this
        // was 500 (`codeFor` default for unmapped machine_codes).
        expect(err.code).toBe(404)
        expect(typeof err.message).toBe("string")
        expect(body.path).toBe("/api/totally-unknown")
        expect(body.method).toBe("GET")
        expect(typeof body.hint).toBe("string")
        expect(r.headers.get("Cache-Control")).toContain("no-store")
    })

    it("POST unmatched /api/* path returns 404 rich envelope with method echoed", async () => {
        const r = await POST(req("/api/admin/library-review", "POST"))
        expect(r.status).toBe(404)
        const body = (await r.json()) as Record<string, unknown>
        const err = readBody(body)
        expect(err.machine_code).toBe("route_not_found")
        expect(err.code).toBe(404)
        expect(body.method).toBe("POST")
        expect(body.path).toBe("/api/admin/library-review")
    })

    it("every method emits the same rich envelope shape with code:404", async () => {
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
            const err = readBody(body)
            expect(err.machine_code).toBe("route_not_found")
            expect(err.code).toBe(404)
            expect(body.method).toBe(method)
        }
    })

    it("envelope does NOT leak `errorCode` extras into the top-level wire body", async () => {
        // C4-023 implementation routes the 404 override via richError's
        // `extras.errorCode` field; the factory strips it from the
        // spread (it gets consumed into error.code). A wire-level
        // assertion guards against a future regression that lets it
        // shadow the top-level `path`/`method` extras.
        const r = await GET(req("/api/another-missing"))
        const body = (await r.json()) as Record<string, unknown>
        expect(body.errorCode).toBeUndefined()
    })
})
