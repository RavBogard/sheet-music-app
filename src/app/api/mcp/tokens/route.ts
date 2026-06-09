import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { createMcpToken, listMcpTokens } from "@/lib/mcp/tokens"
import { resolveMintOrg } from "@/lib/org/membership-server"
import { coerceOrgId } from "@/lib/org/registry"

/**
 * MCP token management — a user's own `crl_live_` tokens for connecting Claude
 * (Desktop / web / Code) to centralreform.live.
 *
 * GET  /api/mcp/tokens   — list the caller's active tokens (no hashes)
 * POST /api/mcp/tokens   — create a token; returns the raw token ONCE
 *
 * Auth: standard Firebase ID token — any signed-in user manages their own
 * tokens. This is NOT the MCP bearer path; that is `verifyBearer` on /api/mcp.
 */

export const GET = createApiHandler(async (ctx) => {
    const tokens = await listMcpTokens(ctx.auth.uid)
    return NextResponse.json({ tokens })
})

const createSchema = z.object({
    label: z.string().trim().min(1).max(80),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        // v11.1-02-01: stamp the token with the tenant the user CONNECTED
        // THROUGH — the Edge-resolved `x-org-id` for this request's host,
        // validated against the user's orgIds membership (fallback: primary
        // org, default crc). Lets a multi-org leader self-mint a broslaz bearer
        // from the broslaz host; host org (not a body arg) keeps v11-06-02 intact.
        const hostOrg = coerceOrgId(ctx.req.headers.get("x-org-id"))
        const orgId = await resolveMintOrg(ctx.auth.uid, hostOrg)
        const { id, rawToken } = await createMcpToken(ctx.auth.uid, ctx.body!.label, orgId)
        return NextResponse.json({ id, token: rawToken })
    },
    { schema: createSchema },
)
