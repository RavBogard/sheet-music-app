import { NextResponse, type NextRequest } from "next/server"
import { initAdmin } from "@/lib/firebase-admin"
import { checkRateLimit } from "@/lib/rate-limit"
import { createMcpToken } from "@/lib/mcp/tokens"
import { consumeAuthCode, getClient, verifyPkceS256 } from "@/lib/mcp/oauth"
import { resolveMintOrg } from "@/lib/org/membership-server"
import { coerceOrgId } from "@/lib/org/registry"
import { logger } from "@/lib/logger"

/**
 * OAuth 2.1 token endpoint — authorization_code grant with PKCE.
 *
 * POST /api/mcp/oauth/token (application/x-www-form-urlencoded or JSON)
 *   grant_type=authorization_code&code=...&redirect_uri=...&client_id=...
 *   &code_verifier=...
 *
 * The auth code is consumed (single-use). After PKCE verification we mint an
 * ordinary `crl_live_` token via the EXISTING createMcpToken — the OAuth
 * access_token IS a normal MCP bearer token, so verifyBearer needs no changes.
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

function oauthError(error: string, status = 400, description?: string): Response {
    return NextResponse.json(
        { error, ...(description ? { error_description: description } : {}) },
        { status, headers: CORS },
    )
}

async function readParams(req: NextRequest): Promise<Record<string, string>> {
    const ct = req.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
        const j = await req.json()
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(j ?? {})) {
            if (typeof v === "string") out[k] = v
        }
        return out
    }
    // Default: application/x-www-form-urlencoded (the OAuth standard).
    const form = await req.formData()
    const out: Record<string, string> = {}
    for (const [k, v] of form.entries()) {
        if (typeof v === "string") out[k] = v
    }
    return out
}

export async function POST(req: NextRequest): Promise<Response> {
    const limited = await checkRateLimit(req, "api")
    if (limited) return limited

    if (!initAdmin()) return oauthError("server_error", 500)

    let p: Record<string, string>
    try {
        p = await readParams(req)
    } catch {
        return oauthError("invalid_request", 400, "malformed request body")
    }

    if (p.grant_type !== "authorization_code") {
        return oauthError("unsupported_grant_type")
    }
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = p
    if (!code || !redirectUri || !clientId || !codeVerifier) {
        return oauthError(
            "invalid_request",
            400,
            "code, redirect_uri, client_id and code_verifier are required",
        )
    }

    // Single-use: consumeAuthCode deletes the code before we validate anything,
    // so a replay can never succeed even if a later check fails.
    const authCode = await consumeAuthCode(code)
    if (!authCode) {
        return oauthError("invalid_grant", 400, "code is invalid or expired")
    }
    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
        return oauthError("invalid_grant", 400, "client_id / redirect_uri mismatch")
    }
    if (!verifyPkceS256(codeVerifier, authCode.codeChallenge)) {
        return oauthError("invalid_grant", 400, "PKCE verification failed")
    }

    const client = await getClient(clientId)
    const label = `Claude OAuth — ${client?.clientName ?? clientId}`
    // v11.1-02-01: stamp the OAuth-minted bearer with the tenant the user
    // CONNECTED THROUGH — the Edge-resolved `x-org-id` for this request's host
    // (brotherslazaroff.live → brotherslazaroff; www.centralreform.live → crc),
    // validated against the user's orgIds membership. A multi-org leader gets a
    // broslaz bearer by connecting Claude Desktop to the broslaz MCP URL; a
    // user not in the host's org falls back to their primary org (no escalation).
    // Host org, not a request arg → v11-06-02 no-arg-injection invariant intact.
    const hostOrg = coerceOrgId(req.headers.get("x-org-id"))
    const orgId = await resolveMintOrg(authCode.uid, hostOrg)
    const { id, rawToken } = await createMcpToken(authCode.uid, label, orgId)
    logger.info("[mcp-oauth] access token issued", { clientId, uid: authCode.uid, tokenId: id })

    return NextResponse.json(
        {
            access_token: rawToken,
            token_type: "Bearer",
            ...(authCode.scope ? { scope: authCode.scope } : {}),
        },
        {
            headers: { ...CORS, "Cache-Control": "no-store", Pragma: "no-cache" },
        },
    )
}
