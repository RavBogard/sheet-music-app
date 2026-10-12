import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const revalidateTag = vi.fn()
vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => revalidateTag(...a),
    unstable_cache: (fn: () => unknown) => fn,
}))

const orgDocs: Array<{ id: string; data: () => Record<string, unknown> }> = []
let orgsReadFails = false
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({
        collection: (name: string) => ({
            get: async () => {
                if (name !== "orgs") throw new Error(`unexpected collection ${name}`)
                if (orgsReadFails) throw new Error("orgs read failed")
                return { docs: orgDocs }
            },
        }),
    })),
}))

import { buildHostMap, compiledHostMap, getHostList, revalidateHostList, ORG_HOSTS_TAG } from "@/lib/org/hosts"
import {
    canonicalHostFor,
    expandDomainHosts,
    normalizeHost,
    sanitizeHostMap,
} from "@/lib/org/host-resolution"
import { codeOrgConfig } from "@/lib/org/config-code"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { GET as orgHostsGET } from "@/app/api/org-hosts/route"

const COMPILED = {
    "centralreform.live": "crc",
    "www.centralreform.live": "crc",
    "brotherslazaroff.live": "brotherslazaroff",
    "www.brotherslazaroff.live": "brotherslazaroff",
}

function doc(id: string, data: Record<string, unknown>) {
    return { id, data }
}

describe("normalizeHost", () => {
    it.each([
        ["WWW.Example.ORG", "www.example.org"],
        ["example.org:443", "example.org"],
        ["https://example.org/path", "example.org"],
        ["example.org.", "example.org"],
        ["  nava.vercel.app  ", "nava.vercel.app"],
        ["", ""],
        [null, ""],
        ["bad host", ""],
        ["exa_mple.org", ""],
    ])("%s → %s", (raw, expected) => {
        expect(normalizeHost(raw as string | null)).toBe(expected)
    })
})

describe("expandDomainHosts", () => {
    it("custom domain: bare and www, whichever was stored", () => {
        expect(expandDomainHosts("shul.org", [])).toEqual(["shul.org", "www.shul.org"])
        expect(expandDomainHosts("www.shul.org", [])).toEqual(["shul.org", "www.shul.org"])
    })
    it("vercel.app alias: exact only", () => {
        expect(expandDomainHosts("nava.vercel.app", [])).toEqual(["nava.vercel.app"])
    })
    it("aliases, lowercased and port-stripped, de-duplicated", () => {
        expect(expandDomainHosts("nava-2.vercel.app", ["NavaTehila.org:443", "www.navatehila.org", 7, null])).toEqual([
            "nava-2.vercel.app",
            "navatehila.org",
            "www.navatehila.org",
        ])
    })
})

describe("canonicalHostFor", () => {
    it.each([
        ["nava.vercel.app", "nava.vercel.app"],
        ["shul.org", "www.shul.org"],
        ["www.shul.org", "www.shul.org"],
        ["centralreform.live", "www.centralreform.live"],
    ])("%s → %s", (primary, expected) => {
        expect(canonicalHostFor(primary)).toBe(expected)
    })
})

describe("buildHostMap", () => {
    it("CRC and BL are always present from the compiled table", () => {
        expect(compiledHostMap()).toEqual(COMPILED)
        expect(buildHostMap([])).toEqual(COMPILED)
    })

    it("CRC/BL docs without domains, or suspended, do not remove them", () => {
        const map = buildHostMap([
            doc("crc", { status: "suspended" }),
            doc("brotherslazaroff", { domains: {} }),
        ])
        expect(map).toEqual(COMPILED)
    })

    it("CRC/BL docs may add aliases", () => {
        const crc = codeOrgConfig("crc")!
        const map = buildHostMap([doc("crc", { ...crc, domains: { primary: "centralreform.live", aliases: ["crc-music.vercel.app"] } })])
        expect(map["crc-music.vercel.app"]).toBe("crc")
    })

    it("adds an active third tenant's vercel.app alias exactly and its custom domain bare + www", () => {
        const cfg = makeTestOrgConfig({ domains: { primary: "testshul.vercel.app", aliases: ["TestShul.org"] } })
        const map = buildHostMap([doc("testshul", cfg as unknown as Record<string, unknown>)])
        expect(map).toEqual({
            ...COMPILED,
            "testshul.vercel.app": "testshul",
            "testshul.org": "testshul",
            "www.testshul.org": "testshul",
        })
    })

    it("a document without an id field takes the document id", () => {
        const { id: _id, ...rest } = makeTestOrgConfig()
        const map = buildHostMap([doc("testshul", rest as unknown as Record<string, unknown>)])
        expect(map["testshul.vercel.app"]).toBe("testshul")
    })

    it("skips a suspended tenant (its address gets no such site)", () => {
        const cfg = makeTestOrgConfig({ status: "suspended" })
        expect(buildHostMap([doc("testshul", cfg as unknown as Record<string, unknown>)])).toEqual(COMPILED)
    })

    it("skips any status other than active (e.g. archived)", () => {
        const cfg = { ...makeTestOrgConfig(), status: "archived" }
        expect(buildHostMap([doc("testshul", cfg as unknown as Record<string, unknown>)])).toEqual(COMPILED)
    })

    it("skips an invalid config and an id mismatch", () => {
        expect(buildHostMap([doc("testshul", { domains: { primary: "testshul.vercel.app" } })])).toEqual(COMPILED)
        const cfg = makeTestOrgConfig()
        expect(buildHostMap([doc("other", cfg as unknown as Record<string, unknown>)])).toEqual(COMPILED)
    })

    it("no tenant can claim a CRC or BL host", () => {
        const cfg = makeTestOrgConfig({ domains: { primary: "testshul.vercel.app", aliases: ["centralreform.live", "www.brotherslazaroff.live"] } })
        const map = buildHostMap([doc("testshul", cfg as unknown as Record<string, unknown>)])
        expect(map["centralreform.live"]).toBe("crc")
        expect(map["www.centralreform.live"]).toBe("crc")
        expect(map["www.brotherslazaroff.live"]).toBe("brotherslazaroff")
        expect(map["testshul.vercel.app"]).toBe("testshul")
    })

    it("a host claimed by two tenants goes to the first by id, whatever the read order", () => {
        const a = makeTestOrgConfig({ id: "alpha", domains: { primary: "alpha.vercel.app", aliases: ["shared.org"] } })
        const b = makeTestOrgConfig({ id: "beta", domains: { primary: "beta.vercel.app", aliases: ["shared.org"] } })
        const map = buildHostMap([
            doc("beta", b as unknown as Record<string, unknown>),
            doc("alpha", a as unknown as Record<string, unknown>),
        ])
        expect(map["shared.org"]).toBe("alpha")
        expect(map["www.shared.org"]).toBe("alpha")
        expect(map["beta.vercel.app"]).toBe("beta")
    })
})

describe("sanitizeHostMap", () => {
    it("keeps well-formed host → id pairs only", () => {
        expect(
            sanitizeHostMap({ "nava.vercel.app": "nava", "BAD HOST": "x", "ok.org": "Not Valid", "x.org": 3 }),
        ).toEqual({ "nava.vercel.app": "nava" })
        expect(sanitizeHostMap(null)).toBeNull()
        expect(sanitizeHostMap([])).toBeNull()
    })
})

describe("getHostList / the /api/org-hosts endpoint", () => {
    beforeEach(() => {
        orgDocs.length = 0
        orgsReadFails = false
        revalidateTag.mockClear()
    })
    afterEach(() => vi.unstubAllEnvs())

    it("code source: compiled tenants only, no Firestore read", async () => {
        vi.stubEnv("ORG_CONFIG_SOURCE", "code")
        orgDocs.push({ id: "testshul", data: () => makeTestOrgConfig() as unknown as Record<string, unknown> })
        const list = await getHostList()
        expect(list.hosts).toEqual(COMPILED)
    })

    it("firestore source: reads orgs", async () => {
        vi.stubEnv("ORG_CONFIG_SOURCE", "firestore")
        orgDocs.push({ id: "testshul", data: () => makeTestOrgConfig() as unknown as Record<string, unknown> })
        const list = await getHostList()
        expect(list.hosts).toEqual({ ...COMPILED, "testshul.vercel.app": "testshul" })
        expect(Number.isNaN(Date.parse(list.generatedAt))).toBe(false)
    })

    it("a failed orgs read answers with the compiled tenants", async () => {
        vi.stubEnv("ORG_CONFIG_SOURCE", "firestore")
        orgsReadFails = true
        expect((await getHostList()).hosts).toEqual(COMPILED)
    })

    it("GET /api/org-hosts → {hosts, generatedAt} with the CDN cache header", async () => {
        vi.stubEnv("ORG_CONFIG_SOURCE", "firestore")
        orgDocs.push({ id: "testshul", data: () => makeTestOrgConfig() as unknown as Record<string, unknown> })
        const res = await orgHostsGET()
        expect(res.status).toBe(200)
        expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=300")
        const body = await res.json()
        expect(Object.keys(body).sort()).toEqual(["generatedAt", "hosts"])
        expect(body.hosts["testshul.vercel.app"]).toBe("testshul")
        expect(body.hosts["www.centralreform.live"]).toBe("crc")
    })

    it("revalidateHostList clears the org-hosts tag", () => {
        revalidateHostList()
        expect(ORG_HOSTS_TAG).toBe("org-hosts")
        expect(revalidateTag).toHaveBeenCalledWith("org-hosts", { expire: 0 })
    })

    it("revalidateHostList never throws", () => {
        revalidateTag.mockImplementationOnce(() => {
            throw new Error("outside a request")
        })
        expect(() => revalidateHostList()).not.toThrow()
    })
})
