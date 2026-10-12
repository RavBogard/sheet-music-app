import { describe, expect, it } from "vitest"
import type { ProcessChartUploadInput } from "@/lib/library-upload"
import type { CreateSetlistInput } from "@/lib/setlist-write"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant P2 (§2.2 W5, W7): the shared create paths take the tenant as a
 * REQUIRED input — a caller that forgets it is a type error, never a silent
 * "crc". These assignments are checked by `tsc --noEmit` (which covers test
 * files): if `orgId` ever becomes optional again, `IsOptional<...>` widens to
 * `true` and the `false` literal below stops compiling.
 */
type IsOptional<T, K extends keyof T> = Record<string, never> extends Pick<T, K> ? true : false

describe("orgId is required on shared create inputs", () => {
    it("processChartUpload input requires orgId", () => {
        const optional: IsOptional<ProcessChartUploadInput, "orgId"> = false
        const t: OrgId = "crc" as ProcessChartUploadInput["orgId"]
        expect([optional, t]).toEqual([false, "crc"])
    })

    it("createSetlistServerSide input requires orgId", () => {
        const optional: IsOptional<CreateSetlistInput, "orgId"> = false
        expect(optional).toBe(false)
    })
})
