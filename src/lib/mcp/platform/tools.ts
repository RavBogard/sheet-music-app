import "server-only"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { richError } from "@/lib/mcp/errors"
import type { AuthExtra } from "@/lib/mcp/org-context"
import { FEATURE_KEYS } from "@/lib/org/config-schema"
import { TenantAddressError } from "@/lib/platform/tenant-address"
import { VercelApiError } from "@/lib/platform/vercel"
import { AuthDomainsError } from "@/lib/platform/auth-domains"
import {
    assignCollection,
    createTenant,
    getTenant,
    inviteTenantAdmin,
    listCollections,
    listPlatformActivity,
    listTenantMembersForPlatform,
    listTenants,
    mintTenantViewBearer,
    PlatformError,
    removeTenantMember,
    setCollectionSharing,
    setTenantFeatures,
    setTenantMemberRole,
    updateTenant,
    VIEW_BEARER_MAX_MINUTES,
    type Actor,
} from "@/lib/platform/tenants"
import { addTenantDomain, checkTenantDomain, removeTenantDomain } from "@/lib/platform/tenant-domains"
import { logger } from "@/lib/logger"

/**
 * Multi-tenant phase 4: the 17 tools of the platform MCP server
 * (/api/platform/mcp). Each is a thin call into src/lib/platform/, the same
 * library the /platform console's routes call.
 *
 * Every tool that acts on one tenant takes `orgId` and it is REQUIRED (no
 * default tenant on this server). Writes default to `dryRun: true` and return
 * `{dryRun, changed, before, after, diff}`; pass `dryRun: false` to apply,
 * which also records a platformAudit row (`auditId`).
 *
 * The caller has already been checked as the platform owner, on every
 * request, by the platform handler (src/lib/mcp/platform/handler.ts).
 */

function actorFrom(extra: AuthExtra): Actor {
    const e = extra.authInfo?.extra
    const uid = e?.uid
    if (typeof uid !== "string" || !uid) throw new Error("Unauthenticated MCP request")
    return { uid, email: typeof e?.email === "string" ? e.email : null, via: "claude" }
}

function result(data: unknown) {
    const isError = !!data && typeof data === "object" && (data as { ok?: unknown }).ok === false
    return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        ...(isError ? { isError: true as const } : {}),
    }
}

function errorEnvelope(e: unknown) {
    if (e instanceof PlatformError) {
        const status = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403, expired: 410, used: 409 }[e.kind]
        const code = e.kind === "invalid" ? "invalid_argument" : e.kind
        return richError(code, e.message, { errorCode: status })
    }
    if (e instanceof TenantAddressError) {
        const status = { not_found: 404, invalid: 400, conflict: 409, exhausted: 409, not_attached: 409 }[e.kind]
        return richError(`address_${e.kind}`, e.message, { errorCode: status })
    }
    if (e instanceof VercelApiError) {
        return richError(`vercel_${e.kind}`, e.message, { errorCode: e.kind === "invalid" ? 400 : 502 })
    }
    if (e instanceof AuthDomainsError) return richError(`auth_domains_${e.kind}`, e.message, { errorCode: 502 })
    logger.error("[platform-mcp] tool failed", e)
    return richError("internal", e instanceof Error ? e.message : String(e), { errorCode: 500 })
}

async function run(fn: () => Promise<unknown>) {
    try {
        return result(await fn())
    } catch (e) {
        return result(errorEnvelope(e))
    }
}

const orgId = z.string().min(2).max(40).describe("The tenant's id, e.g. 'crc' or 'nava-tehila'. Required; there is no default tenant here.")
const dryRun = z.boolean().optional().describe("Default true: show what would change and write nothing. Pass false to apply.")
const ROLE = z.enum(["admin", "band_leader", "musician", "member", "pending"])

export function registerPlatformTools(server: McpServer): void {
    server.registerTool(
        "list_tenants",
        {
            description:
                "List every tenant (congregation or band) on the platform: id, name, status, addresses, member and pending counts, and which features are on.",
            inputSchema: {},
        },
        async () => run(() => listTenants()),
    )

    server.registerTool(
        "get_tenant",
        {
            description:
                "Get one tenant in full: its whole config, the state of its custom domains, how many people hold each role, and the chart collections it owns or can see.",
            inputSchema: { orgId },
        },
        async (args) =>
            run(async () => {
                const t = await getTenant(args.orgId)
                if (!t) throw new PlatformError("not_found", `There is no tenant "${args.orgId}".`)
                return t
            }),
    )

    server.registerTool(
        "create_tenant",
        {
            description:
                "Create a new tenant. Give its id (lowercase letters, digits, hyphens; never changes), name and the subdomain for its default address (<subdomain>.vercel.app, or the nearest free name). Optional: short name, kind ('shul' shows service types and liturgy fields, 'band' hides them), time zone, language, features, and copyLiturgyFrom to copy another tenant's service types, rabbi slots and books. Dry run by default: shows the config it would write and the address. Applying creates it, attaches the address and returns the next steps (add an admin with invite_tenant_admin).",
            inputSchema: {
                orgId,
                name: z.string().min(1).max(120).describe("Full name, e.g. 'Nava Tehila'."),
                subdomain: z.string().min(2).max(40).describe("Default address name: <subdomain>.vercel.app."),
                shortName: z.string().min(1).max(60).optional().describe("Short brand name shown in the app header. Defaults to the name."),
                kind: z.enum(["shul", "band"]).optional().describe("'shul' (default) or 'band'."),
                timeZone: z.string().min(1).optional().describe("IANA time zone, e.g. 'Asia/Jerusalem'. Default America/Chicago."),
                language: z.enum(["en", "he"]).optional().describe("Default 'en'. 'he' also sets right-to-left."),
                calendar: z.enum(["diaspora", "israel"]).optional().describe("Torah reading schedule. Default 'diaspora'."),
                features: z
                    .object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()])))
                    .optional()
                    .describe(`Feature switches (${FEATURE_KEYS.join(", ")}). Default: only perform on.`),
                copyLiturgyFrom: z.string().optional().describe("A tenant id to copy service types, rabbi slots and books from."),
                dryRun,
            },
        },
        async (args, extra) =>
            run(() =>
                createTenant(
                    {
                        orgId: args.orgId,
                        subdomain: args.subdomain,
                        copyLiturgyFrom: args.copyLiturgyFrom,
                        config: {
                            name: args.name,
                            ...(args.shortName ? { branding: { shortName: args.shortName }, congregationDefaults: { shortName: args.shortName } } : {}),
                            ...(args.kind ? { vocabulary: { mode: args.kind } } : {}),
                            ...(args.timeZone || args.language || args.calendar
                                ? {
                                      locale: {
                                          ...(args.timeZone ? { timeZone: args.timeZone } : {}),
                                          ...(args.language ? { language: args.language } : {}),
                                          ...(args.calendar ? { calendar: args.calendar } : {}),
                                      },
                                  }
                                : {}),
                            ...(args.features ? { features: args.features as Record<string, boolean> } : {}),
                        },
                    },
                    { actor: actorFrom(extra), dryRun: args.dryRun },
                ),
            ),
    )

    server.registerTool(
        "update_tenant",
        {
            description:
                "Change a tenant's config. `patch` is merged into the current config (objects merge key by key; lists replace whole), then the result is checked against the config schema. Dry run by default: returns before, after and the list of changed fields. CRC and Brothers Lazaroff can be edited too; read the diff before applying.",
            inputSchema: {
                orgId,
                patch: z.record(z.string(), z.unknown()).describe("Fields to change, e.g. {\"branding\": {\"shortName\": \"Nava\"}}."),
                dryRun,
            },
        },
        async (args, extra) => run(() => updateTenant(args.orgId, args.patch as never, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "set_tenant_features",
        {
            description: `Switch a tenant's features on or off: ${FEATURE_KEYS.join(", ")}. Only the ones you name change. Dry run by default.`,
            inputSchema: {
                orgId,
                features: z.record(z.string(), z.boolean()).describe("e.g. {\"mixer\": false, \"perform\": true}"),
                dryRun,
            },
        },
        async (args, extra) => run(() => setTenantFeatures(args.orgId, args.features, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "add_tenant_domain",
        {
            description:
                "Give a tenant a custom domain (both the bare name and www). Dry run by default. Applying attaches it and returns the DNS records to give the domain's owner, with plain steps; then use check_tenant_domain until it says live.",
            inputSchema: { orgId, domain: z.string().min(3).describe("e.g. 'navatehila.org'"), dryRun },
        },
        async (args, extra) => run(() => addTenantDomain(args.orgId, args.domain, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "check_tenant_domain",
        {
            description:
                "Check a tenant's custom domain: waiting_for_dns, verified or live, with the DNS records still needed. When it is live, www becomes the tenant's main address.",
            inputSchema: { orgId, domain: z.string().min(3) },
        },
        async (args) => run(() => checkTenantDomain(args.orgId, args.domain)),
    )

    server.registerTool(
        "remove_tenant_domain",
        {
            description:
                "Remove a custom domain from a tenant (bare and www). Dry run by default. CRC's and Brothers Lazaroff's own domains cannot be removed here.",
            inputSchema: { orgId, domain: z.string().min(3), dryRun },
        },
        async (args, extra) => run(() => removeTenantDomain(args.orgId, args.domain, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "list_tenant_members",
        {
            description: "List a tenant's people: uid, name, email, role, sound engineer, last seen. Optional role filter.",
            inputSchema: { orgId, role: ROLE.or(z.literal("denied")).optional() },
        },
        async (args) => run(() => listTenantMembersForPlatform(args.orgId, { role: args.role })),
    )

    server.registerTool(
        "set_tenant_member_role",
        {
            description:
                "Give a person a role in a tenant (admin, band_leader, musician, member, pending). Name them by uid or by the email of their account; someone without an account needs invite_tenant_admin instead. Dry run by default. Warns when the change leaves the tenant with no admin.",
            inputSchema: {
                orgId,
                uid: z.string().optional(),
                email: z.string().optional(),
                role: ROLE,
                dryRun,
            },
        },
        async (args, extra) =>
            run(() => {
                if (!args.uid && !args.email) throw new PlatformError("invalid", "Name the person by uid or email.")
                return setTenantMemberRole(args.orgId, { uid: args.uid, email: args.email }, args.role, {
                    actor: actorFrom(extra),
                    dryRun: args.dryRun,
                })
            }),
    )

    server.registerTool(
        "remove_tenant_member",
        {
            description: "Remove a person from a tenant (their other tenants are untouched). Dry run by default. Warns when it removes the last admin.",
            inputSchema: { orgId, uid: z.string().min(1), dryRun },
        },
        async (args, extra) => run(() => removeTenantMember(args.orgId, args.uid, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "invite_tenant_admin",
        {
            description:
                "Invite someone by email to join a tenant with a role (default admin). Applying returns a link to send them, valid 7 days and usable once; they sign in at the tenant's address with that email and press Accept. The link is shown only once. Dry run by default.",
            inputSchema: {
                orgId,
                email: z.string().min(3),
                role: z.enum(["admin", "band_leader", "musician", "member"]).optional().describe("Default admin."),
                dryRun,
            },
        },
        async (args, extra) =>
            run(() => inviteTenantAdmin(args.orgId, args.email, args.role ?? "admin", { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "list_collections",
        {
            description:
                "List chart collections: owner, label, visibility, which tenants it is shared with or assigned to, and how many charts it holds. Pass orgId for the collections one tenant owns or can see; omit it for all.",
            inputSchema: { orgId: orgId.optional() },
        },
        async (args) => run(() => listCollections(args.orgId)),
    )

    server.registerTool(
        "set_collection_sharing",
        {
            description:
                "Set who can see a collection: visibility 'private', 'listed' or 'all', and the tenants it is shared with (replaces the list). Shows how many charts are affected. Dry run by default. Nothing is copied; shared charts stay the owner's.",
            inputSchema: {
                collectionId: z.string().min(1).describe("From list_collections, e.g. 'crc__nava'."),
                visibility: z.enum(["private", "listed", "all"]),
                sharedWith: z.array(z.string()).describe("Tenant ids; the full new list."),
                dryRun,
            },
        },
        async (args, extra) =>
            run(() =>
                setCollectionSharing(
                    args.collectionId,
                    { visibility: args.visibility, sharedWith: args.sharedWith },
                    { actor: actorFrom(extra), dryRun: args.dryRun },
                ),
            ),
    )

    server.registerTool(
        "assign_collection",
        {
            description:
                "Assign a collection to a tenant (assigned: true) or take the assignment away (false). An assignment is yours to set; the tenant's admin cannot remove it. Dry run by default.",
            inputSchema: { collectionId: z.string().min(1), orgId, assigned: z.boolean(), dryRun },
        },
        async (args, extra) =>
            run(() => assignCollection(args.collectionId, args.orgId, args.assigned, { actor: actorFrom(extra), dryRun: args.dryRun })),
    )

    server.registerTool(
        "mint_tenant_view_bearer",
        {
            description: `Make a short-lived, read-only connector token for one tenant, so you can look at it through the tenant's own MCP server (/api/mcp at its address) as yourself. It can read but every change is refused. Lasts up to ${VIEW_BEARER_MAX_MINUTES} minutes. The token is shown once.`,
            inputSchema: {
                orgId,
                minutes: z.number().int().min(1).max(VIEW_BEARER_MAX_MINUTES).optional().describe(`Default 30, at most ${VIEW_BEARER_MAX_MINUTES}.`),
            },
        },
        async (args, extra) => run(() => mintTenantViewBearer(args.orgId, args.minutes ?? 30, actorFrom(extra))),
    )

    server.registerTool(
        "list_platform_activity",
        {
            description: "Show the platform activity log, newest first: who did what to which tenant, from the console or from Claude, with before and after. Optional tenant, since (ISO date) and limit (default 50, max 500).",
            inputSchema: {
                orgId: orgId.optional(),
                since: z.string().optional(),
                limit: z.number().int().min(1).max(500).optional(),
            },
        },
        async (args) => run(() => listPlatformActivity({ orgId: args.orgId, since: args.since, limit: args.limit })),
    )
}
