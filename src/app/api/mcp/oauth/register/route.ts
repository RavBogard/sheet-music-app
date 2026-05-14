import { NextResponse, type NextRequest } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { registerClient } from "@/lib/mcp/oauth"
import { logger } from "@/lib/logger"

/**
 * Dynamic Client Registration (RFC 7591).
 *
 * POST /api/mcp/oauth/register — an OAuth-capable MCP client (Claude Desktop /
 * web) self-registers before the authorization flow. We only support public
 * PKCE clients, so no `client_secret` is issued.
 *
 * Unauthenticated by design (RFC 7591 open registration). Rate-limited; input
 * is strictly validated (redirect_uris must be https or loopback).
 */

const CORS = { "Access-Control-Allow-Origin": "*" }

export function OPTIONS(): Response {
    return new Response(null, {
        headers: {
            ...CORS,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    })
}

export async function POST(req: NextRequest): Promise<Response> {
    const limited = await checkRateLimit(req, "api")
    if (limited) return limited

    if (!initAdmin()) {
        return NextResponse.json({ error: "server_error" }, { status: 500, headers: CORS })
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: "invalid_client_metadata", error_description: "body must be JSON" },
            { status: 400, headers: CORS },
        )
    }

    try {
        const client = await registerClient({
            redirectUris: body.redirect_uris,
            clientName: body.client_name,
        })
        return NextResponse.json(
            {
                client_id: client.clientId,
                redirect_uris: client.redirectUris,
                client_name: client.clientName ?? undefined,
                token_endpoint_auth_method: "none",
                grant_types: ["authorization_code"],
                response_types: ["code"],
            },
            { status: 201, headers: CORS },
        )
    } catch (e) {
        const msg = e instanceof Error ? e.message : "invalid request"
        logger.warn("[mcp-oauth] registration rejected", { reason: msg })
        return NextResponse.json(
            { error: "invalid_client_metadata", error_description: msg },
            { status: 400, headers: CORS },
        )
    }
}
