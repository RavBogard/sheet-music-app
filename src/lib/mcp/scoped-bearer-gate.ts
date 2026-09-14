import { verifyBearer } from "@/lib/mcp/auth"
import { logger } from "@/lib/logger"
import { isSetlistReaderToken } from "@/lib/mcp/scoped-bearer"
import {
    SETLIST_READER_KIND,
    SETLIST_READER_TOOLS,
    evaluateScopedJsonRpc,
    filterToolsList,
    filterToolsListSseBody,
} from "@/lib/mcp/scoped-bearer"

/**
 * Request-layer gate for `crl_read_` scoped bearers.
 *
 * Lives outside `route.ts` because Next.js App Router only lets a route module
 * export HTTP handlers + segment config — the wrapper has to be importable by
 * unit tests (same reason `zod-envelope-remap` lives in its own module).
 *
 * Fast path: any Authorization bearer that does NOT start with `crl_read_`
 * falls straight through to the inner handler — no body clone, no extra
 * Firestore read, no behaviour change for the existing `crl_live_` fleet.
 *
 * Scoped path (`crl_read_…`):
 *   1. `verifyBearer` must accept it AND the token doc's `kind` must be
 *      `setlist_reader` — a `crl_read_`-prefixed token that is anything else
 *      (or unverifiable) gets a flat 401. A scoped prefix never grants more
 *      than the scoped kind.
 *   2. The JSON-RPC body is parsed and run through `evaluateScopedJsonRpc`.
 *      Out-of-scope calls are answered here, as `application/json`, without
 *      ever reaching the MCP server.
 *   3. In-scope calls proceed; a `tools/list` response is filtered down to the
 *      allow-list on the way out (JSON and SSE framing both).
 */

function unauthorized(): Response {
    return new Response("Unauthorized", { status: 401 })
}

function bearerFrom(req: Request): string | null {
    const header = req.headers.get("authorization")
    if (!header?.startsWith("Bearer ")) return null
    const raw = header.slice(7).trim()
    return raw || null
}

function isToolsListRequest(body: unknown): boolean {
    const one = (m: unknown) =>
        !!m &&
        typeof m === "object" &&
        (m as { method?: unknown }).method === "tools/list"
    return Array.isArray(body) ? body.some(one) : one(body)
}

export function withScopedBearer(
    handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
    return async (req: Request) => {
        const raw = bearerFrom(req)
        if (!isSetlistReaderToken(raw)) return handler(req)

        const verified = await verifyBearer(req)
        if (verified instanceof Response) return unauthorized()
        if (verified.kind !== SETLIST_READER_KIND) {
            logger.warn("[mcp-scope] crl_read_ bearer with wrong kind", {
                tokenId: verified.tokenId,
                kind: verified.kind,
            })
            return unauthorized()
        }

        const allowedTools =
            verified.allowedTools && verified.allowedTools.length > 0
                ? verified.allowedTools
                : [...SETLIST_READER_TOOLS]

        // Only POST carries a JSON-RPC body; GET/DELETE (transport plumbing)
        // have nothing to evaluate.
        let body: unknown = null
        if (req.method === "POST") {
            try {
                body = await req.clone().json()
            } catch {
                // Unparseable body — let the inner handler emit its own
                // protocol error rather than masking it.
                return handler(req)
            }
            const decision = evaluateScopedJsonRpc(body, allowedTools)
            if (!decision.allow) {
                logger.warn("[mcp-scope] refused out-of-scope call", {
                    tokenId: verified.tokenId,
                })
                return new Response(JSON.stringify(decision.response), {
                    status: 200,
                    headers: { "content-type": "application/json" },
                })
            }
        }

        const res = await handler(req)
        if (!isToolsListRequest(body)) return res

        const contentType = res.headers.get("content-type") ?? ""
        if (contentType.includes("application/json")) {
            const text = await res.clone().text()
            let parsed: unknown
            try {
                parsed = JSON.parse(text)
            } catch {
                return res
            }
            const filtered = filterToolsList(parsed, allowedTools)
            if (filtered === parsed) return res
            return new Response(JSON.stringify(filtered), {
                status: res.status,
                headers: res.headers,
            })
        }
        if (contentType.includes("text/event-stream")) {
            const text = await res.clone().text()
            const filtered = filterToolsListSseBody(text, allowedTools)
            if (filtered === text) return res
            return new Response(filtered, {
                status: res.status,
                headers: res.headers,
            })
        }
        return res
    }
}
