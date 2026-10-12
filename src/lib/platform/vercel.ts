/**
 * Multi-tenant phase 3 — a minimal typed client for the Vercel REST API, for
 * attaching tenant addresses (vercel.app aliases and custom domains) to the
 * ONE existing Vercel project (ruling R-1012-mt-1). Nothing is bought here.
 *
 * Env (server only, all optional so local builds work):
 *   VERCEL_API_TOKEN   bearer token with access to the project
 *   VERCEL_PROJECT_ID  the project id (or name)
 *   VERCEL_TEAM_ID     the team id; sent as ?teamId= when set
 *
 * Endpoints:
 *   POST   /v10/projects/{id}/domains                 {name, redirect?, redirectStatusCode?}
 *   GET    /v9/projects/{id}/domains/{name}
 *   DELETE /v9/projects/{id}/domains/{name}
 *   POST   /v9/projects/{id}/domains/{name}/verify
 *   GET    /v6/domains/{name}/config?projectIdOrName={id}
 *
 * No retries anywhere: a retried POST after a lost response could attach a
 * name twice or race another caller. Callers decide what to do with an error.
 */

export type VercelErrorKind =
    | "taken" // the name belongs to another project / account, or is not available
    | "forbidden" // the token cannot do this (401/403 not about the name)
    | "invalid" // malformed name or body (400)
    | "rate_limited" // 429
    | "not_found" // 404
    | "config_missing" // VERCEL_API_TOKEN / VERCEL_PROJECT_ID unset
    | "upstream" // 5xx or network failure

export class VercelApiError extends Error {
    readonly kind: VercelErrorKind
    readonly status: number
    readonly code: string
    /** Seconds, from Retry-After, when rate limited. */
    readonly retryAfter: number | null
    constructor(kind: VercelErrorKind, message: string, opts: { status?: number; code?: string; retryAfter?: number | null } = {}) {
        super(message)
        this.name = "VercelApiError"
        this.kind = kind
        this.status = opts.status ?? 0
        this.code = opts.code ?? kind
        this.retryAfter = opts.retryAfter ?? null
    }
}

export interface DomainVerificationChallenge {
    type: string
    domain: string
    value: string
    reason?: string
}

export interface ProjectDomain {
    name: string
    apexName?: string
    projectId?: string
    redirect?: string | null
    redirectStatusCode?: number | null
    verified: boolean
    verification?: DomainVerificationChallenge[]
}

export interface DomainConfig {
    misconfigured: boolean
    configuredBy: string | null
    /** IPv4 addresses Vercel recommends for an A record (best first). */
    recommendedIPv4: string[]
    /** CNAME target Vercel recommends (best first). */
    recommendedCNAME: string[]
}

/** Vercel's documented defaults, used when the config response omits recommendations. */
export const DEFAULT_A_RECORD = "76.76.21.21"
export const DEFAULT_CNAME = "cname.vercel-dns.com"

export interface VercelClientOptions {
    token?: string
    projectId?: string
    teamId?: string
    fetch?: typeof fetch
    baseUrl?: string
}

/** Error codes Vercel uses for "this name is someone else's / not available". */
const TAKEN_CODES = new Set([
    "domain_already_in_use",
    "domain_taken",
    "domain_already_exists",
    "domain_not_available",
    "not_available",
    "domain_not_allowed",
    "forbidden_domain",
    "invalid_domain_owner",
])
const TAKEN_MESSAGE = /already (in use|exists|assigned)|not available|another (project|team|account)|owned by|is taken/i

/** Map a non-2xx Vercel response to a typed error. Exported for tests. */
export function mapVercelError(status: number, body: unknown, retryAfterHeader: string | null): VercelApiError {
    const err = ((body as { error?: { code?: unknown; message?: unknown } } | null)?.error ?? {}) as {
        code?: unknown
        message?: unknown
    }
    const code = typeof err.code === "string" ? err.code : `http_${status}`
    const message = typeof err.message === "string" ? err.message : `Vercel API returned ${status}`
    const takenLike = TAKEN_CODES.has(code) || TAKEN_MESSAGE.test(message)
    if (status === 409) return new VercelApiError("taken", message, { status, code })
    if (status === 429) {
        const n = retryAfterHeader ? Number(retryAfterHeader) : NaN
        return new VercelApiError("rate_limited", message, { status, code, retryAfter: Number.isFinite(n) ? n : null })
    }
    if (status === 404) return new VercelApiError("not_found", message, { status, code })
    if ((status === 400 || status === 403) && takenLike) return new VercelApiError("taken", message, { status, code })
    if (status === 400) return new VercelApiError("invalid", message, { status, code })
    if (status === 401 || status === 403) return new VercelApiError("forbidden", message, { status, code })
    return new VercelApiError("upstream", message, { status, code })
}

export interface VercelClient {
    addProjectDomain(name: string, opts?: { redirect?: string; redirectStatusCode?: 307 | 308 }): Promise<ProjectDomain>
    removeProjectDomain(name: string): Promise<void>
    /** null when the name is not attached to this project. */
    getProjectDomain(name: string): Promise<ProjectDomain | null>
    getDomainConfig(name: string): Promise<DomainConfig>
    verifyProjectDomain(name: string): Promise<ProjectDomain>
}

function firstValues(v: unknown): string[] {
    // Shapes seen: [{rank, value: string[] | string}] or string[].
    if (!Array.isArray(v)) return []
    const out: string[] = []
    const sorted = [...v].sort(
        (a, b) => ((a as { rank?: number })?.rank ?? 0) - ((b as { rank?: number })?.rank ?? 0),
    )
    for (const item of sorted) {
        if (typeof item === "string") out.push(item)
        else if (item && typeof item === "object") {
            const val = (item as { value?: unknown }).value
            if (typeof val === "string") out.push(val)
            else if (Array.isArray(val)) for (const x of val) if (typeof x === "string") out.push(x)
        }
    }
    return out
}

function toProjectDomain(raw: unknown): ProjectDomain {
    const r = (raw ?? {}) as Record<string, unknown>
    return {
        name: String(r.name ?? ""),
        apexName: typeof r.apexName === "string" ? r.apexName : undefined,
        projectId: typeof r.projectId === "string" ? r.projectId : undefined,
        redirect: typeof r.redirect === "string" ? r.redirect : null,
        redirectStatusCode: typeof r.redirectStatusCode === "number" ? r.redirectStatusCode : null,
        verified: r.verified === true,
        verification: Array.isArray(r.verification) ? (r.verification as DomainVerificationChallenge[]) : undefined,
    }
}

export function createVercelClient(opts: VercelClientOptions = {}): VercelClient {
    const token = opts.token ?? process.env.VERCEL_API_TOKEN
    const projectId = opts.projectId ?? process.env.VERCEL_PROJECT_ID
    const teamId = opts.teamId ?? process.env.VERCEL_TEAM_ID
    const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
    const base = opts.baseUrl ?? "https://api.vercel.com"

    function need(): { token: string; projectId: string } {
        if (!token || !projectId)
            throw new VercelApiError("config_missing", "VERCEL_API_TOKEN and VERCEL_PROJECT_ID must be set to manage tenant addresses")
        return { token, projectId }
    }

    async function call(method: string, path: string, query: Record<string, string>, body?: unknown): Promise<unknown> {
        const { token: t } = need()
        const qs = new URLSearchParams(query)
        if (teamId) qs.set("teamId", teamId)
        const q = qs.toString()
        let res: Response
        try {
            res = await doFetch(`${base}${path}${q ? `?${q}` : ""}`, {
                method,
                headers: {
                    Authorization: `Bearer ${t}`,
                    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
            })
        } catch (e) {
            throw new VercelApiError("upstream", `Vercel API unreachable: ${(e as Error)?.message ?? e}`)
        }
        const text = await res.text()
        let json: unknown = null
        try {
            json = text ? JSON.parse(text) : null
        } catch {
            json = null
        }
        if (!res.ok) throw mapVercelError(res.status, json, res.headers.get("retry-after"))
        return json
    }

    const enc = encodeURIComponent

    return {
        async addProjectDomain(name, o) {
            const { projectId: p } = need()
            const body: Record<string, unknown> = { name }
            if (o?.redirect) {
                body.redirect = o.redirect
                body.redirectStatusCode = o.redirectStatusCode ?? 308
            }
            return toProjectDomain(await call("POST", `/v10/projects/${enc(p)}/domains`, {}, body))
        },
        async removeProjectDomain(name) {
            const { projectId: p } = need()
            await call("DELETE", `/v9/projects/${enc(p)}/domains/${enc(name)}`, {})
        },
        async getProjectDomain(name) {
            const { projectId: p } = need()
            try {
                return toProjectDomain(await call("GET", `/v9/projects/${enc(p)}/domains/${enc(name)}`, {}))
            } catch (e) {
                if (e instanceof VercelApiError && e.kind === "not_found") return null
                throw e
            }
        },
        async getDomainConfig(name) {
            const { projectId: p } = need()
            const r = ((await call("GET", `/v6/domains/${enc(name)}/config`, { projectIdOrName: p })) ?? {}) as Record<
                string,
                unknown
            >
            return {
                misconfigured: r.misconfigured !== false,
                configuredBy: typeof r.configuredBy === "string" ? r.configuredBy : null,
                recommendedIPv4: firstValues(r.recommendedIPv4),
                recommendedCNAME: firstValues(r.recommendedCNAME),
            }
        },
        async verifyProjectDomain(name) {
            const { projectId: p } = need()
            return toProjectDomain(await call("POST", `/v9/projects/${enc(p)}/domains/${enc(name)}/verify`, {}))
        },
    }
}

let defaultClient: VercelClient | null = null
function client(): VercelClient {
    return (defaultClient ??= createVercelClient())
}

export const addProjectDomain: VercelClient["addProjectDomain"] = (name, opts) => client().addProjectDomain(name, opts)
export const removeProjectDomain: VercelClient["removeProjectDomain"] = (name) => client().removeProjectDomain(name)
export const getProjectDomain: VercelClient["getProjectDomain"] = (name) => client().getProjectDomain(name)
export const getDomainConfig: VercelClient["getDomainConfig"] = (name) => client().getDomainConfig(name)
export const verifyProjectDomain: VercelClient["verifyProjectDomain"] = (name) => client().verifyProjectDomain(name)
