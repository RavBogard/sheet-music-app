import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { revokeMcpToken } from "@/lib/mcp/tokens"

/**
 * DELETE /api/mcp/tokens/[id] — revoke one of the caller's MCP tokens.
 *
 * Revocation is a soft delete (sets `revokedAt`); `verifyBearer` rejects
 * revoked tokens immediately. `revokeMcpToken` verifies ownership, so a user
 * can never revoke another user's token.
 */
export const DELETE = createApiHandler<{ id: string }>(async (ctx) => {
    const ok = await revokeMcpToken(ctx.auth.uid, ctx.params!.id)
    if (!ok) {
        return NextResponse.json({ error: "Token not found" }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
})
