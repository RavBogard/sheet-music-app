import "server-only"
import type { OrgId } from "@/lib/org/types"
import { ORGS } from "@/lib/org/registry"
import { diffValues } from "@/lib/platform/diff"
import {
    addCustomDomain,
    checkCustomDomain,
    normaliseCustomDomain,
    removeCustomDomain,
    TenantAddressError,
    type CustomDomainResult,
} from "@/lib/platform/tenant-address"
import { PlatformError, readTenantConfig, recordPlatformAudit, type WriteOpts, type WriteResult } from "@/lib/platform/tenants"

/**
 * Multi-tenant phase 4: the platform MCP's domain tools on top of phase 3's
 * address library (tenant-address.ts): a dry run first, an audit row after,
 * and one refusal phase 3's routes do not have — CRC's and BL's own domains
 * are never detached from here.
 */

export interface DomainsView {
    primary: string
    aliases: string[]
}

async function domainsOf(orgId: OrgId): Promise<DomainsView> {
    const t = await readTenantConfig(orgId)
    if (!t) throw new PlatformError("not_found", `There is no tenant "${orgId}".`)
    return { primary: t.config.domains.primary, aliases: [...t.config.domains.aliases] }
}

function normalise(domain: string) {
    try {
        return normaliseCustomDomain(domain)
    } catch (e) {
        if (e instanceof TenantAddressError) throw new PlatformError("invalid", e.message)
        throw e
    }
}

const BUILT_IN_APEXES = new Set(Object.values(ORGS).map((o) => o.domain.toLowerCase()))

export async function addTenantDomain(
    orgId: OrgId,
    domain: string,
    opts: WriteOpts,
): Promise<WriteResult<DomainsView> & Partial<Pick<CustomDomainResult, "records" | "instructions" | "status">>> {
    const { apex, www } = normalise(domain)
    const before = await domainsOf(orgId)
    if (opts.dryRun !== false) {
        const after = { primary: before.primary, aliases: [...new Set([...before.aliases, apex, www])] }
        return { dryRun: true, changed: true, before, after, diff: diffValues(before, after) }
    }
    const r = await addCustomDomain(orgId, apex)
    const after = await domainsOf(orgId)
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "add_tenant_domain",
        orgId,
        before,
        after: { ...after, status: r.status },
    })
    return {
        dryRun: false,
        changed: true,
        before,
        after,
        diff: diffValues(before, after),
        auditId,
        records: r.records,
        instructions: r.instructions,
        status: r.status,
    }
}

export async function checkTenantDomain(orgId: OrgId, domain: string): Promise<CustomDomainResult> {
    const { apex } = normalise(domain)
    await domainsOf(orgId)
    return checkCustomDomain(orgId, apex)
}

export async function removeTenantDomain(orgId: OrgId, domain: string, opts: WriteOpts): Promise<WriteResult<DomainsView>> {
    const { apex, www } = normalise(domain)
    if (BUILT_IN_APEXES.has(apex))
        throw new PlatformError("forbidden", `${apex} is a built-in address of a compiled tenant and is not removed from here.`)
    const before = await domainsOf(orgId)
    if (![before.primary, ...before.aliases].some((h) => h === apex || h === www))
        throw new PlatformError("not_found", `${apex} is not one of this tenant's addresses.`)
    if (opts.dryRun !== false) {
        const aliases = before.aliases.filter((h) => h !== apex && h !== www)
        let primary = before.primary
        if (primary === apex || primary === www) primary = aliases.find((h) => h.endsWith(".vercel.app")) ?? aliases[0] ?? primary
        const after = { primary, aliases: aliases.filter((h) => h !== primary) }
        return { dryRun: true, changed: true, before, after, diff: diffValues(before, after) }
    }
    await removeCustomDomain(orgId, apex)
    const after = await domainsOf(orgId)
    const auditId = await recordPlatformAudit({
        actorUid: opts.actor.uid,
        actorEmail: opts.actor.email ?? null,
        via: opts.actor.via,
        action: "remove_tenant_domain",
        orgId,
        before,
        after,
    })
    return { dryRun: false, changed: true, before, after, diff: diffValues(before, after), auditId }
}
