import { describe, it, expect, vi } from "vitest"
import { fakeFirestore } from "./fake-firestore"
import { VercelApiError, type DomainConfig, type ProjectDomain, type VercelClient } from "@/lib/platform/vercel"
import {
    addCustomDomain,
    buildDnsRecords,
    checkCustomDomain,
    decideStatus,
    defaultAddressCandidates,
    dnsInstructions,
    normaliseCustomDomain,
    provisionDefaultAddress,
    removeCustomDomain,
    TenantAddressError,
} from "@/lib/platform/tenant-address"

/** In-memory Vercel project: `attached` are on our project; `taken` belong to someone else. */
function fakeVercel(opts: { taken?: string[]; attached?: Record<string, Partial<ProjectDomain>>; config?: Record<string, Partial<DomainConfig>> } = {}) {
    const taken = new Set(opts.taken ?? [])
    const attached = new Map<string, ProjectDomain>()
    for (const [n, d] of Object.entries(opts.attached ?? {})) attached.set(n, { name: n, verified: true, ...d })
    const config = new Map<string, Partial<DomainConfig>>(Object.entries(opts.config ?? {}))
    const client: VercelClient = {
        addProjectDomain: vi.fn(async (name: string, o?: { redirect?: string; redirectStatusCode?: 307 | 308 }) => {
            if (taken.has(name)) throw new VercelApiError("taken", `${name} is already in use`, { status: 409, code: "domain_already_in_use" })
            if (attached.has(name)) throw new VercelApiError("taken", "already on project", { status: 409 })
            const d: ProjectDomain = {
                name,
                verified: true,
                redirect: o?.redirect ?? null,
                redirectStatusCode: o?.redirectStatusCode ?? null,
            }
            attached.set(name, d)
            return d
        }),
        removeProjectDomain: vi.fn(async (name: string) => {
            if (!attached.delete(name)) throw new VercelApiError("not_found", "no", { status: 404 })
        }),
        getProjectDomain: vi.fn(async (name: string) => attached.get(name) ?? null),
        getDomainConfig: vi.fn(async (name: string) => ({
            misconfigured: true,
            configuredBy: null,
            recommendedIPv4: ["76.76.21.21"],
            recommendedCNAME: ["cname.vercel-dns.com"],
            ...config.get(name),
        })),
        verifyProjectDomain: vi.fn(async (name: string) => attached.get(name)!),
    }
    return { client, attached, taken, config }
}

const orgDoc = (id: string, primary: string, aliases: string[] = []) => ({ id, name: id, domains: { primary, aliases } })

function setup(opts: Parameters<typeof fakeVercel>[0] = {}, orgs: Record<string, Record<string, unknown>> = {}) {
    const f = fakeFirestore({
        "orgs/crc": { ...orgDoc("crc", "centralreform.live"), domain: "centralreform.live" },
        "orgs/brotherslazaroff": { ...orgDoc("brotherslazaroff", "brotherslazaroff.live"), domain: "brotherslazaroff.live" },
        "orgs/probe": orgDoc("probe", "probe.vercel.app"),
        ...orgs,
    })
    const v = fakeVercel(opts)
    const changeAuthDomains = vi.fn(async (change: { add?: string[]; remove?: string[] }) => ({
        domains: [],
        size: 9,
        added: change.add ?? [],
        removed: change.remove ?? [],
        changed: true,
    }))
    const revalidate = vi.fn(async () => {})
    const deps = { db: f.db, vercel: v.client, changeAuthDomains, revalidate, now: () => 1000 }
    return { ...f, v, changeAuthDomains, revalidate, deps }
}

describe("defaultAddressCandidates", () => {
    it("is the documented sequence, 8 names", () => {
        expect(defaultAddressCandidates("nava")).toEqual([
            "nava.vercel.app",
            "nava-music.vercel.app",
            "nava-app.vercel.app",
            "nava-2.vercel.app",
            "nava-3.vercel.app",
            "nava-4.vercel.app",
            "nava-5.vercel.app",
            "nava-6.vercel.app",
        ])
    })
    it("rejects a bad slug", () => {
        expect(() => defaultAddressCandidates("Bad Slug")).toThrow(TenantAddressError)
    })
})

describe("provisionDefaultAddress", () => {
    it("adds <slug>.vercel.app, stores it as primary, authorizes it, revalidates", async () => {
        const s = setup()
        const r = await provisionDefaultAddress("probe", "probe", s.deps)
        // the placeholder primary was not attached → tries the first candidate
        expect(r).toMatchObject({ host: "probe.vercel.app", reused: false, tried: [], authDomainsSize: 9 })
        expect(s.v.client.addProjectDomain).toHaveBeenCalledWith("probe.vercel.app")
        expect(s.changeAuthDomains).toHaveBeenCalledWith({ add: ["probe.vercel.app"] }, expect.anything())
        expect(s.store.get("orgs/probe")).toMatchObject({
            domains: { primary: "probe.vercel.app", aliases: [] },
            defaultAddress: { host: "probe.vercel.app", requestedSlug: "probe", tried: [] },
        })
        expect(s.revalidate).toHaveBeenCalled()
    })

    it("falls back through the sequence when names are taken", async () => {
        const s = setup({ taken: ["probe.vercel.app", "probe-music.vercel.app"] })
        const r = await provisionDefaultAddress("probe", "probe", s.deps)
        expect(r.host).toBe("probe-app.vercel.app")
        expect(r.tried).toEqual(["probe.vercel.app", "probe-music.vercel.app"])
        expect(s.store.get("orgs/probe")).toMatchObject({ domains: { primary: "probe-app.vercel.app" } })
    })

    it("skips a name another tenant records without calling Vercel for it", async () => {
        const s = setup({}, { "orgs/other": orgDoc("other", "probe.vercel.app") })
        const r = await provisionDefaultAddress("probe", "probe", s.deps)
        expect(r.host).toBe("probe-music.vercel.app")
        expect(s.v.client.addProjectDomain).not.toHaveBeenCalledWith("probe.vercel.app")
    })

    it("fails exhausted when all 8 are taken, writing nothing", async () => {
        const s = setup({ taken: defaultAddressCandidates("probe") })
        await expect(provisionDefaultAddress("probe", "probe", s.deps)).rejects.toMatchObject({ kind: "exhausted" })
        expect(s.changeAuthDomains).not.toHaveBeenCalled()
        expect(s.store.get("orgs/probe")).toEqual(orgDoc("probe", "probe.vercel.app"))
    })

    it("is idempotent: an attached vercel.app primary is returned, nothing added", async () => {
        const s = setup({ attached: { "probe.vercel.app": {} } })
        const r = await provisionDefaultAddress("probe", "probe", s.deps)
        expect(r).toMatchObject({ host: "probe.vercel.app", reused: true })
        expect(s.v.client.addProjectDomain).not.toHaveBeenCalled()
        const again = await provisionDefaultAddress("probe", "probe", s.deps)
        expect(again.reused).toBe(true)
    })

    it("running twice adds once", async () => {
        const s = setup()
        await provisionDefaultAddress("probe", "probe", s.deps)
        await provisionDefaultAddress("probe", "probe", s.deps)
        expect(s.v.client.addProjectDomain).toHaveBeenCalledTimes(1)
    })

    it("propagates a non-taken Vercel error without trying more names", async () => {
        const s = setup()
        ;(s.v.client.addProjectDomain as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new VercelApiError("forbidden", "bad token", { status: 403 }))
        await expect(provisionDefaultAddress("probe", "probe", s.deps)).rejects.toMatchObject({ kind: "forbidden" })
        expect(s.v.client.addProjectDomain).toHaveBeenCalledTimes(1)
    })

    it("refuses a missing tenant", async () => {
        const s = setup()
        await expect(provisionDefaultAddress("nope", "nope", s.deps)).rejects.toMatchObject({ kind: "not_found" })
    })
})

describe("custom domains", () => {
    it("normalises input", () => {
        expect(normaliseCustomDomain(" https://WWW.Example.org/path?x=1 ")).toEqual({ apex: "example.org", www: "www.example.org" })
        expect(normaliseCustomDomain("example.org.")).toEqual({ apex: "example.org", www: "www.example.org" })
        expect(() => normaliseCustomDomain("x.vercel.app")).toThrow(TenantAddressError)
        expect(() => normaliseCustomDomain("not a domain")).toThrow(TenantAddressError)
        expect(() => normaliseCustomDomain("localhost")).toThrow(TenantAddressError)
    })

    it("add: www first, then bare with a 308 redirect to www; authorizes both; aliases + waiting status; primary unchanged", async () => {
        const s = setup()
        const r = await addCustomDomain("probe", "Example.org", s.deps)
        const add = s.v.client.addProjectDomain as ReturnType<typeof vi.fn>
        expect(add.mock.calls).toEqual([["www.example.org"], ["example.org", { redirect: "www.example.org", redirectStatusCode: 308 }]])
        expect(s.changeAuthDomains).toHaveBeenCalledWith({ add: ["example.org", "www.example.org"] }, expect.anything())
        expect(r.status).toBe("waiting_for_dns")
        expect(r.primary).toBe("probe.vercel.app")
        expect(r.records.map((x) => `${x.type} ${x.host} ${x.value}`)).toEqual(["A @ 76.76.21.21", "CNAME www cname.vercel-dns.com"])
        expect(r.instructions).toContain('Add an A record for the bare domain (host "@") pointing to 76.76.21.21.')
        const doc = s.store.get("orgs/probe") as Record<string, any>
        expect(doc.domains).toEqual({ primary: "probe.vercel.app", aliases: ["example.org", "www.example.org"] })
        expect(doc.domainStatus["example.org"]).toMatchObject({ status: "waiting_for_dns", www: "www.example.org" })
        expect(s.revalidate).toHaveBeenCalled()
    })

    it("add: rolls back www when the bare-domain add fails", async () => {
        const s = setup({ taken: ["example.org"] })
        await expect(addCustomDomain("probe", "example.org", s.deps)).rejects.toMatchObject({ kind: "taken" })
        expect(s.v.attached.has("www.example.org")).toBe(false)
        expect(s.changeAuthDomains).not.toHaveBeenCalled()
    })

    it("add: refuses a domain another tenant has", async () => {
        const s = setup()
        await expect(addCustomDomain("probe", "www.centralreform.live", s.deps)).rejects.toMatchObject({ kind: "conflict" })
        expect(s.v.client.addProjectDomain).not.toHaveBeenCalled()
    })

    it("add: includes TXT verification records when Vercel asks for them", async () => {
        const s = setup()
        ;(s.v.client.addProjectDomain as ReturnType<typeof vi.fn>).mockImplementationOnce(async (name: string) => {
            const d = { name, verified: false, verification: [{ type: "TXT", domain: "_vercel.example.org", value: "vc-domain-verify=abc" }] }
            s.v.attached.set(name, d)
            return d
        })
        const r = await addCustomDomain("probe", "example.org", s.deps)
        expect(r.records).toContainEqual({ type: "TXT", host: "_vercel", name: "_vercel.example.org", value: "vc-domain-verify=abc", purpose: "verify" })
        expect(r.instructions).toContain('Add a TXT record with host "_vercel" and value vc-domain-verify=abc.')
    })

    it("check: waiting → verified → live; live promotes www to primary and keeps the alias", async () => {
        const s = setup()
        await addCustomDomain("probe", "example.org", s.deps)
        s.revalidate.mockClear()

        let r = await checkCustomDomain("probe", "example.org", s.deps)
        expect(r.status).toBe("waiting_for_dns")
        expect(r.primary).toBe("probe.vercel.app")
        expect(s.revalidate).not.toHaveBeenCalled()

        s.v.config.set("www.example.org", { misconfigured: false })
        r = await checkCustomDomain("probe", "example.org", s.deps)
        expect(r.status).toBe("verified")
        expect(r.primary).toBe("probe.vercel.app")

        s.v.config.set("example.org", { misconfigured: false })
        r = await checkCustomDomain("probe", "www.example.org", s.deps)
        expect(r.status).toBe("live")
        expect(r.primary).toBe("www.example.org")
        const doc = s.store.get("orgs/probe") as Record<string, any>
        expect(doc.domains.primary).toBe("www.example.org")
        expect(doc.domains.aliases).toEqual(expect.arrayContaining(["example.org", "probe.vercel.app"]))
        expect(doc.domains.aliases).not.toContain("www.example.org")
        expect(doc.domainStatus["example.org"].status).toBe("live")
        expect(s.revalidate).toHaveBeenCalled()
    })

    it("check: calls verify for an unverified host and tolerates Vercel's 400 while the TXT is missing", async () => {
        const s = setup({ attached: { "example.org": { verified: false }, "www.example.org": { verified: false } } }, {
            "orgs/probe": orgDoc("probe", "probe.vercel.app", ["example.org", "www.example.org"]),
        })
        ;(s.v.client.verifyProjectDomain as ReturnType<typeof vi.fn>).mockRejectedValue(new VercelApiError("invalid", "TXT missing", { status: 400 }))
        const r = await checkCustomDomain("probe", "example.org", s.deps)
        expect(s.v.client.verifyProjectDomain).toHaveBeenCalledTimes(2)
        expect(r.status).toBe("waiting_for_dns")
    })

    it("check: refuses a domain the tenant never added", async () => {
        const s = setup()
        await expect(checkCustomDomain("probe", "example.org", s.deps)).rejects.toMatchObject({ kind: "not_attached" })
    })

    it("remove: detaches both, deauthorizes both, restores the vercel.app primary", async () => {
        const s = setup()
        await addCustomDomain("probe", "example.org", s.deps)
        s.v.config.set("www.example.org", { misconfigured: false })
        s.v.config.set("example.org", { misconfigured: false })
        await checkCustomDomain("probe", "example.org", s.deps)
        const r = await removeCustomDomain("probe", "example.org", s.deps)
        expect(r.removedFromVercel).toEqual(["example.org", "www.example.org"])
        expect(s.changeAuthDomains).toHaveBeenLastCalledWith({ remove: ["example.org", "www.example.org"] }, expect.anything())
        const doc = s.store.get("orgs/probe") as Record<string, any>
        expect(doc.domains).toEqual({ primary: "probe.vercel.app", aliases: [] })
        expect(doc.domainStatus).toEqual({})
    })

    it("remove: tolerates hosts already gone from Vercel", async () => {
        const s = setup()
        const r = await removeCustomDomain("probe", "example.org", s.deps)
        expect(r.removedFromVercel).toEqual([])
    })
})

describe("status, records, instructions", () => {
    it("decideStatus", () => {
        const base = { wwwVerified: true, apexVerified: true, wwwMisconfigured: true, apexMisconfigured: true }
        expect(decideStatus(base)).toBe("waiting_for_dns")
        expect(decideStatus({ ...base, wwwMisconfigured: false })).toBe("verified")
        expect(decideStatus({ ...base, wwwMisconfigured: false, apexMisconfigured: false })).toBe("live")
        expect(decideStatus({ ...base, wwwVerified: false, wwwMisconfigured: false, apexMisconfigured: false })).toBe("waiting_for_dns")
    })

    it("buildDnsRecords uses Vercel's recommendation, else the defaults", () => {
        const cfg = (a: string[], c: string[]): DomainConfig => ({ misconfigured: true, configuredBy: null, recommendedIPv4: a, recommendedCNAME: c })
        expect(buildDnsRecords("e.org", cfg(["1.2.3.4"], []), cfg([], ["x.vercel-dns-017.com."]))).toEqual([
            { type: "A", host: "@", name: "e.org", value: "1.2.3.4", purpose: "bare" },
            { type: "CNAME", host: "www", name: "www.e.org", value: "x.vercel-dns-017.com", purpose: "www" },
        ])
        expect(buildDnsRecords("e.org", null, null).map((r) => r.value)).toEqual(["76.76.21.21", "cname.vercel-dns.com"])
    })

    it("dnsInstructions is short, plain English", () => {
        const text = dnsInstructions(buildDnsRecords("example.org", null, null))
        expect(text).toBe(
            [
                "Sign in where the domain was bought and open its DNS settings. Then:",
                '1. Add an A record for the bare domain (host "@") pointing to 76.76.21.21.',
                '2. Add a CNAME record for www (host "www") pointing to cname.vercel-dns.com.',
                'Remove any other A or CNAME records for "@" and "www".',
                "The change can take up to a few hours to show. Then press Check again.",
            ].join("\n"),
        )
    })
})
