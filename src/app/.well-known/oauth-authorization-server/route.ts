import { metadataCorsOptionsRequestHandler } from "mcp-handler"
import { authorizationServerMetadata } from "@/lib/mcp/oauth"
import { mcpPublicOrigin } from "@/lib/mcp/public-origin"

/**
 * RFC 8414 authorization-server metadata. OAuth-capable MCP clients fetch this
 * (discovered via the protected-resource metadata) to learn the authorize /
 * token / register endpoints and that only PKCE S256 is supported.
 *
 * Multi-tenant phase 3: the issuer is the request tenant's address
 * (mcpPublicOrigin), not one env value.
 */

export async function GET(req: Request): Promise<Response> {
    const origin = await mcpPublicOrigin(req)
    return Response.json(authorizationServerMetadata(origin), {
        headers: { "Access-Control-Allow-Origin": "*" },
    })
}

export const OPTIONS = metadataCorsOptionsRequestHandler()
