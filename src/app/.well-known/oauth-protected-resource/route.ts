import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler"
import { originFromRequest } from "@/lib/mcp/oauth"

/**
 * RFC 9728 protected-resource metadata for the MCP server.
 *
 * `withMcpAuth` on /api/mcp emits `WWW-Authenticate: ... resource_metadata=
 * "<origin>/.well-known/oauth-protected-resource"`; an OAuth-capable MCP client
 * (Claude Desktop / web) fetches this to discover the authorization server.
 *
 * The protected resource is /api/mcp; the AS is this same origin.
 */

export function GET(req: Request): Response {
    const origin = originFromRequest(req)
    const handler = protectedResourceHandler({
        authServerUrls: [origin],
        resourceUrl: `${origin}/api/mcp`,
    })
    return handler(req)
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
