// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { tForOrg } from "@/i18n/server"

/**
 * Phase 7: recording route errors come from the api-recordings catalogue.
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
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: vi.fn() }))
vi.mock("@/lib/firebase-storage", () => ({ uploadRecordingToStorage: vi.fn() }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { POST } from "../upload/route"

type Handler = (ctx: unknown) => Promise<Response>
const call = () =>
    (POST as unknown as Handler)({
        req: new Request("http://x/api/recordings/upload", { method: "POST" }),
        auth: { uid: "u1", isBandLeader: false, isAdmin: false },
    })

describe("api-recordings messages", () => {
    beforeEach(() => {
        h.lang = null
    })

    it("English is unchanged", async () => {
        const res = await call()
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error: "Only band leaders and admins can upload recordings." })
    })

    it("comes from the catalogue (pseudo-locale)", async () => {
        h.lang = "qps"
        const body = (await (await call()).json()) as { error: string }
        expect(body.error).toBe(tForOrg("crc", "qps")("api-recordings.leadersOnly"))
        expect(body.error.startsWith("⟦")).toBe(true)
    })
})
