import { buildPlatformMcpHandler } from "@/lib/mcp/platform/handler"

/**
 * MCP route — the PLATFORM surface (multi-tenant phase 4).
 *
 * Endpoint: POST/GET /api/platform/mcp (basePath '/api/platform'). The
 * platform owner's tenant management tools (17), and nothing else. Accepts
 * only a platform bearer (`crl_plat_…`, from POST /api/platform/tokens) whose
 * owner is the platform owner, checked on every request. Tenant tokens are
 * refused here, and platform tokens are refused on /api/mcp and /api/ops/mcp.
 */

export const maxDuration = 60

const handler = buildPlatformMcpHandler("/api/platform")

export { handler as GET, handler as POST, handler as DELETE }
