import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { mcpPublicOrigin } from "@/lib/mcp/public-origin"

/**
 * RFC 9728 protected-resource metadata for the MCP server.
 *
 * `withMcpAuth` on /api/mcp emits `WWW-Authenticate: ... resource_metadata=
 * "<origin>/.well-known/oauth-protected-resource"`; an OAuth-capable MCP client
 * (Claude Desktop / web) fetches this to discover the authorization server.
 *
 * The protected resource is /api/mcp; the AS is this same origin. Multi-tenant
 * phase 3: the origin is the request tenant's address (mcpPublicOrigin) — the
 * host the client connected on when it is one of the tenant's own, otherwise
 * the tenant's canonical host.
 */

export async function GET(req: Request): Promise<Response> {
    const origin = await mcpPublicOrigin(req)
    const handler = protectedResourceHandler({
        authServerUrls: [origin],
        resourceUrl: `${origin}/api/mcp`,
    })
    return handler(req)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
