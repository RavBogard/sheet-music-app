import "server-only"
import { createMcpHandler, withMcpAuth } from "mcp-handler"
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js"
import { initAdmin, getAuth, getFirestore } from "@/lib/firebase-admin"
import { verifyBearer } from "@/lib/mcp/auth"
import { mcpPublicOrigin } from "@/lib/mcp/public-origin"
import { forSurface } from "@/lib/mcp/surfaces"
import { wrapWithValidationRemap } from "@/lib/mcp/zod-envelope-remap"
import { readOwners } from "@/lib/org/claims"
import { registerPlatformTools } from "@/lib/mcp/platform/tools"
import { logger } from "@/lib/logger"

/**
 * Multi-tenant phase 4: the platform owner's MCP server, /api/platform/mcp.
 *
 * Its own handler rather than a third branch of build-handler.ts: it shares
 * nothing with the tenant servers except the bearer verifier, and it must not
 * pick up the authoring server's per-tenant dispatch or instructions.
 *
 * Who gets in, checked on EVERY request:
 *   1. a bearer of kind "platform" (`crl_plat_…`, minted by POST
 *      /api/platform/tokens). Any tenant token (crl_live_, crl_read_,
 *      crl_view_) → 403 with a plain message; verifyBearer also refuses a
 *      platform token on every other server.
 *   2. its owner is in platform/owners right now (read fresh, no memo), so
 *      removing someone as platform owner shuts their token out at once.
 */

export const PLATFORM_INSTRUCTIONS = `# Platform server (platform owner only)

This server manages tenants: the congregations and bands that use the app.
It is not for building services — that is each tenant's own server at
/api/mcp on its address.

Every tool that acts on one tenant needs \`orgId\`; there is no default tenant.
Changes are dry runs unless you pass \`dryRun: false\`: show the person the
\`diff\` (and any \`warnings\`) first, then apply. Applied changes are recorded
in the platform activity log (list_platform_activity).

Start with list_tenants. A new tenant: create_tenant (dry run, then apply),
then invite_tenant_admin, then set_tenant_features. To look at a tenant as it
sees itself, mint_tenant_view_bearer gives a read-only token for its server.`

function plain(status: number, message: string): Response {
    return new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } })
}

export interface PlatformCaller {
    uid: string
    tokenId: string
    email: string | null
}

/** The gate. A Response is the refusal; otherwise the verified platform owner. */
export async function platformGate(req: Request): Promise<PlatformCaller | Response> {
    const r = await verifyBearer(req, { surface: "platform" })
    if (r instanceof Response) {
        if (r.status === 401)
            return plain(401, "Unauthorized. /api/platform/mcp needs `Authorization: Bearer crl_plat_…`, a platform token minted for the platform owner.")
        return r
    }
    initAdmin()
    let owners: string[]
    try {
        owners = await readOwners(getFirestore())
    } catch (e) {
        logger.error("[platform-mcp] could not read platform owners", e)
        return plain(503, "Could not confirm the platform owner. Try again.")
    }
    if (!owners.includes(r.uid)) {
        logger.warn("[platform-mcp] platform token whose owner is not a platform owner", { tokenId: r.tokenId })
        return plain(403, "This platform token belongs to someone who is not the platform owner.")
    }
    let email: string | null = null
    try {
        email = (await getAuth().getUser(r.uid)).email ?? null
    } catch {
        email = null
    }
    return { uid: r.uid, tokenId: r.tokenId, email }
}

export function buildPlatformMcpHandler(basePath = "/api/platform") {
    const base = createMcpHandler(
        (raw) => {
            registerPlatformTools(forSurface(raw, "platform"))
        },
        { serverInfo: { name: "centralreform-live-platform", version: "1.0.0" }, instructions: PLATFORM_INSTRUCTIONS },
        { basePath, disableSse: true, verboseLogs: false },
    )

    const callers = new WeakMap<Request, PlatformCaller>()
    const verifyToken = async (req: Request, bearer?: string): Promise<AuthInfo | undefined> => {
        if (!bearer) return undefined
        let c = callers.get(req)
        if (!c) {
            const g = await platformGate(req)
            if (g instanceof Response) return undefined
            c = g
        }
        return { token: bearer, clientId: c.uid, scopes: [], extra: { uid: c.uid, tokenId: c.tokenId, kind: "platform", email: c.email } }
    }

    const handler = async (req: Request): Promise<Response> => {
        const gate = await platformGate(req)
        if (gate instanceof Response) return gate
        callers.set(req, gate)
        return withMcpAuth(base, verifyToken, { required: true, resourceUrl: await mcpPublicOrigin(req) })(req)
    }
    return wrapWithValidationRemap(handler)
}
