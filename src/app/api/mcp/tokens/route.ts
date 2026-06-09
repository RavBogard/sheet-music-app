import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { createMcpToken, listMcpTokens } from "@/lib/mcp/tokens"
import { getPrimaryOrgForMinting } from "@/lib/org/membership-server"

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

        // v11-02b: stamp the token with the minting user's tenant (from their
        // orgIds claim, default crc) so a non-CRC member self-mints a correctly
        // org-scoped bearer instead of a crc-defaulted one.
        const orgId = await getPrimaryOrgForMinting(ctx.auth.uid)
        const { id, rawToken } = await createMcpToken(ctx.auth.uid, ctx.body!.label, orgId)
        return NextResponse.json({ id, token: rawToken })
    },
    { schema: createSchema },
)
