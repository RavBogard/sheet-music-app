import { DEFAULT_ORG_ID, compiledOrgIdForHost } from "@/lib/org/registry"
import { isValidOrgId } from "@/lib/org/org-id"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 3 — which tenant a request host belongs to.
 *
 * Pure and Edge-safe (no Firestore, no zod, no `server-only`): the proxy calls
 * `resolveRequestOrg` and the address-list builder (hosts.ts) shares the host
 * normalisation. Order, per the phase 3 handoff and ruling 1 defaults:
 *
 *   (a) the compiled CRC/BL map — exactly today's behaviour for
 *       centralreform.live, brotherslazaroff.live and their www;
 *   (b) the project's OWN Vercel URLs → crc (production aliases, git-branch
 *       aliases and deployment URLs — crons, webhooks and probes use them);
 *   (c) the address list (`/api/org-hosts`, built from `orgs/{id}`);
 *   (d) not production (VERCEL_ENV !== "production", or localhost) → crc;
 *   (e) otherwise no such site — except server-to-server paths that
 *       authenticate with their own secret, which keep resolving to crc.
 */

export type HostMap = Record<string, OrgId>

export type OrgResolution =
    | { orgId: OrgId; via: "compiled" | "own-vercel" | "list" | "localhost" | "non-production" | "server-to-server" }
    | { orgId: null; via: "no-such-site" }
    /**
     * The address list could not be read at all, so this host is unresolved,
     * not absent. Saying "no such site" here would be asserting from
     * ignorance — and on a tenant whose address IS in the list, that is a
     * live site going dark. The caller answers 503 and asks for a retry.
     */
    | { orgId: null; via: "list-unavailable" }

/** The address-list endpoint (outside /api/platform; lane 2 owns that tree). */
export const ORG_HOSTS_PATH = "/api/org-hosts"

/**
 * Lowercase, no scheme, no path, no port, no trailing dot. Returns "" for
 * anything that is not a plausible host name.
 */
export function normalizeHost(raw: string | null | undefined): string {
    if (!raw) return ""
    let h = raw.trim().toLowerCase()
    const scheme = h.indexOf("://")
    if (scheme !== -1) h = h.slice(scheme + 3)
    const slash = h.indexOf("/")
    if (slash !== -1) h = h.slice(0, slash)
    const colon = h.indexOf(":")
    if (colon !== -1) h = h.slice(0, colon)
    if (h.endsWith(".")) h = h.slice(0, -1)
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h)) return ""
    return h
}

export function isVercelAppHost(host: string): boolean {
    return host.endsWith(".vercel.app")
}

/**
 * The project's own Vercel URLs: the production aliases
 * (sheet-music-app.vercel.app, sheet-music-app-ravbogards-projects.vercel.app),
 * branch aliases (sheet-music-app-git-<branch>-ravbogards-projects.vercel.app)
 * and deployment URLs (sheet-music-app-<hash>-ravbogards-projects.vercel.app).
 * All resolve to crc, as they always have.
 */
const OWN_VERCEL_EXACT = new Set(["sheet-music-app.vercel.app", "sheet-music-app-ravbogards-projects.vercel.app"])
const OWN_VERCEL_PATTERN = /^sheet-music-app-[a-z0-9-]+-ravbogards-projects\.vercel\.app$/

export function isOwnVercelHost(host: string): boolean {
    return OWN_VERCEL_EXACT.has(host) || OWN_VERCEL_PATTERN.test(host)
}

export function isLocalHost(host: string): boolean {
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1"
}

/**
 * Server-to-server paths that authenticate with their own secret (or, for the
 * bridge redemption, a one-time code). On an address that is not in the list
 * they keep resolving to crc rather than getting "no such site", so a cron,
 * webhook or bridge pointed at an unexpected host behaves as it does today.
 * MCP (`/api/mcp`, `/api/ops/mcp`) and OAuth are deliberately NOT here.
 *
 *   /api/cron/*            — Vercel Cron, `Authorization: Bearer CRON_SECRET`
 *   /api/webhooks/*        — Resend (Svix signature)
 *   /api/inngest           — Inngest (signing key)
 *   /api/intake/run        — INTAKE_RUN_SECRET / CRON_SECRET
 *   /api/bridge/setup-code — the mixer bridge exe redeeming a setup code
 *   /api/org-hosts         — the proxy's own address-list fetch (never resolved
 *                            through the list, or it would recurse)
 */
const SERVER_TO_SERVER_PREFIXES = ["/api/cron/", "/api/webhooks/"]
const SERVER_TO_SERVER_EXACT = new Set(["/api/inngest", "/api/intake/run", "/api/bridge/setup-code", ORG_HOSTS_PATH])

export function isServerToServerPath(pathname: string): boolean {
    const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
    return SERVER_TO_SERVER_EXACT.has(p) || SERVER_TO_SERVER_PREFIXES.some((pre) => p.startsWith(pre))
}

/**
 * Every host a tenant's `domains` entry answers on. vercel.app aliases are
 * listed exactly; a custom domain is listed bare AND with www (whichever was
 * stored), since Vercel's bare→www redirect means the app sees www but the
 * bare form must never fall through to "no such site" either.
 */
export function expandDomainHosts(primary: unknown, aliases: unknown): string[] {
    const raw = [primary, ...(Array.isArray(aliases) ? aliases : [])]
    const out: string[] = []
    const add = (h: string) => {
        if (h && !out.includes(h)) out.push(h)
    }
    for (const r of raw) {
        if (typeof r !== "string") continue
        const h = normalizeHost(r)
        if (!h) continue
        if (isVercelAppHost(h)) {
            add(h)
            continue
        }
        const bare = h.startsWith("www.") ? h.slice(4) : h
        if (!bare) continue
        add(bare)
        add(`www.${bare}`)
    }
    return out
}

/**
 * The tenant's canonical host — the connector address and the origin its OAuth
 * metadata names. vercel.app alias → the alias; custom domain → www.
 */
export function canonicalHostFor(primary: string): string {
    const h = normalizeHost(primary)
    if (!h) return ""
    if (isVercelAppHost(h) || h.startsWith("www.")) return h
    return `www.${h}`
}

/** Validate a fetched list: only well-formed hosts → well-formed ids survive. */
export function sanitizeHostMap(raw: unknown): HostMap | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const out: HostMap = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const h = normalizeHost(k)
        if (h && h === k && isValidOrgId(v)) out[h] = v
    }
    return out
}

export function isProductionEnv(vercelEnv: string | undefined): boolean {
    return vercelEnv === "production"
}

export interface ResolveInput {
    host: string | null | undefined
    pathname: string
    vercelEnv: string | undefined
}

/**
 * Resolve the request's tenant. `getHostList` is only called when (a) and (b)
 * miss and the host is not localhost; it returns null when no list is
 * available (never fetched successfully).
 */
export async function resolveRequestOrg(
    input: ResolveInput,
    getHostList: () => Promise<HostMap | null>,
): Promise<OrgResolution> {
    const host = normalizeHost(input.host)

    // (a) compiled CRC/BL map
    const compiled = compiledOrgIdForHost(host)
    if (compiled) return { orgId: compiled, via: "compiled" }

    // (b) the project's own Vercel URLs
    if (host && isOwnVercelHost(host)) return { orgId: DEFAULT_ORG_ID, via: "own-vercel" }

    // localhost is never in the list and never production: same answer as (d)
    // without a pointless fetch.
    if (isLocalHost(host)) return { orgId: DEFAULT_ORG_ID, via: "localhost" }

    // (c) the address list — never for the list endpoint itself (recursion)
    let listUnavailable = false
    if (host && input.pathname !== ORG_HOSTS_PATH) {
        let list: HostMap | null = null
        try {
            list = await getHostList()
        } catch {
            list = null
        }
        if (!list) listUnavailable = true
        const hit = list?.[host]
        if (hit && isValidOrgId(hit)) return { orgId: hit, via: "list" }
    }

    // (d) preview deployments, local dev
    if (!isProductionEnv(input.vercelEnv)) return { orgId: DEFAULT_ORG_ID, via: "non-production" }

    // (e) production, unknown or suspended address
    if (isServerToServerPath(input.pathname)) return { orgId: DEFAULT_ORG_ID, via: "server-to-server" }
    // The list never arrived, so we don't know this host is unknown — only
    // that we couldn't look it up. A tenant whose address IS listed would
    // otherwise be told it does not exist.
    if (listUnavailable) return { orgId: null, via: "list-unavailable" }
    return { orgId: null, via: "no-such-site" }
}
