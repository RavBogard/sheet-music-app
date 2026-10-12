import { createMcpHandler, withMcpAuth } from "mcp-handler"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { verifyBearer } from "@/lib/mcp/auth"
import { mcpPublicOrigin } from "@/lib/mcp/public-origin"
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
    registerCollectionAdminTools,
} from "@/lib/mcp/tools"
import { wrapWithValidationRemap } from "@/lib/mcp/zod-envelope-remap"
import { withScopedBearer } from "@/lib/mcp/scoped-bearer-gate"
import { forSurface, type Surface } from "@/lib/mcp/surfaces"
import { withoutTools } from "@/lib/mcp/tenant-tools"
import { createTenantDispatcher } from "@/lib/mcp/tenant-dispatch"

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

// W-01 Task 6's `.paul/AGENT-GUIDE.md` read moved to agent-guide.ts in
// multi-tenant phase 4: authoring instructions are per tenant (CRC is still
// served that file unchanged), chosen by tenant-dispatch.ts.

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
 * Multi-tenant phase 4: one surface's mcp-handler with the given instructions,
 * minus `dropTools` (a tenant's switched-off features; empty for crc, BL, ops).
 */
function createSurfaceHandler(
    surface: Surface,
    basePath: string,
    instructions: string | undefined,
    dropTools: ReadonlySet<string> = new Set(),
) {
    return createMcpHandler(
        (rawServer) => {
            const server = withoutTools(forSurface(rawServer, surface), dropTools)
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
            registerCollectionAdminTools(server)
        },
        {
            serverInfo: {
                name: surface === "ops" ? "centralreform-live-ops" : "centralreform-live",
                version: "1.0.0",
            },
            ...(instructions ? { instructions } : {}),
        },
        { basePath, disableSse: true, verboseLogs: false },
    )
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
    // Multi-tenant phase 4: the authoring surface dispatches by the token's
    // tenant (req.auth, set by withMcpAuth below) to a cached handler with that
    // tenant's instructions and tool list. Ops keeps one handler.
    const baseHandler =
        surface === "authoring"
            ? createTenantDispatcher((plan) =>
                  createSurfaceHandler(surface, basePath, plan.instructions, plan.dropTools),
              )
            : createSurfaceHandler(surface, basePath, OPS_INSTRUCTIONS)

    // Multi-tenant phase 3: the 401 challenge's `resource_metadata` names the
    // request tenant's address (mcpPublicOrigin), the same origin the
    // .well-known metadata routes use.
    const authedHandler = async (req: Request): Promise<Response> =>
        withMcpAuth(baseHandler, verifyToken, { required: true, resourceUrl: await mcpPublicOrigin(req) })(req)

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
