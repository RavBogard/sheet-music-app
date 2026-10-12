import { createHash } from "node:crypto"
import { logger } from "@/lib/logger"
import { getOrgConfig } from "@/lib/org/get-org-config"
import { listTenantMembers } from "@/lib/org/access"
import type { OrgConfig } from "@/lib/org/config-schema"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { agentGuideModeOf, tenantInstructions } from "@/lib/mcp/agent-guide"
import { featureFilterApplies, toolsForDisabledFeatures } from "@/lib/mcp/tenant-tools"

/**
 * Multi-tenant phase 4: the authoring MCP server answers each request with the
 * handler of the TOKEN's tenant (not the host's, so existing connectors keep
 * working: a CRC token at any address still acts as CRC). The handler differs
 * per tenant only in its `instructions` and, for tenants the feature filter
 * applies to, in the tools its switched-off features remove.
 */

export type RouteHandler = (req: Request) => Promise<Response>

export interface TenantMcpPlan {
    orgId: OrgId
    instructions: string | undefined
    dropTools: ReadonlySet<string>
    /** Changes whenever the instructions or the dropped tools change. */
    key: string
}

// ── Authors (admins and band leaders), cached per tenant ────────────────────

export const AUTHORS_TTL_MS = 10 * 60_000
const authorsMemo = new Map<OrgId, { at: number; names: string[] }>()

/** Display names of the tenant's admins and band leaders, sorted. Never throws. */
export async function tenantAuthors(orgId: OrgId): Promise<string[]> {
    const hit = authorsMemo.get(orgId)
    if (hit && Date.now() - hit.at < AUTHORS_TTL_MS) return hit.names
    try {
        const members = await listTenantMembers(orgId, { roles: ["admin", "band_leader"] })
        const names = [
            ...new Set(
                members
                    .map((m) => m.profile?.displayName)
                    .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
                    .map((n) => n.trim()),
            ),
        ].sort((a, b) => a.localeCompare(b))
        authorsMemo.set(orgId, { at: Date.now(), names })
        return names
    } catch (err) {
        logger.warn("[mcp] tenant authors lookup failed; guide omits them", { orgId, err: String(err) })
        return hit?.names ?? []
    }
}

// ── Plan ────────────────────────────────────────────────────────────────────

export async function planTenantMcp(orgId: OrgId): Promise<TenantMcpPlan> {
    let config: OrgConfig | null = null
    try {
        config = await getOrgConfig(orgId)
    } catch (err) {
        logger.warn("[mcp] tenant config read failed; generic instructions", { orgId, err: String(err) })
    }
    // Authors only feed the generated guide; the verbatim guide (CRC) never
    // pays for the members read.
    const authors = config && agentGuideModeOf(config) === "generated" ? await tenantAuthors(orgId) : []
    const instructions = tenantInstructions(orgId, config, authors)
    const dropTools = featureFilterApplies(orgId, config) && config ? toolsForDisabledFeatures(config.features) : new Set<string>()
    const digest = createHash("sha1")
        .update(instructions ?? "<none>")
        .update("\0")
        .update([...dropTools].sort().join(","))
        .digest("hex")
        .slice(0, 16)
    return { orgId, instructions, dropTools, key: `${orgId}:${digest}` }
}

// ── Dispatcher with an LRU of built handlers ────────────────────────────────

export const TENANT_HANDLER_MAX = 50

/** The token's tenant as withMcpAuth stashed it on the request. */
export function tokenOrgOf(req: Request): OrgId {
    const orgId = (req as Request & { auth?: { extra?: Record<string, unknown> } }).auth?.extra?.orgId
    return typeof orgId === "string" && orgId ? orgId : DEFAULT_ORG_ID
}

export function createTenantDispatcher(
    build: (plan: TenantMcpPlan) => RouteHandler,
    opts?: { plan?: (orgId: OrgId) => Promise<TenantMcpPlan>; max?: number },
): RouteHandler & { cacheSize: () => number } {
    const plan = opts?.plan ?? planTenantMcp
    const max = opts?.max ?? TENANT_HANDLER_MAX
    const cache = new Map<string, RouteHandler>()

    const dispatch = async (req: Request): Promise<Response> => {
        const p = await plan(tokenOrgOf(req))
        let handler = cache.get(p.key)
        if (handler) {
            cache.delete(p.key)
        } else {
            handler = build(p)
        }
        cache.set(p.key, handler)
        while (cache.size > max) {
            const oldest = cache.keys().next().value
            if (oldest === undefined) break
            cache.delete(oldest)
        }
        return handler(req)
    }
    return Object.assign(dispatch, { cacheSize: () => cache.size })
}
