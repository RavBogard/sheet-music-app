import { beforeEach, describe, expect, it, vi } from "vitest"
import { isValidElement, type ReactElement } from "react"

/**
 * Multi-tenant phase 6 (lane 2): the pages a flag owns answer 404 on the
 * server when the tenant has it off. /monitor (and /monitor/admin) belong to
 * the mixer, which is CRC-only whatever the flag says; every /perform route
 * belongs to `perform`. CRC and Brothers Lazaroff keep both as today: Perform
 * on for both (its links are texted to the band), the mixer on CRC only.
 */

const h = vi.hoisted(() => ({ org: "crc", configs: {} as Record<string, unknown> }))

vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND")
    },
}))
vi.mock("@/lib/org/request-org", () => ({ requestOrg: async () => ({ orgId: h.org, config: h.configs[h.org] ?? null }) }))
vi.mock("@/lib/org/get-org-config", () => ({ getOrgConfig: async (id: string) => h.configs[id] ?? null }))
vi.mock("@/app/perform/PerformClientLayout", () => ({
    PerformClientLayout: ({ children }: { children: React.ReactNode }) => children,
}))

import { codeOrgConfig } from "@/lib/org/config-code"
import { OrgConfigSchema, type OrgFeatures } from "@/lib/org/config-schema"
import PerformLayout from "@/app/perform/layout"
import MonitorLayout from "@/app/(main)/monitor/layout"

const ALL_ON: OrgFeatures = { mixer: true, driveInbox: true, schedulingEmails: true, todayFeed: true, notifyBand: true, perform: true }
const CRC = codeOrgConfig("crc")!
const BL = codeOrgConfig("brotherslazaroff")!

function throwaway(features: Partial<OrgFeatures>, id = "throwaway") {
    return OrgConfigSchema.parse({ ...CRC, id, domains: { primary: `${id}.vercel.app`, aliases: [] }, features: { ...ALL_ON, ...features } })
}

async function renders(layout: (p: { children: React.ReactNode }) => Promise<ReactElement>): Promise<"page" | "404"> {
    try {
        const el = await layout({ children: <p>page</p> })
        expect(isValidElement(el)).toBe(true)
        return "page"
    } catch (e) {
        if ((e as Error).message === "NEXT_NOT_FOUND") return "404"
        throw e
    }
}

beforeEach(() => {
    h.configs = { crc: CRC, brotherslazaroff: BL }
})

describe("phase 6: flagged pages on CRC and Brothers Lazaroff", () => {
    it("crc: /perform and /monitor render", async () => {
        h.org = "crc"
        expect(await renders(PerformLayout)).toBe("page")
        expect(await renders(MonitorLayout)).toBe("page")
    })

    it("brotherslazaroff: /perform renders (public Perform links keep working); /monitor is 404 (CRC-only mixer)", async () => {
        h.org = "brotherslazaroff"
        expect(await renders(PerformLayout)).toBe("page")
        expect(await renders(MonitorLayout)).toBe("404")
    })

    it("with no stored config, the compiled config decides the same way", async () => {
        h.configs = {}
        h.org = "crc"
        expect(await renders(PerformLayout)).toBe("page")
        expect(await renders(MonitorLayout)).toBe("page")
        h.org = "brotherslazaroff"
        expect(await renders(PerformLayout)).toBe("page")
        expect(await renders(MonitorLayout)).toBe("404")
    })
})

describe("phase 6: a throwaway tenant with the flag off gets a 404", () => {
    it("perform off: every /perform route is 404", async () => {
        h.org = "throwaway"
        h.configs.throwaway = throwaway({ perform: false })
        expect(await renders(PerformLayout)).toBe("404")
    })

    it("perform on: /perform renders", async () => {
        h.org = "throwaway"
        h.configs.throwaway = throwaway({})
        expect(await renders(PerformLayout)).toBe("page")
    })

    it("mixer: 404 for a non-crc tenant even with the flag on, and for crc with it off", async () => {
        h.org = "throwaway"
        h.configs.throwaway = throwaway({ mixer: true })
        expect(await renders(MonitorLayout)).toBe("404")
        h.org = "crc"
        h.configs.crc = throwaway({ mixer: false }, "crc")
        expect(await renders(MonitorLayout)).toBe("404")
    })
})
