import { buildMcpHandler } from "@/lib/mcp/build-handler"

/**
 * MCP route — connects Claude (Desktop / web / Code) to centralreform.live.
 *
 * Endpoint: POST/GET /api/mcp (basePath '/api' → mcp-handler derives
 * '/api/mcp'). This URL is in Daniel's Claude Desktop config and does not
 * change.
 *
 * Auth: per-user `crl_live_` bearer tokens via verifyBearer (NOT Firebase ID
 * tokens). See `@/lib/mcp/build-handler` — every server shares one builder so
 * an auth or response-shape fix cannot land on one surface and miss the other.
 *
 * THIS IS THE AUTHORING SURFACE (audit item (p), 2026-09-20). It carries the
 * week's work: setlists, tracks, templates, books, roster, library search,
 * chart upload, monitor mixing. Backfills, dedupe and salvage, bond review,
 * the AI enrichment queue, bridge housekeeping, observability dumps, test
 * accounts and credential minting moved to the ops server at `/api/ops/mcp`.
 *
 * Nothing changed about who may call what. Every tool kept its own gate; this
 * is about the menu an agent picks from, which was 144 items long for "add Kol
 * Nidre to Friday". The split is one table — `@/lib/mcp/surfaces`.
 */

export const maxDuration = 60

const handler = buildMcpHandler("authoring", "/api")

export { handler as GET, handler as POST, handler as DELETE }
