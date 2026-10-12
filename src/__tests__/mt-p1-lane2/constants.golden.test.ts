import { beforeEach, describe, expect, it } from "vitest"

import * as constants from "@/lib/constants"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

/**
 * Multi-tenant phase 1 golden — src/lib/constants.ts. The two exports keep
 * today's values; the org-aware helpers are drop-in replacements that return
 * exactly those values for crc and brotherslazaroff (BL has always received
 * CRC's BASE_URL and DEFAULT_SHORT_NAME from these constants).
 */
type Helpers = { baseUrlFor: (org: string) => string; shortNameFor: (org: string) => string }

describe("multi-tenant P1 golden: constants", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("BASE_URL and DEFAULT_SHORT_NAME are unchanged", () => {
        expect(constants.BASE_URL).toBe(process.env.NEXT_PUBLIC_BASE_URL || "https://centralreform.live")
        expect(constants.DEFAULT_SHORT_NAME).toBe("CRC Music")
    })

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: helpers equal the constants`, () => {
            const h = constants as unknown as Helpers
            expect(h.baseUrlFor(org)).toBe(constants.BASE_URL)
            expect(h.shortNameFor(org)).toBe(constants.DEFAULT_SHORT_NAME)
        })
    }
})

describe("multi-tenant P1: org-aware constants", () => {
    beforeEach(() => clearPrimedOrgConfigs())

    it("testshul gets its own base URL and short name", () => {
        primeTestOrg()
        const h = constants as unknown as Helpers
        expect(h.baseUrlFor("testshul")).toBe("https://testshul.vercel.app")
        expect(h.shortNameFor("testshul")).toBe("Test Shul Music")
    })

    it("an unknown, unprimed org falls back to CRC's values", () => {
        const h = constants as unknown as Helpers
        expect(h.baseUrlFor("nava-tehila")).toBe(constants.BASE_URL)
        expect(h.shortNameFor("nava-tehila")).toBe("CRC Music")
    })
})
