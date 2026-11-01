import { beforeEach, describe, expect, it, vi } from "vitest"
import { isValidElement, type ReactElement } from "react"

/**
 * /help is CRC's. Every other tenant (Brothers Lazaroff included) gets a 404
 * from the route layout, the way /monitor does, so CRC's iPad and sound-desk
 * guides never show on another tenant's address.
 */

const h = vi.hoisted(() => ({ org: "crc" }))

vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND")
    },
}))
vi.mock("@/lib/org/request-org", () => ({ requestOrg: async () => ({ orgId: h.org, config: null }) }))

import HelpLayout from "@/app/(main)/help/layout"

async function outcome(): Promise<"page" | "404"> {
    try {
        const el = (await HelpLayout({ children: <p>guide</p> })) as ReactElement
        expect(isValidElement(el)).toBe(true)
        return "page"
    } catch (e) {
        if ((e as Error).message === "NEXT_NOT_FOUND") return "404"
        throw e
    }
}

beforeEach(() => {
    h.org = "crc"
})

describe("/help tenant gate", () => {
    it("crc: the guides render", async () => {
        h.org = "crc"
        expect(await outcome()).toBe("page")
    })

    it("brotherslazaroff: 404", async () => {
        h.org = "brotherslazaroff"
        expect(await outcome()).toBe("404")
    })

    it("any other tenant: 404", async () => {
        h.org = "throwaway"
        expect(await outcome()).toBe("404")
    })
})
