import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/org/get-org-config", () => ({ getOrgConfig: async () => null }))

describe("/site.webmanifest", () => {
    it("names the request's tenant (BL here), never CRC", async () => {
        const { GET } = await import("@/app/site.webmanifest/route")
        const res = await GET(new NextRequest("https://www.brotherslazaroff.live/site.webmanifest", { headers: { "x-org-id": "brotherslazaroff" } }))
        expect(res.headers.get("content-type")).toContain("application/manifest+json")
        const m = await res.json()
        expect(m.name).toBe("Brothers Lazaroff")
        expect(JSON.stringify(m)).not.toContain("Central Reform")
        expect(m.icons).toHaveLength(2)
    })
})
