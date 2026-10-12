import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Multi-tenant phase 4: verifyBearer keeps each token kind on its own server.
 *   - platform (crl_plat_) verifies only for surface "platform";
 *   - every other kind is refused there with a 403 and a plain message;
 *   - view_as (crl_view_) is read-only; prefix and kind must agree.
 */

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("firebase-admin/firestore", () => ({
    FieldValue: { serverTimestamp: vi.fn(() => "SERVER_TS") },
    Timestamp: class {},
}))
vi.mock("@/lib/org/org-exists", () => ({ primeTenantConfig: vi.fn(async () => {}) }))

const mockGet = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(() => true),
    getFirestore: vi.fn(() => ({ collection: () => ({ where: () => ({ limit: () => ({ get: mockGet }) }) }) })),
}))

import { verifyBearer } from "../auth"

const req = (token: string) => new Request("http://localhost/api/mcp", { headers: { authorization: `Bearer ${token}` } })
const docWith = (data: Record<string, unknown>) => ({ empty: false, docs: [{ id: "tok1", data: () => data, ref: { update: mockUpdate } }] })

describe("verifyBearer token kinds (phase 4)", () => {
    beforeEach(() => vi.clearAllMocks())

    it("a platform token is refused on tenant surfaces", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "po", kind: "platform", orgId: null }))
        const r = await verifyBearer(req("crl_plat_abc"))
        expect(r).toBeInstanceOf(Response)
        expect((r as Response).status).toBe(401)
    })

    it("a platform token verifies on the platform surface", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "po", kind: "platform", orgId: null }))
        const r = await verifyBearer(req("crl_plat_abc"), { surface: "platform" })
        expect(r).toMatchObject({ uid: "po", kind: "platform" })
    })

    it("a tenant token on the platform surface → 403 with a plain message", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "u1", orgId: "crc" }))
        const r = await verifyBearer(req("crl_live_abc"), { surface: "platform" })
        expect((r as Response).status).toBe(403)
        expect(await (r as Response).text()).toMatch(/tenant connector token/)
    })

    it("a view-as token is read-only on the tenant surface", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "po", orgId: "nava", kind: "view_as", readOnly: true, viewAs: true }))
        const r = await verifyBearer(req("crl_view_abc"))
        expect(r).toMatchObject({ uid: "po", orgId: "nava", kind: "view_as", readOnly: true })
    })

    it("prefix and kind must agree both ways", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "po", kind: "platform" }))
        expect(((await verifyBearer(req("crl_live_abc"), { surface: "platform" })) as Response).status).toBe(401)
        mockGet.mockResolvedValue(docWith({ uid: "u1", orgId: "crc" }))
        expect(((await verifyBearer(req("crl_view_abc"))) as Response).status).toBe(401)
        mockGet.mockResolvedValue(docWith({ uid: "u1", orgId: "crc", kind: "view_as" }))
        expect(((await verifyBearer(req("crl_live_abc"))) as Response).status).toBe(401)
    })

    it("an ordinary tenant token keeps its exact shape (no readOnly field)", async () => {
        mockGet.mockResolvedValue(docWith({ uid: "u1", orgId: "crc" }))
        const r = await verifyBearer(req("crl_live_abc"))
        expect(r).not.toBeInstanceOf(Response)
        expect("readOnly" in (r as object)).toBe(false)
    })
})
