// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7: setlist route errors come from the api-setlist catalogue. English
 * is unchanged; with the pseudo-locale cookie they come back pseudo-wrapped.
 */

const h = vi.hoisted(() => ({ lang: null as string | null }))
vi.mock("next/headers", () => ({
    cookies: async () => ({ get: (n: string) => (n === "ui-lang" && h.lang ? { value: h.lang } : undefined) }),
    headers: async () => new Headers({ "x-org-id": "crc" }),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/print-pipeline", () => ({ generatePrintPdf: vi.fn() }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { GET } from "../print/public/route"

const call = () => GET(new NextRequest("http://x/api/setlist/print/public"))

describe("api-setlist messages", () => {
    beforeEach(() => {
        h.lang = null
    })

    it("English is unchanged", async () => {
        const res = await call()
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({ error: "setlistId parameter required" })
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const body = (await (await call()).json()) as { error: string }
        expect(body.error).toBe(tForOrg("crc", "qps")("api-setlist.setlistIdRequired"))
        expect(body.error.startsWith("⟦")).toBe(true)
    })
})
