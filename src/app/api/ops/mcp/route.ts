import { buildMcpHandler } from "@/lib/mcp/build-handler"

/**
 * MCP route — the OPS surface (audit item (p), 2026-09-20).
 *
 * Endpoint: POST/GET /api/ops/mcp (basePath '/api/ops' → mcp-handler derives
 * '/api/ops/mcp'). Connect this as a SECOND Claude Desktop connector when you
 * need it; the authoring server at `/api/mcp` is unchanged and is the one to
 * leave connected.
 *
 * It carries the jobs done once and then not again for months: backfills and
 * one-shot migrations, dedupe and salvage, bond review, the AI enrichment
 * queue, bridge housekeeping, observability dumps, test accounts, and
 * credential minting.
 *
 * SAME AUTH, SAME GATES. This is not a privilege boundary and must not be
 * mistaken for one. Every tool here is already admin-gated and most are
 * `dryRun`-default; the same `crl_live_` bearer reaches both servers, and a
 * caller who could not run a backfill before still cannot. What changed is
 * that an agent building a service is no longer choosing from a menu with
 * `cleanup_all_test_data` on it.
 */

export const maxDuration = 60

const handler = buildMcpHandler("ops", "/api/ops")

export { handler as GET, handler as POST, handler as DELETE }
