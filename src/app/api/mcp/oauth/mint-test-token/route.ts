import { NextResponse } from "next/server"
import { z } from "zod"
import { createApiHandler, apiError } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { provisionTestAccount } from "@/lib/mcp/tools/test-tokens"

/**
 * HTTP front door for MCP test-identity provisioning.
 *
 * POST /api/mcp/oauth/mint-test-token (Firebase ID token, admin only)
 *
 * Same shared core (`provisionTestAccount`) as the MCP `create_test_account`
 * tool — so a curl-from-admin path stays in lockstep with the
 * agent-driven path. Endpoint enforces the strict admin gate (least
 * privilege at the HTTP edge); the MCP tool gate is admin OR band_leader,
 * matching how the rest of the MCP surface is governed.
 *
 * The full `provisionTestAccount` envelope (success or `{error, message,
 * context, hint}`) is returned verbatim — same shape as the MCP tool path.
 */

const mintSchema = z.object({
    role: z.enum(["band_leader", "musician", "member"]),
    soundEngineer: z.boolean().optional(),
    label: z.string().max(80).optional(),
    ttlSec: z.number().int().positive().max(24 * 60 * 60).optional(),
})

export const POST = createApiHandler(
    async (ctx) => {
        const limited = await checkRateLimit(ctx.req, "api")
        if (limited) return limited

        const result = await provisionTestAccount(ctx.auth.uid, ctx.body!)
        if ("error" in result) {
            // Mirror the MCP envelope shape on the HTTP path so a single
            // client can treat both paths identically.
            const code = result.error === "forbidden" ? 403 : 400
            return apiError(result.message, code, result.error, {
                context: result.context,
                hint: result.hint,
            })
        }
        return NextResponse.json(result)
    },
    { role: "admin", schema: mintSchema },
)
