// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { authorizeEditor, authorizeService, boundedJSON, credential, errorResponse, signTicket, verifyTicket } from "./access"
import { bridgeRequest } from "./contract"

const secret = "test-only-be-it-service-credential-123456789"
const authMocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), readTenantRole: vi.fn() }))
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getAuth: () => ({ verifyIdToken: authMocks.verifyIdToken }), getFirestore: () => ({}) }))
vi.mock("@/lib/org/access", () => ({ readTenantRole: authMocks.readTenantRole }))
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
function configure() { vi.stubEnv("BEIT_MITZVAH_SERVICE_TOKEN", secret); vi.stubEnv("BEIT_MITZVAH_SERVICE_ORG_ID", "crc") }
const request = (token: string, org = "crc") => new Request("https://centralreform.live/api/integrations/beit-mitzvah/v1", { headers: { Authorization: `Bearer ${token}`, "x-org-id": org } })
describe("narrow music service authentication", () => {
    it("fails closed without an explicit CRC config and rejects other tenants", () => {
        vi.stubEnv("BEIT_MITZVAH_SERVICE_TOKEN", "")
        expect(credential).toThrow("integration_unconfigured")
        configure()
        expect(() => authorizeService(request(secret))).not.toThrow()
        expect(() => authorizeService(request("crl_live_human-token"))).toThrow("unauthorized")
        expect(() => authorizeService(request(secret, "brotherslazaroff"))).toThrow("not_found")
        vi.stubEnv("BEIT_MITZVAH_SERVICE_ORG_ID", "brotherslazaroff")
        expect(credential).toThrow("integration_unconfigured")
    })
    it("signs only bounded short-lived resource tickets and detects tampering", () => {
        configure(); vi.useFakeTimers(); vi.setSystemTime(new Date("2030-01-01"))
        const ticket = signTicket({ expires: Date.now() + 60_000, resourceId: "resource-1" })
        expect(verifyTicket(ticket).resourceId).toBe("resource-1")
        expect(() => verifyTicket(ticket + "x")).toThrow("not_found")
        expect(() => verifyTicket(signTicket({ expires: Date.now() + 600_000 }))).toThrow("not_found")
        vi.advanceTimersByTime(60_001)
        expect(() => verifyTicket(ticket)).toThrow("not_found")
    })
    it("rejects unbounded/chunked payloads and emits safe uncached errors", async () => {
        await expect(boundedJSON(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(65536) }) }))).rejects.toThrow("payload_too_large")
        const response = errorResponse(new Error("private credentials must never appear"))
        expect(response.status).toBe(503)
        expect(response.headers.get("cache-control")).toContain("no-store")
        expect(await response.text()).not.toContain("credentials")
    })
    it("has no service-token edit operation and rejects URLs/invalid dates", () => {
        const valid = { version: 1, orgId: "crc", operation: "ensure", ceremonyId: "3847b1d4-e1b7-4ab7-bb19-652541f336fa", localDate: "2030-02-28", ceremonyType: "morning", idempotencyKey: "ceremony-v1" }
        expect(bridgeRequest.safeParse(valid).success).toBe(true)
        expect(bridgeRequest.safeParse({ ...valid, localDate: "2030-02-30" }).success).toBe(false)
        expect(bridgeRequest.safeParse({ ...valid, operation: "apply" }).success).toBe(false)
        expect(bridgeRequest.safeParse({ ...valid, resourceURL: "https://evil.test" }).success).toBe(false)
        expect(bridgeRequest.safeParse({ ...valid, orgId: "brotherslazaroff" }).success).toBe(false)
    })
    it("requires a fresh verified source editor and rejects the setup credential for review", async () => {
        configure()
        authMocks.verifyIdToken.mockRejectedValueOnce(new Error("not a Firebase ID token"))
        await expect(authorizeEditor(request(secret))).rejects.toThrow("unauthorized")
        authMocks.verifyIdToken.mockResolvedValue({ uid: "verified-user" })
        authMocks.readTenantRole.mockResolvedValueOnce("member")
        await expect(authorizeEditor(request("firebase-token"))).rejects.toThrow("forbidden")
        authMocks.readTenantRole.mockResolvedValueOnce("band_leader")
        await expect(authorizeEditor(request("firebase-token"))).resolves.toBe("verified-user")
        expect(authMocks.verifyIdToken).toHaveBeenCalledWith("firebase-token", true)
        const readOnly = request("firebase-token")
        readOnly.headers.set("cookie", "__view_as=1")
        await expect(authorizeEditor(readOnly)).rejects.toThrow("read_only_view")
    })
})
