import { apiFetch } from "@/lib/api-client"
import type {
    CollectionRecord,
    CreateTenantInput,
    Invite,
    PlatformAuditEntry,
    TenantDetail,
    TenantMember,
    TenantSummary,
    WriteResult,
} from "@/lib/platform/tenants"
import type { CustomDomainResult, ProvisionResult, RemoveCustomDomainResult } from "@/lib/platform/tenant-address"
import type { OrgConfig, OrgConfigInput } from "@/lib/org/config-schema"
import type { TenantRole } from "@/lib/org/membership-types"

/**
 * Multi-tenant phase 4: the /platform console's calls to the platform-owner
 * routes (lane 1 builds them; address routes are phase 3). Every write goes
 * through `write()`: `dryRun: true` → `?dryRun=1` (compute, write nothing),
 * `dryRun: false` → `?dryRun=0` (apply).
 */

export class PlatformApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
        super(message)
    }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await apiFetch(path, init)
    const body = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
        const b = (body ?? {}) as { error?: string; code?: string }
        throw new PlatformApiError(b.error || `Request failed (${res.status})`, res.status, b.code)
    }
    return body as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })
const withDry = (path: string, dryRun: boolean) => `${path}${path.includes("?") ? "&" : "?"}dryRun=${dryRun ? 1 : 0}`
const t = (orgId: string) => `/api/platform/tenants/${encodeURIComponent(orgId)}`

export type CreateResult = WriteResult<OrgConfig> & { address?: string; nextSteps: string[] }

export const platformApi = {
    listTenants: () => call<TenantSummary[]>("/api/platform/tenants"),
    getTenant: (orgId: string) => call<TenantDetail>(t(orgId)),
    createTenant: (input: CreateTenantInput, dryRun: boolean) =>
        call<CreateResult>(withDry("/api/platform/tenants", dryRun), json("POST", input)),
    updateTenant: (orgId: string, patch: Partial<OrgConfigInput>, dryRun: boolean) =>
        call<WriteResult<OrgConfig>>(withDry(t(orgId), dryRun), json("PATCH", { patch })),
    setFeatures: (orgId: string, features: Partial<OrgConfig["features"]>, dryRun: boolean) =>
        call<WriteResult<OrgConfig["features"]>>(withDry(`${t(orgId)}/features`, dryRun), json("PATCH", { features })),
    setStatus: (orgId: string, status: OrgConfig["status"], dryRun: boolean) =>
        call<WriteResult<OrgConfig["status"]>>(withDry(`${t(orgId)}/status`, dryRun), json("PATCH", { status })),

    listMembers: (orgId: string) => call<TenantMember[]>(`${t(orgId)}/members`),
    setMemberRole: (orgId: string, who: { uid?: string; email?: string }, role: Exclude<TenantRole, "denied">, dryRun: boolean) =>
        call<WriteResult<TenantMember>>(withDry(`${t(orgId)}/members`, dryRun), json("POST", { ...who, role })),
    removeMember: (orgId: string, uid: string, dryRun: boolean) =>
        call<WriteResult<TenantMember>>(withDry(`${t(orgId)}/members?uid=${encodeURIComponent(uid)}`, dryRun), { method: "DELETE" }),
    listInvites: (orgId: string) => call<Invite[]>(`${t(orgId)}/invites`),
    invite: (orgId: string, email: string, role: Invite["role"], dryRun: boolean) =>
        call<WriteResult<Invite>>(withDry(`${t(orgId)}/invites`, dryRun), json("POST", { email, role })),

    listCollections: (orgId?: string) =>
        call<CollectionRecord[]>(`/api/platform/collections${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`),
    setCollectionSharing: (id: string, sharing: { visibility: CollectionRecord["visibility"]; sharedWith: string[] }, dryRun: boolean) =>
        call<WriteResult<CollectionRecord>>(withDry(`/api/platform/collections/${encodeURIComponent(id)}`, dryRun), json("PATCH", sharing)),
    assignCollection: (id: string, orgId: string, assigned: boolean, dryRun: boolean) =>
        call<WriteResult<CollectionRecord>>(withDry(`/api/platform/collections/${encodeURIComponent(id)}`, dryRun), json("POST", { orgId, assigned })),

    activity: (q: { orgId?: string; since?: string; limit?: number }) => {
        const p = new URLSearchParams()
        if (q.orgId) p.set("orgId", q.orgId)
        if (q.since) p.set("since", q.since)
        if (q.limit) p.set("limit", String(q.limit))
        const qs = p.toString()
        return call<PlatformAuditEntry[]>(`/api/platform/activity${qs ? `?${qs}` : ""}`)
    },
    mintPlatformToken: (label: string) =>
        call<{ id: string; token: string }>("/api/platform/tokens", json("POST", { label })),
    viewBearer: (orgId: string, minutes: number) =>
        call<{ token: string; tokenId: string; expiresAt: string }>("/api/platform/view-bearer", json("POST", { orgId, minutes })),

    // Phase 3 address routes (no dry run: they report what they did).
    provisionAddress: (orgId: string, slug: string) => call<ProvisionResult>(`${t(orgId)}/address`, json("POST", { slug })),
    addDomain: (orgId: string, domain: string) => call<CustomDomainResult>(`${t(orgId)}/domains`, json("POST", { domain })),
    checkDomain: (orgId: string, domain: string) =>
        call<CustomDomainResult>(`${t(orgId)}/domains/${encodeURIComponent(domain)}`),
    removeDomain: (orgId: string, domain: string) =>
        call<RemoveCustomDomainResult>(`${t(orgId)}/domains?domain=${encodeURIComponent(domain)}`, { method: "DELETE" }),
}

export function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
}
