import { describe, it, expect, vi } from "vitest"
import { createVercelClient, mapVercelError, VercelApiError } from "@/lib/platform/vercel"

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

function mockFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
    const calls: Call[] = []
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
            url,
            method: init?.method ?? "GET",
            headers: (init?.headers ?? {}) as Record<string, string>,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        })
        const r = responses.shift() ?? { status: 500, body: {} }
        return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: r.headers })
    })
    return { fn: fn as unknown as typeof fetch, calls }
}

const opts = { token: "tok", projectId: "prj_1", teamId: "team_1" }

describe("vercel client", () => {
    it("POSTs /v10/projects/{id}/domains with name only for an alias, team id and bearer", async () => {
        const f = mockFetch([{ status: 200, body: { name: "x.vercel.app", verified: true } }])
        const c = createVercelClient({ ...opts, fetch: f.fn })
        const d = await c.addProjectDomain("x.vercel.app")
        expect(d.verified).toBe(true)
        expect(f.calls[0].url).toBe("https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_1")
        expect(f.calls[0].method).toBe("POST")
        expect(f.calls[0].headers.Authorization).toBe("Bearer tok")
        expect(f.calls[0].body).toEqual({ name: "x.vercel.app" })
    })

    it("sends redirect + redirectStatusCode in the same POST for the bare domain", async () => {
        const f = mockFetch([{ status: 200, body: { name: "example.org", redirect: "www.example.org", redirectStatusCode: 308 } }])
        const c = createVercelClient({ ...opts, fetch: f.fn })
        const d = await c.addProjectDomain("example.org", { redirect: "www.example.org", redirectStatusCode: 308 })
        expect(f.calls[0].body).toEqual({ name: "example.org", redirect: "www.example.org", redirectStatusCode: 308 })
        expect(d.redirect).toBe("www.example.org")
        expect(d.redirectStatusCode).toBe(308)
    })

    it("defaults redirectStatusCode to 308", async () => {
        const f = mockFetch([{ status: 200, body: { name: "example.org" } }])
        await createVercelClient({ ...opts, fetch: f.fn }).addProjectDomain("example.org", { redirect: "www.example.org" })
        expect(f.calls[0].body).toMatchObject({ redirectStatusCode: 308 })
    })

    it("GET/DELETE/verify/config use the documented paths", async () => {
        const f = mockFetch([
            { status: 200, body: { name: "a.vercel.app", verified: true } },
            { status: 200, body: {} },
            { status: 200, body: { name: "a.org", verified: true } },
            {
                status: 200,
                body: {
                    misconfigured: true,
                    configuredBy: null,
                    recommendedIPv4: [{ rank: 2, value: ["1.1.1.1"] }, { rank: 1, value: ["76.76.21.21"] }],
                    recommendedCNAME: [{ rank: 1, value: "abc.vercel-dns-017.com." }],
                },
            },
        ])
        const c = createVercelClient({ ...opts, teamId: undefined, fetch: f.fn })
        await c.getProjectDomain("a.vercel.app")
        await c.removeProjectDomain("a.vercel.app")
        await c.verifyProjectDomain("a.org")
        const cfg = await c.getDomainConfig("a.org")
        expect(f.calls.map((x) => `${x.method} ${x.url}`)).toEqual([
            "GET https://api.vercel.com/v9/projects/prj_1/domains/a.vercel.app",
            "DELETE https://api.vercel.com/v9/projects/prj_1/domains/a.vercel.app",
            "POST https://api.vercel.com/v9/projects/prj_1/domains/a.org/verify",
            "GET https://api.vercel.com/v6/domains/a.org/config?projectIdOrName=prj_1",
        ])
        expect(cfg).toEqual({
            misconfigured: true,
            configuredBy: null,
            recommendedIPv4: ["76.76.21.21", "1.1.1.1"],
            recommendedCNAME: ["abc.vercel-dns-017.com."],
        })
    })

    it("getProjectDomain returns null on 404", async () => {
        const f = mockFetch([{ status: 404, body: { error: { code: "not_found", message: "nope" } } }])
        expect(await createVercelClient({ ...opts, fetch: f.fn }).getProjectDomain("z.vercel.app")).toBeNull()
    })

    it("never retries a failed POST", async () => {
        const f = mockFetch([{ status: 500, body: { error: { code: "internal", message: "boom" } } }])
        await expect(createVercelClient({ ...opts, fetch: f.fn }).addProjectDomain("x.vercel.app")).rejects.toMatchObject({ kind: "upstream" })
        expect(f.calls).toHaveLength(1)
    })

    it("refuses with config_missing when token or project is unset, without calling fetch", async () => {
        const f = mockFetch([])
        const c = createVercelClient({ token: "", projectId: "", fetch: f.fn })
        await expect(c.addProjectDomain("x.vercel.app")).rejects.toMatchObject({ kind: "config_missing" })
        expect(f.calls).toHaveLength(0)
    })

    it("network failure is upstream", async () => {
        const c = createVercelClient({ ...opts, fetch: (async () => { throw new Error("ECONNRESET") }) as unknown as typeof fetch })
        await expect(c.getDomainConfig("a.org")).rejects.toBeInstanceOf(VercelApiError)
    })
})

describe("mapVercelError", () => {
    const e = (code: string, message = "m") => ({ error: { code, message } })
    it.each([
        [409, e("domain_already_in_use"), "taken"],
        [400, e("domain_taken"), "taken"],
        [403, e("forbidden", "The domain is already in use by another project"), "taken"],
        [403, e("forbidden", "You don't have permission"), "forbidden"],
        [401, e("unauthorized"), "forbidden"],
        [400, e("invalid_domain", "Invalid domain name"), "invalid"],
        [429, e("rate_limited"), "rate_limited"],
        [404, e("not_found"), "not_found"],
        [502, e("bad_gateway"), "upstream"],
    ])("%s %j → %s", (status, body, kind) => {
        expect(mapVercelError(status as number, body, null).kind).toBe(kind)
    })
    it("keeps Vercel's code and Retry-After", () => {
        const err = mapVercelError(429, e("rate_limited"), "17")
        expect(err.code).toBe("rate_limited")
        expect(err.retryAfter).toBe(17)
    })
})
