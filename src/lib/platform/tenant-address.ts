import "server-only"
import type { Firestore } from "firebase-admin/firestore"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { OrgIdSchema } from "@/lib/org/config-schema"
import {
    createVercelClient,
    DEFAULT_A_RECORD,
    DEFAULT_CNAME,
    VercelApiError,
    type DomainConfig,
    type DomainVerificationChallenge,
    type VercelClient,
} from "@/lib/platform/vercel"
import { changeAuthorizedDomains, type AuthDomainsDeps } from "@/lib/platform/auth-domains"
import { revalidateHostList } from "@/lib/platform/host-list"

/**
 * Multi-tenant phase 3 — a tenant's addresses (ruling R-1012-mt-1).
 *
 * Default address: `<slug>.vercel.app` added to the EXISTING Vercel project.
 * vercel.app names are global, so when Vercel says the name is taken the next
 * candidate is tried, in this order (8 tries at most):
 *
 *   <slug>, <slug>-music, <slug>-app, <slug>-2, <slug>-3, <slug>-4, <slug>-5, <slug>-6
 *
 * A name another tenant in `orgs` already records is skipped without calling
 * Vercel. The winner is stored as `orgs/{id}.domains.primary` and in
 * `orgs/{id}.defaultAddress` ({host, requestedSlug, tried}).
 *
 * Custom domain (the add-on): apex AND www are attached, www first, then the
 * apex with a 308 redirect to www (the www host is the canonical one; the bare
 * redirect would drop MCP's Authorization header). Both go into Firebase
 * authorized domains and `domains.aliases`; `domains.primary` moves to www
 * only when the check says live. Progress is kept in `orgs/{id}.domainStatus`
 * keyed by apex. The DNS change at the registrar is the only manual step.
 */

export const VERCEL_APP_SUFFIX = ".vercel.app"
export const DEFAULT_ADDRESS_SUFFIXES = ["", "-music", "-app", "-2", "-3", "-4", "-5", "-6"] as const

export type TenantAddressErrorKind = "not_found" | "invalid" | "conflict" | "exhausted" | "not_attached"

export class TenantAddressError extends Error {
    readonly kind: TenantAddressErrorKind
    constructor(kind: TenantAddressErrorKind, message: string) {
        super(message)
        this.name = "TenantAddressError"
        this.kind = kind
    }
}

export interface TenantAddressDeps {
    db?: Firestore
    vercel?: VercelClient
    /** Passed to changeAuthorizedDomains (token, fetch, project). */
    authDomains?: AuthDomainsDeps
    /** Replace the authorized-domains change entirely (tests). */
    changeAuthDomains?: typeof changeAuthorizedDomains
    revalidate?: () => Promise<void>
    now?: () => number
}

export type DnsRecord = {
    type: "A" | "CNAME" | "TXT"
    /** What the registrar's "host" / "name" box takes: "@", "www", "_vercel". */
    host: string
    /** Full name, e.g. example.org or www.example.org. */
    name: string
    value: string
    purpose: "bare" | "www" | "verify"
}

export type CustomDomainStatus = "waiting_for_dns" | "verified" | "live"

export interface DomainStatusEntry {
    apex: string
    www: string
    status: CustomDomainStatus
    records: DnsRecord[]
    addedAt: number
    checkedAt: number
}

export interface OrgDomains {
    primary: string
    aliases: string[]
}

function deps(d: TenantAddressDeps = {}) {
    return {
        db: d.db ?? (initAdmin(), getFirestore()),
        vercel: d.vercel ?? createVercelClient(),
        changeAuth: (change: { add?: string[]; remove?: string[] }) =>
            (d.changeAuthDomains ?? changeAuthorizedDomains)(change, { ...d.authDomains, db: d.authDomains?.db ?? d.db }),
        revalidate: d.revalidate ?? revalidateHostList,
        now: d.now ?? Date.now,
    }
}

const dedupe = (xs: string[]) => [...new Set(xs.filter(Boolean))]

function readDomains(data: Record<string, unknown> | undefined): OrgDomains {
    const d = (data?.domains ?? {}) as { primary?: unknown; aliases?: unknown }
    return {
        primary: typeof d.primary === "string" ? d.primary : "",
        aliases: Array.isArray(d.aliases) ? d.aliases.filter((x): x is string => typeof x === "string") : [],
    }
}

function readStatus(data: Record<string, unknown> | undefined): Record<string, DomainStatusEntry> {
    const s = data?.domainStatus
    return s && typeof s === "object" ? { ...(s as Record<string, DomainStatusEntry>) } : {}
}

async function loadOrg(db: Firestore, orgId: string): Promise<Record<string, unknown>> {
    const snap = await db.collection("orgs").doc(orgId).get()
    if (!snap.exists) throw new TenantAddressError("not_found", `No tenant orgs/${orgId}`)
    return (snap.data() ?? {}) as Record<string, unknown>
}

/** Hosts recorded by tenants other than `orgId` (primary + aliases). */
async function hostsOfOtherTenants(db: Firestore, orgId: string): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const snap = await db.collection("orgs").get()
    for (const doc of snap.docs) {
        if (doc.id === orgId) continue
        const d = readDomains(doc.data() as Record<string, unknown>)
        for (const h of [d.primary, ...d.aliases]) if (h) out.set(h.toLowerCase(), doc.id)
        // CRC / BL legacy single `domain` field
        const legacy = (doc.data() as { domain?: unknown }).domain
        if (typeof legacy === "string" && legacy) {
            out.set(legacy.toLowerCase(), doc.id)
            out.set(`www.${legacy.toLowerCase()}`, doc.id)
        }
    }
    return out
}

function assertOrgId(orgId: string) {
    if (!OrgIdSchema.safeParse(orgId).success) throw new TenantAddressError("invalid", `Not a tenant id: ${orgId}`)
}

// ── default address ──────────────────────────────────────────────────────────

/** The vercel.app names tried for a slug, in order. */
export function defaultAddressCandidates(slug: string): string[] {
    const s = slug.trim().toLowerCase()
    if (!OrgIdSchema.safeParse(s).success)
        throw new TenantAddressError("invalid", `Slug must be lowercase letters, digits and hyphens: ${slug}`)
    return DEFAULT_ADDRESS_SUFFIXES.map((suf) => `${s}${suf}`)
        .filter((label) => label.length <= 63)
        .map((label) => `${label}${VERCEL_APP_SUFFIX}`)
}

export interface ProvisionResult {
    orgId: string
    host: string
    /** true when the tenant already had an attached vercel.app address. */
    reused: boolean
    /** Names tried before the winner (taken ones), in order. */
    tried: string[]
    authDomainsSize: number | null
}

export async function provisionDefaultAddress(orgId: string, slug: string, d?: TenantAddressDeps): Promise<ProvisionResult> {
    assertOrgId(orgId)
    const { db, vercel, changeAuth, revalidate, now } = deps(d)
    const candidates = defaultAddressCandidates(slug)
    const data = await loadOrg(db, orgId)
    const current = readDomains(data)
    const others = await hostsOfOtherTenants(db, orgId)

    // Idempotent: a vercel.app address this tenant already has and that is attached.
    for (const h of dedupe([current.primary, ...current.aliases])) {
        if (!h.endsWith(VERCEL_APP_SUFFIX) || others.has(h)) continue
        const attached = await vercel.getProjectDomain(h)
        if (!attached) continue
        const auth = await changeAuth({ add: [h] })
        await revalidate()
        return { orgId, host: h, reused: true, tried: [], authDomainsSize: auth.size }
    }

    const tried: string[] = []
    let host: string | null = null
    for (const name of candidates) {
        if (others.has(name)) {
            tried.push(name)
            continue
        }
        // Left attached by an earlier interrupted run for this tenant: adopt it.
        if (await vercel.getProjectDomain(name)) {
            host = name
            break
        }
        try {
            await vercel.addProjectDomain(name)
            host = name
            break
        } catch (e) {
            if (e instanceof VercelApiError && e.kind === "taken") {
                tried.push(name)
                continue
            }
            throw e
        }
    }
    if (!host)
        throw new TenantAddressError("exhausted", `No free vercel.app name for "${slug}"; tried ${tried.join(", ")}`)

    const auth = await changeAuth({ add: [host] })

    const winner = host
    await db.runTransaction(async (tx) => {
        const ref = db.collection("orgs").doc(orgId)
        const snap = await tx.get(ref)
        if (!snap.exists) throw new TenantAddressError("not_found", `No tenant orgs/${orgId}`)
        const cur = readDomains(snap.data() as Record<string, unknown>)
        const status = readStatus(snap.data() as Record<string, unknown>)
        // A live custom domain stays primary; the alias joins the aliases.
        const customLive = Object.values(status).some((s) => s.status === "live" && s.www === cur.primary)
        const domains: OrgDomains = customLive
            ? { primary: cur.primary, aliases: dedupe([...cur.aliases, winner]) }
            : { primary: winner, aliases: cur.aliases.filter((a) => a !== winner) }
        tx.update(ref, {
            domains,
            defaultAddress: { host: winner, requestedSlug: slug, tried, at: now() },
        })
    })
    await revalidate()
    return { orgId, host: winner, reused: false, tried, authDomainsSize: auth.size }
}

// ── custom domains ───────────────────────────────────────────────────────────

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/** "https://WWW.Example.org/path" → {apex: "example.org", www: "www.example.org"}. */
export function normaliseCustomDomain(input: string): { apex: string; www: string } {
    let h = input.trim().toLowerCase()
    h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    h = h.split(/[/?#]/)[0]
    h = h.replace(/:\d+$/, "").replace(/\.$/, "")
    if (h.startsWith("www.")) h = h.slice(4)
    const labels = h.split(".")
    if (labels.length < 2 || !labels.every((l) => LABEL.test(l)) || !/^[a-z]{2,}$/.test(labels[labels.length - 1]))
        throw new TenantAddressError("invalid", `Not a domain name: ${input}`)
    if (h.endsWith(VERCEL_APP_SUFFIX) || h === "vercel.app")
        throw new TenantAddressError("invalid", "vercel.app names are default addresses, not custom domains")
    return { apex: h, www: `www.${h}` }
}

function challengeRecords(apex: string, challenges: DomainVerificationChallenge[] | undefined): DnsRecord[] {
    return (challenges ?? [])
        .filter((c) => c && typeof c.domain === "string" && typeof c.value === "string")
        .map((c) => {
            const name = c.domain.toLowerCase().replace(/\.$/, "")
            const host = name === apex ? "@" : name.endsWith(`.${apex}`) ? name.slice(0, -(apex.length + 1)) : name
            const type = (c.type || "TXT").toUpperCase()
            return { type: type === "TXT" || type === "A" || type === "CNAME" ? type : "TXT", host, name, value: c.value, purpose: "verify" } as DnsRecord
        })
}

/** The records a registrar needs: A for the bare domain, CNAME for www, plus any TXT verification. */
export function buildDnsRecords(
    apex: string,
    apexConfig: DomainConfig | null,
    wwwConfig: DomainConfig | null,
    challenges: DomainVerificationChallenge[] = [],
): DnsRecord[] {
    const a = apexConfig?.recommendedIPv4[0] ?? DEFAULT_A_RECORD
    const cname = (wwwConfig?.recommendedCNAME[0] ?? DEFAULT_CNAME).replace(/\.$/, "")
    const seen = new Set<string>()
    return [
        { type: "A", host: "@", name: apex, value: a, purpose: "bare" } as DnsRecord,
        { type: "CNAME", host: "www", name: `www.${apex}`, value: cname, purpose: "www" } as DnsRecord,
        ...challengeRecords(apex, challenges),
    ].filter((r) => {
        const k = `${r.type}|${r.name}|${r.value}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
    })
}

/** Plain-language registrar steps for the console and the platform MCP. */
export function dnsInstructions(records: DnsRecord[]): string {
    const lines = ["Sign in where the domain was bought and open its DNS settings. Then:"]
    let n = 1
    for (const r of records) {
        if (r.purpose === "bare")
            lines.push(`${n++}. Add an A record for the bare domain (host "@") pointing to ${r.value}.`)
        else if (r.purpose === "www")
            lines.push(`${n++}. Add a CNAME record for www (host "www") pointing to ${r.value}.`)
        else lines.push(`${n++}. Add a ${r.type} record with host "${r.host}" and value ${r.value}.`)
    }
    lines.push('Remove any other A or CNAME records for "@" and "www".')
    lines.push("The change can take up to a few hours to show. Then press Check again.")
    return lines.join("\n")
}

async function safeConfig(vercel: VercelClient, name: string): Promise<DomainConfig | null> {
    try {
        return await vercel.getDomainConfig(name)
    } catch {
        return null
    }
}

export interface CustomDomainResult {
    orgId: string
    apex: string
    www: string
    status: CustomDomainStatus
    records: DnsRecord[]
    instructions: string
    primary: string
}

export async function addCustomDomain(orgId: string, domain: string, d?: TenantAddressDeps): Promise<CustomDomainResult> {
    assertOrgId(orgId)
    const { db, vercel, changeAuth, revalidate, now } = deps(d)
    const { apex, www } = normaliseCustomDomain(domain)
    await loadOrg(db, orgId)
    const others = await hostsOfOtherTenants(db, orgId)
    const owner = others.get(apex) ?? others.get(www)
    if (owner) throw new TenantAddressError("conflict", `${apex} already belongs to tenant ${owner}`)

    // www first (canonical, no redirect), then the bare domain redirecting to it (308).
    const wwwExisting = await vercel.getProjectDomain(www)
    const wwwD = wwwExisting ?? (await vercel.addProjectDomain(www))
    let apexD = await vercel.getProjectDomain(apex)
    if (!apexD) {
        try {
            apexD = await vercel.addProjectDomain(apex, { redirect: www, redirectStatusCode: 308 })
        } catch (e) {
            if (!wwwExisting) await vercel.removeProjectDomain(www).catch(() => {})
            throw e
        }
    }

    await changeAuth({ add: [apex, www] })

    const [apexCfg, wwwCfg] = await Promise.all([safeConfig(vercel, apex), safeConfig(vercel, www)])
    const records = buildDnsRecords(apex, apexCfg, wwwCfg, [...(apexD.verification ?? []), ...(wwwD.verification ?? [])])
    const t = now()
    let primary = ""
    let statusOut: CustomDomainStatus = "waiting_for_dns"
    await db.runTransaction(async (tx) => {
        const ref = db.collection("orgs").doc(orgId)
        const snap = await tx.get(ref)
        if (!snap.exists) throw new TenantAddressError("not_found", `No tenant orgs/${orgId}`)
        const data = snap.data() as Record<string, unknown>
        const cur = readDomains(data)
        const status = readStatus(data)
        const prev = status[apex]
        statusOut = prev?.status ?? "waiting_for_dns"
        status[apex] = {
            apex,
            www,
            status: statusOut,
            records,
            addedAt: prev?.addedAt ?? t,
            checkedAt: t,
        }
        primary = cur.primary
        tx.update(ref, {
            domains: { primary: cur.primary, aliases: dedupe([...cur.aliases, apex, www]).filter((h) => h !== cur.primary) },
            domainStatus: status,
        })
    })
    await revalidate()
    return { orgId, apex, www, status: statusOut, records, instructions: dnsInstructions(records), primary }
}

/** Status rule: live = both hosts verified and DNS right; verified = www works, bare not yet; else waiting. */
export function decideStatus(input: {
    wwwVerified: boolean
    apexVerified: boolean
    wwwMisconfigured: boolean
    apexMisconfigured: boolean
}): CustomDomainStatus {
    const wwwOk = input.wwwVerified && !input.wwwMisconfigured
    const apexOk = input.apexVerified && !input.apexMisconfigured
    if (wwwOk && apexOk) return "live"
    if (wwwOk) return "verified"
    return "waiting_for_dns"
}

export async function checkCustomDomain(orgId: string, domain: string, d?: TenantAddressDeps): Promise<CustomDomainResult> {
    assertOrgId(orgId)
    const { db, vercel, revalidate, now } = deps(d)
    const { apex, www } = normaliseCustomDomain(domain)
    const data = await loadOrg(db, orgId)
    const cur = readDomains(data)
    if (!cur.aliases.includes(apex) && !cur.aliases.includes(www) && cur.primary !== www)
        throw new TenantAddressError("not_attached", `${apex} is not one of this tenant's domains; add it first`)

    let [wwwD, apexD] = await Promise.all([vercel.getProjectDomain(www), vercel.getProjectDomain(apex)])
    if (!wwwD || !apexD) throw new TenantAddressError("not_attached", `${apex} is not attached to the Vercel project; add it again`)
    const tryVerify = async (name: string, cur: typeof wwwD) => {
        if (cur!.verified) return cur!
        try {
            return await vercel.verifyProjectDomain(name)
        } catch (e) {
            // Vercel answers 400 while the TXT record is not there yet.
            if (e instanceof VercelApiError && (e.kind === "invalid" || e.kind === "taken")) return cur!
            throw e
        }
    }
    wwwD = await tryVerify(www, wwwD)
    apexD = await tryVerify(apex, apexD)
    const [apexCfg, wwwCfg] = await Promise.all([vercel.getDomainConfig(apex), vercel.getDomainConfig(www)])
    const status = decideStatus({
        wwwVerified: wwwD.verified,
        apexVerified: apexD.verified,
        wwwMisconfigured: wwwCfg.misconfigured,
        apexMisconfigured: apexCfg.misconfigured,
    })
    const records = buildDnsRecords(apex, apexCfg, wwwCfg, [
        ...(apexD.verified ? [] : apexD.verification ?? []),
        ...(wwwD.verified ? [] : wwwD.verification ?? []),
    ])

    const t = now()
    let primary = ""
    let primaryChanged = false
    await db.runTransaction(async (tx) => {
        const ref = db.collection("orgs").doc(orgId)
        const snap = await tx.get(ref)
        if (!snap.exists) throw new TenantAddressError("not_found", `No tenant orgs/${orgId}`)
        const data2 = snap.data() as Record<string, unknown>
        const c = readDomains(data2)
        const st = readStatus(data2)
        st[apex] = { apex, www, status, records, addedAt: st[apex]?.addedAt ?? t, checkedAt: t }
        let domains = c
        if (status === "live" && c.primary !== www) {
            // The old primary (the vercel.app alias) keeps working as an alias.
            domains = { primary: www, aliases: dedupe([...c.aliases, c.primary]).filter((h) => h !== www) }
            primaryChanged = true
        }
        primary = domains.primary
        tx.update(ref, { domains, domainStatus: st })
    })
    if (primaryChanged || status === "live") await revalidate()
    return { orgId, apex, www, status, records, instructions: dnsInstructions(records), primary }
}

export interface RemoveCustomDomainResult {
    orgId: string
    apex: string
    www: string
    primary: string
    removedFromVercel: string[]
}

export async function removeCustomDomain(orgId: string, domain: string, d?: TenantAddressDeps): Promise<RemoveCustomDomainResult> {
    assertOrgId(orgId)
    const { db, vercel, changeAuth, revalidate } = deps(d)
    const { apex, www } = normaliseCustomDomain(domain)
    await loadOrg(db, orgId)
    const others = await hostsOfOtherTenants(db, orgId)
    const removed: string[] = []
    // The bare domain first (it redirects to www), then www. Never touch a host another tenant records.
    for (const h of [apex, www]) {
        if (others.has(h)) continue
        try {
            await vercel.removeProjectDomain(h)
            removed.push(h)
        } catch (e) {
            if (!(e instanceof VercelApiError && e.kind === "not_found")) throw e
        }
    }
    const authRemove = [apex, www].filter((h) => !others.has(h))
    if (authRemove.length) await changeAuth({ remove: authRemove })

    let primary = ""
    await db.runTransaction(async (tx) => {
        const ref = db.collection("orgs").doc(orgId)
        const snap = await tx.get(ref)
        if (!snap.exists) throw new TenantAddressError("not_found", `No tenant orgs/${orgId}`)
        const data = snap.data() as Record<string, unknown>
        const c = readDomains(data)
        const st = readStatus(data)
        delete st[apex]
        const aliases = c.aliases.filter((h) => h !== apex && h !== www)
        let p = c.primary
        if (p === apex || p === www) p = aliases.find((h) => h.endsWith(VERCEL_APP_SUFFIX)) ?? aliases[0] ?? p
        primary = p
        tx.update(ref, { domains: { primary: p, aliases: aliases.filter((h) => h !== p) }, domainStatus: st })
    })
    await revalidate()
    return { orgId, apex, www, primary, removedFromVercel: removed }
}
