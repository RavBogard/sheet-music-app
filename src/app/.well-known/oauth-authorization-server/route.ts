import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { originFromRequest, authorizationServerMetadata } from "@/lib/mcp/oauth"

/**
 * RFC 8414 authorization-server metadata. OAuth-capable MCP clients fetch this
 * (discovered via the protected-resource metadata) to learn the authorize /
 * token / register endpoints and that only PKCE S256 is supported.
 */

export function GET(req: Request): Response {
    const origin = originFromRequest(req)
    return Response.json(authorizationServerMetadata(origin), {
        headers: { "Access-Control-Allow-Origin": "*" },
    })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
