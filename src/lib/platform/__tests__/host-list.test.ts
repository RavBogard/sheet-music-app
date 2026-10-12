import { describe, it, expect } from "vitest"
import { revalidateHostList } from "@/lib/platform/host-list"

describe("revalidateHostList wrapper", () => {
    it("resolves whether or not src/lib/org/hosts.ts exists yet", async () => {
        await expect(revalidateHostList()).resolves.toBeUndefined()
    })
})
