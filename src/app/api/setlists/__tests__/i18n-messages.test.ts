// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7: setlist-import route errors come from the api-setlists catalogue.
 * English is unchanged; with the pseudo-locale cookie they come back
 * pseudo-wrapped.
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
vi.mock("@/lib/setlist-import/extract-structure", () => ({ extractSetlistStructure: vi.fn() }))

import { POST } from "../import/extract-structure/route"

type Handler = (ctx: unknown) => Promise<Response>
const call = () => (POST as unknown as Handler)({ req: {}, body: { text: "   " }, auth: { uid: "u1" } })

describe("api-setlists messages", () => {
    beforeEach(() => {
        h.lang = null
    })

    it("English is unchanged", async () => {
        const res = await call()
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "No text provided" })
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const body = (await (await call()).json()) as { error: string }
        expect(body.error).toBe(tForOrg("crc", "qps")("api-setlists.noTextProvided"))
        expect(body.error.startsWith("⟦")).toBe(true)
    })
})
