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
    registerMintAdminBearerTools,
    registerSetlistReaderBearerTools,
    registerRosterTools,
    registerObservabilityTools,
    registerBatchIntakeTools,
    registerChartInboxTools,
    registerAuthoredChartTools,
} from "@/lib/mcp/tools"
import { wrapWithValidationRemap } from "@/lib/mcp/zod-envelope-remap"
import { withScopedBearer } from "@/lib/mcp/scoped-bearer-gate"
import { forSurface, type Surface } from "@/lib/mcp/surfaces"
import { logger } from "@/lib/logger"

/**
 * The MCP handler, built once per surface — audit item (p).
 *
 * Both servers are the SAME server with a different menu. Every registration,
 * every auth check and every response transform below was `route.ts` before
 * this file existed; the only new thing is `forSurface`, which decides which
 * tools get registered. Keeping one builder is the point: an auth fix or a
 * response-shape fix can never land on one surface and miss the other.
 *
 * Nothing here grants or removes a permission. Each tool keeps the gate it
 * already had — a tool absent from a surface is absent from that MENU, not from
 * the caller's rights.
 */

/**
 * W-01 Task 6: surface `.paul/AGENT-GUIDE.md` to MCP clients via the server's
 * `instructions` field. Claude Desktop displays this on connect so the agent
 * knows the propose → confirm → commit policy without waiting for the operator
 * to spell it out. Read once at module load. Failure is non-fatal.
 */
function loadAgentGuide(): string | undefined {
    try {
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

/**
 * What an ops client reads on connect instead of the authoring guide. The
 * authoring guide is about staging a service and confirming before committing;
 * none of that describes a backfill, and handing it to an ops agent would be
 * telling it the wrong thing confidently.
 */
const OPS_INSTRUCTIONS = `# centralreform.live — OPS surface

This is the operations server. It carries backfills, dedupe and salvage,
bond review, the AI enrichment queue, bridge housekeeping, observability
dumps, test accounts, and credential minting.

The authoring tools — setlists, tracks, templates, books, roster, library
search, chart upload, monitor mixing — are NOT here. They are on the default
server at /api/mcp. If you are building or editing a service, you are
connected to the wrong one.

Everything here is admin-gated and most of it is dryRun-default. Read the
dryRun output before you pass dryRun:false. Several of these tools are
one-shot migrations that have already run; running one again is rarely what
anybody wants.`

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
        // tokenId + parentTokenId are forwarded so admin-only tools
        // (mint_admin_bearer) can enforce root-only minting from the caller's
        // token identity. uid is the only field every other tool reads today;
        // orgId (v11-02-01) is forwarded so read/write tools can resolve the
        // caller's tenant via orgFrom(extra).
        extra: {
            uid: result.uid,
            tokenId: result.tokenId,
            parentTokenId: result.parentTokenId,
            orgId: result.orgId,
            // Scoped credentials (kind:"setlist_reader") carry an explicit
            // tool allow-list; null on every full-access bearer. The
            // withScopedBearer gate is the enforcement point — these extras
            // exist so tools can also read the caller's scope.
            kind: result.kind,
            allowedTools: result.allowedTools,
        },
    }
}

/**
 * Build the route handlers for one surface.
 *
 * `basePath` is what mcp-handler appends `/mcp` to, so the authoring server is
 * `/api` → `/api/mcp` (unchanged, because that is the URL in Daniel's Claude
 * Desktop config and it must keep working), and ops is `/api/ops` →
 * `/api/ops/mcp`.
 */
export function buildMcpHandler(surface: Surface, basePath: string) {
    const baseHandler = createMcpHandler(
        (rawServer) => {
            const server = forSurface(rawServer, surface)
            registerReadTools(server)
            registerWriteTools(server)
            registerMonitorTools(server)
            registerChartUploadTools(server)
            registerTestTokenTools(server)
            registerMintAdminBearerTools(server)
            registerSetlistReaderBearerTools(server)
            registerRosterTools(server)
            registerObservabilityTools(server)
            registerBatchIntakeTools(server)
            registerChartInboxTools(server)
            registerAuthoredChartTools(server)
        },
        {
            serverInfo: {
                name: surface === "ops" ? "centralreform-live-ops" : "centralreform-live",
                version: "1.0.0",
            },
            ...(surface === "ops"
                ? { instructions: OPS_INSTRUCTIONS }
                : agentGuide
                  ? { instructions: agentGuide }
                  : {}),
        },
        { basePath, disableSse: true, verboseLogs: false },
    )

    const authedHandler = withMcpAuth(baseHandler, verifyToken, { required: true })

    // `setlist_reader` gate (read-only, long-lived `crl_read_` credentials).
    // Wrapped INSIDE the Zod remap so a refusal we emit here still flows
    // through the same response pipeline, and so every allowed call keeps the
    // existing validation-error contract. Non-`crl_read_` bearers pass through.
    const scopedHandler = withScopedBearer(authedHandler)

    // F-02 (2026-05-16 bugstomp) + F-02-regression (v6): Zod validation
    // failures from inputSchema surface as JSON-RPC `-32602` protocol errors
    // BEFORE our tool handler runs, so a try/catch inside the handler cannot
    // translate them. Fix at the Response layer. The wrapper handles both
    // `application/json` JSON-RPC bodies AND `text/event-stream` SSE-framed
    // responses, which is what mcp-handler actually returns for tool calls.
    return wrapWithValidationRemap(scopedHandler)
}
