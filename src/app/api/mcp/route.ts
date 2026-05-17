import fs from "node:fs"
import path from "node:path"
import { createMcpHandler, withMcpAuth } from "mcp-handler"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { verifyBearer } from "@/lib/mcp/auth"
import {
    registerReadTools,
    registerWriteTools,
    registerMonitorTools,
    registerChartUploadTools,
    registerTestTokenTools,
    registerRosterTools,
} from "@/lib/mcp/tools"
import { wrapWithValidationRemap } from "@/lib/mcp/zod-envelope-remap"
import { logger } from "@/lib/logger"

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

/**
 * W-01 Task 6: surface `.paul/AGENT-GUIDE.md` to MCP clients via the
 * server's `instructions` field. Claude Desktop displays this on connect
 * so the agent knows the propose → confirm → commit policy without
 * waiting for the operator to spell it out. Read once at module load
 * (handler factory is invoked at cold start; the guide doesn't change
 * inside a single function instance).
 *
 * Lookup walks up from cwd to find `.paul/AGENT-GUIDE.md` because the
 * file lives one directory above `src/` in the deployed bundle. Failure
 * is non-fatal — the server still boots, just without the guide.
 */
function loadAgentGuide(): string | undefined {
    try {
        // Vercel runs from the project root; locally `next dev` does too.
        // `.paul/` is checked into the repo and packaged.
        const candidates = [
            path.join(process.cwd(), ".paul", "AGENT-GUIDE.md"),
            path.join(process.cwd(), "sheet-music-app", ".paul", "AGENT-GUIDE.md"),
        ]
        for (const p of candidates) {
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf8")
        }
    } catch (err) {
        logger.warn("[mcp] failed to load AGENT-GUIDE.md for instructions", err)
    }
    return undefined
}

const agentGuide = loadAgentGuide()

const baseHandler = createMcpHandler(
    (server) => {
        registerReadTools(server)
        registerWriteTools(server)
        registerMonitorTools(server)
        registerChartUploadTools(server)
        registerTestTokenTools(server)
        registerRosterTools(server)
    },
    {
        serverInfo: { name: "centralreform-live", version: "1.0.0" },
        ...(agentGuide ? { instructions: agentGuide } : {}),
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
 * F-02 (2026-05-16 bugstomp) + F-02-regression (v6 2026-05-16): Zod
 * validation failures from inputSchema surface as JSON-RPC `-32602`
 * protocol errors BEFORE our tool handler runs, so a try/catch inside
 * the handler can't translate them. Fix at the Response layer.
 *
 * `wrapWithValidationRemap` handles both `application/json` JSON-RPC
 * bodies AND `text/event-stream` SSE-framed responses (which is what
 * mcp-handler's WebStandardStreamableHTTPServerTransport actually
 * returns for tool calls — the v5 fix only handled JSON and silently
 * no-op'd for every real tool invocation). The wrapper + transforms
 * live in src/lib/mcp/zod-envelope-remap.ts so they're unit-testable
 * (route.ts may only export HTTP handlers per Next.js App Router
 * rules).
 */
const fixZodErrors = wrapWithValidationRemap(authedHandler)

export { fixZodErrors as GET, fixZodErrors as POST, fixZodErrors as DELETE }
