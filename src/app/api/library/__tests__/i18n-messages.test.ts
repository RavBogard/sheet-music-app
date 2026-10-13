// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7: library route errors come from the api-library catalogue. English
 * is unchanged; with the pseudo-locale cookie they come back pseudo-wrapped.
 */

const h = vi.hoisted(() => ({ lang: null as string | null }))
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (n: string) => (n === "ui-lang" && h.lang ? { value: h.lang } : undefined) }),
    headers: async () => new Headers({ "x-org-id": "crc" }),
}))
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => (ctx: unknown) => fn(ctx),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/song-usage", () => ({ getUsageSummaries: vi.fn(async () => new Map()) }))

import { GET } from "../usage/route"

type Handler = (ctx: unknown) => Promise<Response>
const call = (query: string) => (GET as unknown as Handler)({ req: { nextUrl: new URL(`http://x/api/library/usage${query}`) } })
const many = Array.from({ length: 101 }, (_, i) => `f${i}`).join(",")

describe("api-library messages", () => {
    beforeEach(() => {
        h.lang = null
    })

    it("English is unchanged", async () => {
        expect(await (await call("")).json()).toEqual({ error: "fileIds parameter required" })
        expect(await (await call(`?fileIds=${many}`)).json()).toEqual({ error: "Maximum 100 file IDs per request" })
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const t = tForOrg("crc", "qps")
        const a = (await (await call("")).json()) as { error: string }
        expect(a.error).toBe(t("api-library.fileIdsRequired"))
        expect(a.error.startsWith("⟦")).toBe(true)
        const b = (await (await call(`?fileIds=${many}`)).json()) as { error: string }
        expect(b.error).toBe(t("api-library.tooManyFileIds", { max: 100 }))
        expect(b.error).toContain("100")
    })
})
