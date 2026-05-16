import { createMcpHandler, withMcpAuth } from "mcp-handler"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { verifyBearer } from "@/lib/mcp/auth"
import {
    registerReadTools,
    registerWriteTools,
    registerMonitorTools,
    registerChartUploadTools,
} from "@/lib/mcp/tools"
import { remapValidationError } from "@/lib/mcp/zod-envelope-remap"

/**
 * MCP route — connects Claude (Desktop / web / Code) to centralreform.live.
 *
 * Endpoint: POST/GET /api/mcp (basePath '/api' → mcp-handler derives '/api/mcp').
 * Auth: per-user `crl_live_` bearer tokens via verifyBearer (NOT Firebase ID
 * tokens). withMcpAuth runs the verifier, stashes the resolved uid on
 * AuthInfo.extra, and the tool handlers read it from there.
 *
 * Phase 4a: read tools (list_setlists, get_setlist, search_library, get_song).
 * Phase 4b: write tools (create_setlist, update_setlist, add_track_to_setlist,
 * reorder_setlist, remove_track) — owner-scoped to the caller's own setlists.
 */

export const maxDuration = 60

const baseHandler = createMcpHandler(
    (server) => {
        registerReadTools(server)
        registerWriteTools(server)
        registerMonitorTools(server)
        registerChartUploadTools(server)
    },
    {
        serverInfo: { name: "centralreform-live", version: "1.0.0" },
    },
    {
        basePath: "/api",
        disableSse: true,
        verboseLogs: false,
    },
)

async function verifyToken(
    req: Request,
    bearerToken?: string,
): Promise<AuthInfo | undefined> {
    if (!bearerToken) return undefined
    const result = await verifyBearer(req)
    if (result instanceof Response) return undefined
    return {
        token: bearerToken,
        clientId: result.uid,
        scopes: [],
        extra: { uid: result.uid },
    }
}

const authedHandler = withMcpAuth(baseHandler, verifyToken, { required: true })

/**
 * F-02 (2026-05-16 bugstomp): Zod validation failures from inputSchema
 * surface as JSON-RPC `-32602` protocol errors BEFORE our tool handler
 * runs, so a try/catch inside the handler can't translate them. Fix at
 * the Response layer — intercept the JSON-RPC body on its way out and
 * rewrite `-32602` errors as a normal tool result with the standard
 * `{error: "..."}` envelope. Helper lives in
 * src/lib/mcp/zod-envelope-remap.ts so it's unit-testable (route.ts may
 * only export HTTP handlers per Next.js App Router rules).
 */
async function fixZodErrors(req: Request): Promise<Response> {
    const res = await authedHandler(req)
    const contentType = res.headers.get("content-type") ?? ""
    // Only JSON-RPC bodies can carry a -32602; HTML / SSE bodies pass.
    if (!contentType.includes("application/json")) return res
    const text = await res.clone().text()
    let body: unknown
    try {
        body = JSON.parse(text)
    } catch {
        return res
    }
    const fixed = remapValidationError(body)
    if (fixed === body) return res
    return new Response(JSON.stringify(fixed), {
        status: res.status,
        headers: res.headers,
    })
}

export { fixZodErrors as GET, fixZodErrors as POST, fixZodErrors as DELETE }
