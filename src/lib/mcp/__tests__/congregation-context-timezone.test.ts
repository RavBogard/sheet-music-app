import { describe, it, expect, vi, afterEach } from "vitest"

/**
 * Multi-tenant phase 1 — get_congregation_context returns the tenant's time
 * zone. The golden block (everything but `timeZone`) was run against the code
 * before the field existed and is not edited.
 */

vi.mock("@/lib/server-auth", () => ({
    getServerCongregationConfig: async (org: string) =>
        org === "crc"
            ? { name: "CRC", shortName: "CRC Music", services: { friday_night: { label: "Erev", defaultStartLocal: "18:00" } } }
            : null,
}))
vi.mock("@/lib/server-setlists", () => ({
    getAllSetlists: async () => [{ id: "s1", name: "Fri", eventDate: "2026-06-05T23:00:00.000Z", templateType: "friday_night" }],
}))

import { getCongregationContext } from "@/lib/mcp/tools/congregation"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

afterEach(() => clearPrimedOrgConfigs())

function withoutTimeZone(r: any) {
    const { timeZone: _tz, ...congregation } = r.congregation
    void _tz
    return { ...r, congregation }
}

describe("get_congregation_context", () => {
    it.each(["crc", "brotherslazaroff"])("golden: %s output apart from timeZone", async (org) => {
        expect(withoutTimeZone(await getCongregationContext("u", {}, org))).toMatchSnapshot()
    })

    it.each(["crc", "brotherslazaroff"])("%s reports America/Chicago", async (org) => {
        const r = (await getCongregationContext("u", {}, org)) as any
        expect(r.congregation.timeZone).toBe("America/Chicago")
    })

    it("a Jerusalem tenant reports Asia/Jerusalem", async () => {
        primeTestOrg()
        const r = (await getCongregationContext("u", {}, "testshul")) as any
        expect(r.congregation.timeZone).toBe("Asia/Jerusalem")
    })
})
