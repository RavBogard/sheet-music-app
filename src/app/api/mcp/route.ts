import { createMcpHandler, withMcpAuth } from "mcp-handler"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { verifyBearer } from "@/lib/mcp/auth"
import { registerReadTools } from "@/lib/mcp/tools"

/**
 * MCP route — connects Claude (Desktop / web / Code) to centralreform.live.
 *
 * Endpoint: POST/GET /api/mcp (basePath '/api' → mcp-handler derives '/api/mcp').
 * Auth: per-user `crl_live_` bearer tokens via verifyBearer (NOT Firebase ID
 * tokens). withMcpAuth runs the verifier, stashes the resolved uid on
 * AuthInfo.extra, and the tool handlers read it from there.
 *
 * Phase 4a: read tools only (list_setlists, get_setlist, search_library,
 * get_song). Write tools are added in Phase 4b after reads are verified
 * end-to-end.
 */

export const maxDuration = 60

const baseHandler = createMcpHandler(
    (server) => {
        registerReadTools(server)
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

const handler = withMcpAuth(baseHandler, verifyToken, { required: true })

export { handler as GET, handler as POST, handler as DELETE }
