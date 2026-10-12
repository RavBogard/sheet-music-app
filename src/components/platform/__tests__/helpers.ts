import { vi } from "vitest"
import { OrgConfigSchema, type OrgConfig } from "@/lib/org/config-schema"
import type { TenantDetail, TenantSummary } from "@/lib/platform/tenants"

/**
 * A routed fake for globalThis.fetch (the console calls apiFetch, which the
 * tests mock to plain fetch). Each handler matches METHOD + path regex and
 * returns {status, body}. Unmatched calls fail loudly with 599.
 */
export interface Call { method: string; url: string; path: string; query: URLSearchParams; body: unknown }
type Handler = (c: Call) => { status?: number; body: unknown }

export function installFetch(routes: Array<[string, RegExp, Handler]>) {
    const calls: Call[] = []
    const fn = vi.fn(async (input: string, init?: RequestInit) => {
        const u = new URL(input, "http://test.local")
        const method = (init?.method ?? "GET").toUpperCase()
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
        const c: Call = { method, url: input, path: u.pathname, query: u.searchParams, body }
        calls.push(c)
        const h = routes.find(([m, re]) => m === method && re.test(u.pathname))
        const r = h ? h[2](c) : { status: 599, body: { error: `unmocked ${method} ${u.pathname}` } }
        return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } })
    })
    globalThis.fetch = fn as unknown as typeof fetch
    return { calls, fn, find: (method: string, re: RegExp) => calls.filter((c) => c.method === method && re.test(c.path)) }
}

export function testConfig(over: Partial<{ id: string; name: string }> = {}): OrgConfig {
    const id = over.id ?? "mtprobe"
    const name = over.name ?? "Probe Tenant"
    return OrgConfigSchema.parse({
        id,
        name,
        status: "active",
        domains: { primary: `${id}.vercel.app`, aliases: [] },
        branding: {
            shortName: "Probe",
            abbreviation: "PT",
            appName: name,
            metaTitleDefault: name,
            metaTitleTemplate: `%s | ${name}`,
            metaDescription: "",
            ogTitle: name,
            themeColor: "#4f46e5",
            manifestPath: "/manifest.json",
            baseUrl: `https://${id}.vercel.app`,
        },
        vocabulary: { mode: "band" },
        locale: { language: "en", direction: "ltr", timeZone: "America/Chicago" },
        email: { fromName: name, headerBg: "#4f46e5", footerText: "" },
        legal: { operatorName: "Op" },
        features: { mixer: false, driveInbox: false, schedulingEmails: false, todayFeed: false, notifyBand: false, perform: true },
        library: {},
        liturgy: {},
        congregationDefaults: { name, shortName: "Probe", themeColor: "#4f46e5" },
    })
}

export function summary(over: Partial<TenantSummary> = {}): TenantSummary {
    return {
        orgId: "mtprobe",
        name: "Probe Tenant",
        status: "active",
        addresses: ["mtprobe.vercel.app"],
        primaryAddress: "mtprobe.vercel.app",
        memberCount: 2,
        pendingCount: 1,
        featuresOn: ["perform"],
        ...over,
    }
}

export function detail(over: Partial<TenantDetail> = {}): TenantDetail {
    return {
        summary: summary(),
        config: testConfig(),
        domainStatus: {},
        membersByRole: { admin: 1 },
        collections: [],
        ...over,
    }
}

export const dryResult = (diff: Array<{ path: string; before: unknown; after: unknown }>, dryRun = true) => ({
    dryRun,
    changed: diff.length > 0,
    before: null,
    after: null,
    diff,
})

/** Radix bits jsdom lacks. */
export function polyfillDom() {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") {
        g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
}
