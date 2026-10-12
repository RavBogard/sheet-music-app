import { NextResponse } from "next/server"
import { apiError, createApiHandler } from "@/lib/api-wrapper"
import { initAdmin } from "@/lib/firebase-admin"
import { createPlatformToken, listPlatformTokens, revokeMcpToken } from "@/lib/mcp/tokens"
import { recordPlatformAudit } from "@/lib/platform/tenants"
import { refuseUnlessPo } from "@/lib/platform/platform-http"

/**
 * The platform owner's bearers for /api/platform/mcp (kind "platform", `crl_plat_…`).
 *
 * GET    /api/platform/tokens                                   → [{id, label, createdAt, lastUsedAt, expiresAt}]
 * POST   /api/platform/tokens  body {label?, expiresInDays? (1-3650)} → {id, token} (token shown once)
 * DELETE /api/platform/tokens?id=…                              → {revoked: true}
 *
 * Platform owner only (Firebase ID token). The platform MCP server re-checks
 * the owner on every request, so a token stops working the moment its owner
 * leaves platform/owners.
 */
export const GET = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    initAdmin()
    return NextResponse.json(await listPlatformTokens(ctx.auth.uid))
})

export const POST = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    let body: Record<string, unknown> = {}
    try {
        const b = await ctx.req.json()
        if (b && typeof b === "object" && !Array.isArray(b)) body = b as Record<string, unknown>
    } catch {
        body = {}
    }
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : "Platform (Claude)"
    let expiresAtMs: number | null = null
    if (body.expiresInDays !== undefined) {
        const d = Number(body.expiresInDays)
        if (!Number.isInteger(d) || d < 1 || d > 3650) return apiError("expiresInDays is a whole number from 1 to 3650", 400, "PLATFORM_INVALID")
        expiresAtMs = Date.now() + d * 86_400_000
    }
    initAdmin()
    const { id, rawToken } = await createPlatformToken(ctx.auth.uid, label, { expiresAtMs })
    await recordPlatformAudit({
        actorUid: ctx.auth.uid,
        actorEmail: ctx.auth.email ?? null,
        via: "console",
        action: "mint_platform_token",
        orgId: null,
        before: null,
        after: { tokenId: id, label, expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null },
    })
    return NextResponse.json({ id, token: rawToken })
})

export const DELETE = createApiHandler(async (ctx) => {
    const refused = refuseUnlessPo(ctx.auth)
    if (refused) return refused
    const id = new URL(ctx.req.url).searchParams.get("id")
    if (!id) return apiError("id is required", 400, "PLATFORM_INVALID")
    initAdmin()
    const ok = await revokeMcpToken(ctx.auth.uid, id)
    if (!ok) return apiError("No such token of yours", 404, "PLATFORM_NOT_FOUND")
    await recordPlatformAudit({
        actorUid: ctx.auth.uid,
        actorEmail: ctx.auth.email ?? null,
        via: "console",
        action: "revoke_platform_token",
        orgId: null,
        before: { tokenId: id },
        after: null,
    })
    return NextResponse.json({ revoked: true })
})
