import { describe, expect, it } from "vitest"
import { changedTopKeys, deepMerge, diffValues } from "@/lib/platform/diff"
import { buildNewTenantConfig } from "@/lib/platform/new-tenant-config"
import { desiredCollections, planCollectionSeed } from "@/lib/platform/collection-seed"
import { codeOrgConfig } from "@/lib/org/config-code"

describe("diff", () => {
    it("reports leaf paths and treats arrays as one value", () => {
        const d = diffValues({ a: { b: 1, c: [1, 2] }, x: "same" }, { a: { b: 2, c: [1, 2, 3] }, x: "same" })
        expect(d).toEqual([
            { path: "a.b", before: 1, after: 2 },
            { path: "a.c", before: [1, 2], after: [1, 2, 3] },
        ])
    })

    it("deepMerge merges objects, replaces arrays, skips undefined", () => {
        const out = deepMerge({ a: { b: 1, c: 2 }, l: [1, 2], k: "keep" }, { a: { b: 9 }, l: [3], k: undefined })
        expect(out).toEqual({ a: { b: 9, c: 2 }, l: [3], k: "keep" })
    })

    it("changedTopKeys", () => {
        expect(changedTopKeys({ a: 1, b: { x: 1 } }, { a: 1, b: { x: 2 }, c: 3 })).toEqual(["b", "c"])
    })
})

describe("buildNewTenantConfig", () => {
    it("fills a valid neutral config from a name and subdomain", () => {
        const r = buildNewTenantConfig("nava-tehila", { name: "Nava Tehila" }, "nava")
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.config.domains.primary).toBe("nava.vercel.app")
        expect(r.config.branding.baseUrl).toBe("https://nava.vercel.app")
        expect(r.config.branding.abbreviation).toBe("NT")
        expect(r.config.status).toBe("active")
        expect(r.config.features.perform).toBe(true)
        expect(r.config.features.mixer).toBe(false)
        // Nothing of CRC's text leaks into a new tenant.
        expect(JSON.stringify(r.config)).not.toMatch(/Central Reform|CRC/)
    })

    it("hebrew implies rtl; copyLiturgyFrom copies service types, rabbi slots and books", () => {
        const crc = codeOrgConfig("crc")!
        const r = buildNewTenantConfig("nt", { name: "NT", locale: { language: "he", timeZone: "Asia/Jerusalem" } }, "nt", crc)
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.config.locale.direction).toBe("rtl")
        expect(r.config.liturgy.serviceTypes).toEqual(crc.liturgy.serviceTypes)
        expect(r.config.liturgy.rabbiSlots).toEqual(crc.liturgy.rabbiSlots)
        expect(r.config.liturgy.books).toEqual(crc.liturgy.books)
    })

    it("returns the schema's complaint for a bad value", () => {
        const r = buildNewTenantConfig("nt", { name: "NT", branding: { themeColor: "purple" } }, "nt")
        expect(r.ok).toBe(false)
        if (r.ok) return
        expect(r.error).toMatch(/branding\.themeColor/)
    })
})

describe("collections seed (dry-run plan)", () => {
    const crc = codeOrgConfig("crc")!
    const bl = codeOrgConfig("brotherslazaroff")!
    const counts = (o: string, k: string) => (o === "crc" ? { core: 500, supplemental: 120, nava: 140, uploads: 160 }[k] ?? 0 : 63)

    it("plans CRC's four and BL's two, private and unshared", () => {
        const desired = desiredCollections([crc, bl], counts)
        expect(desired.map((d) => d.id)).toEqual([
            "crc__core",
            "crc__supplemental",
            "crc__nava",
            "crc__uploads",
            "brotherslazaroff__core",
            "brotherslazaroff__uploads",
        ])
        for (const d of desired) {
            expect(d.visibility).toBe("private")
            expect(d.sharedWith).toEqual([])
            expect(d.assignedTo).toEqual([])
        }
        expect(desired.find((d) => d.id === "crc__nava")).toMatchObject({ ownerOrgId: "crc", name: "nava", label: "Nava Tehilah", chartCount: 140 })
        const plan = planCollectionSeed(desired, new Map())
        expect(plan.creates).toHaveLength(6)
        expect(plan.updates).toHaveLength(0)
    })

    it("is idempotent and never touches an existing record's sharing", () => {
        const desired = desiredCollections([crc], counts)
        const existing = new Map<string, Record<string, unknown>>(
            desired.map((d) => [d.id, { ...d, sharedWith: ["nava-tehila"], visibility: "listed" }]),
        )
        existing.get("crc__core")!.chartCount = 499
        const plan = planCollectionSeed(desired, existing)
        expect(plan.creates).toEqual([])
        expect(plan.updates).toEqual([{ id: "crc__core", set: { chartCount: 500 }, before: existing.get("crc__core") }])
        expect(plan.unchanged).toHaveLength(3)
    })
})
