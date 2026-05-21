/**
 * S02 — /api/bridge/setup-code GET
 * Audit-log + admin-email path + failure behavior.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { NextRequest } from "next/server"

// ── Mocks ──
const addMock = vi.fn(async (_doc: unknown) => ({ id: "audit-1" }))
const docMock = vi.fn()
const collectionMock = vi.fn((name: string) => {
    if (name === "bridge-redemptions") {
        return { add: addMock }
    }
    return { doc: docMock }
})
const runTransactionMock: ReturnType<typeof vi.fn> = vi.fn()

const fakeDb = {
    collection: collectionMock,
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => runTransactionMock(fn),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: () => fakeDb,
}))

vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => null), // never rate-limited
}))

const alertSpy: ReturnType<typeof vi.fn> = vi.fn(async () => ({ ok: true, reason: undefined, messageId: "msg-1" }))
vi.mock("@/lib/email", () => ({
    sendBridgeRedemptionAlert: (arg: unknown) => alertSpy(arg),
}))

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Import AFTER mocks
import { GET } from "@/app/api/bridge/setup-code/route"
import { logger } from "@/lib/logger"

// ── Env for success path ──
const ORIGINAL = { ...process.env }
beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "test-proj"
    process.env.FIREBASE_CLIENT_EMAIL = "svc@test.iam.gserviceaccount.com"
    process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nX\\n-----END PRIVATE KEY-----"
    // CRIT-003: default to NO scoped bridge SA so the base suite exercises the fallback.
    // Scoped-vend tests set these explicitly.
    delete process.env.BRIDGE_SA_CLIENT_EMAIL
    delete process.env.BRIDGE_SA_PRIVATE_KEY
    delete process.env.BRIDGE_SA_PRIVATE_KEY_ID
    // default: tx resolves as success with createdBy side-effect
    runTransactionMock.mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        // Make the tx callback believe there's a valid doc and let it set createdBy
        const tx = {
            get: vi.fn(async () => ({
                exists: true,
                data: () => ({
                    createdBy: "rabbi-uid",
                    expiresAt: Date.now() + 60_000,
                    used: false,
                }),
            })),
            update: vi.fn(),
        }
        return fn(tx)
    })
})

afterAll(() => {
    process.env = ORIGINAL
})

function makeReq(code?: string) {
    const url = code === undefined
        ? "http://localhost/api/bridge/setup-code"
        : `http://localhost/api/bridge/setup-code?code=${code}`
    return new NextRequest(new URL(url), {
        headers: {
            "x-forwarded-for": "203.0.113.7, 10.0.0.1",
            "user-agent": "bridge/1.2.3",
        },
    })
}

describe("GET /api/bridge/setup-code — S02 audit + email", () => {
    it("rejects missing/short code with 400 — no audit, no email", async () => {
        const res = await GET(makeReq())
        expect(res.status).toBe(400)
        expect(addMock).not.toHaveBeenCalled()
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("rejects nonexistent code with 404 — no audit, no email", async () => {
        runTransactionMock.mockImplementationOnce(async () => ({ error: "Invalid code", status: 404 }))
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(404)
        expect(addMock).not.toHaveBeenCalled()
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("rejects already-used code with 410 — no audit, no email", async () => {
        runTransactionMock.mockImplementationOnce(async () => ({ error: "Code already used", status: 410 }))
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(410)
        expect(addMock).not.toHaveBeenCalled()
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("rejects expired code with 410 — no audit, no email", async () => {
        runTransactionMock.mockImplementationOnce(async () => ({ error: "Code expired", status: 410 }))
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(410)
        expect(addMock).not.toHaveBeenCalled()
        expect(alertSpy).not.toHaveBeenCalled()
    })

    it("on success: returns credentials, writes audit doc, fires email alert", async () => {
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.credentials.project_id).toBe("test-proj")
        expect(body.credentials.client_email).toBe("svc@test.iam.gserviceaccount.com")

        expect(collectionMock).toHaveBeenCalledWith("bridge-redemptions")
        expect(addMock).toHaveBeenCalledTimes(1)
        const auditDoc = addMock.mock.calls[0][0] as Record<string, unknown>
        expect(auditDoc.code).toBe("AAAAAAAAAA")
        expect(auditDoc.createdBy).toBe("rabbi-uid")
        expect(auditDoc.redeemerIp).toBe("203.0.113.7")
        expect(auditDoc.redeemerUserAgent).toBe("bridge/1.2.3")
        expect(auditDoc.success).toBe(true)
        expect(auditDoc.redeemedAt).toBeInstanceOf(Date)

        // Email is fire-and-forget — microtask flush
        await new Promise((r) => setImmediate(r))
        expect(alertSpy).toHaveBeenCalledTimes(1)
        const [alertArg] = alertSpy.mock.calls[0]
        expect(alertArg).toMatchObject({
            code: "AAAAAAAAAA",
            redeemerIp: "203.0.113.7",
            redeemerUserAgent: "bridge/1.2.3",
        })
    })

    it("on success + email throws: still 200, audit still written, error logged", async () => {
        alertSpy.mockImplementationOnce(async () => {
            throw new Error("resend exploded")
        })
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        expect(addMock).toHaveBeenCalledTimes(1)
        await new Promise((r) => setImmediate(r))
        expect(alertSpy).toHaveBeenCalledTimes(1)
    })

    it("on success + Resend not configured: still 200, audit written, graceful email degradation", async () => {
        alertSpy.mockImplementationOnce(async () => ({ ok: false, reason: "no_api_key" }))
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        expect(addMock).toHaveBeenCalledTimes(1)
        await new Promise((r) => setImmediate(r))
        expect(alertSpy).toHaveBeenCalledTimes(1)
    })
})

describe("GET /api/bridge/setup-code — CRIT-003 scoped bridge SA vending", () => {
    it("vends the dedicated BRIDGE_SA_* identity when configured (scoped:true, no warning)", async () => {
        process.env.BRIDGE_SA_CLIENT_EMAIL = "monitor-bridge@test.iam.gserviceaccount.com"
        process.env.BRIDGE_SA_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nBRIDGE\\n-----END PRIVATE KEY-----"

        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        const body = await res.json()

        // Vends the scoped identity, NOT the backend's FIREBASE_* credential
        expect(body.scoped).toBe(true)
        expect(body.credentials.client_email).toBe("monitor-bridge@test.iam.gserviceaccount.com")
        expect(body.credentials.project_id).toBe("test-proj")
        // \\n escapes are unescaped to real newlines for cert() compatibility
        expect(body.credentials.private_key).toContain("\n")
        expect(body.credentials.private_key).toContain("BRIDGE")
        // No fallback warning when the scoped SA is present
        expect(logger.warn).not.toHaveBeenCalled()
        // Redemption gates still fire: audit doc written
        expect(addMock).toHaveBeenCalledTimes(1)
    })

    it("falls back to the backend FIREBASE_* credential with a warning when BRIDGE_SA_* is unset", async () => {
        // beforeEach already deleted BRIDGE_SA_* → fallback path
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        const body = await res.json()

        expect(body.scoped).toBe(false)
        expect(body.credentials.client_email).toBe("svc@test.iam.gserviceaccount.com")
        // Loud warning so the unscoped state is visible in logs
        expect(logger.warn).toHaveBeenCalledTimes(1)
        expect(vi.mocked(logger.warn).mock.calls[0][0]).toContain("BRIDGE_SA_")
        // Redemption gates unaffected
        expect(addMock).toHaveBeenCalledTimes(1)
    })

    it("uses BRIDGE_SA_PRIVATE_KEY_ID for private_key_id when provided (rotation hygiene)", async () => {
        process.env.BRIDGE_SA_CLIENT_EMAIL = "monitor-bridge@test.iam.gserviceaccount.com"
        process.env.BRIDGE_SA_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nBRIDGE\\n-----END PRIVATE KEY-----"
        process.env.BRIDGE_SA_PRIVATE_KEY_ID = "key-abc123"

        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.credentials.private_key_id).toBe("key-abc123")
    })

    it("never vends a partial scoped credential: BRIDGE_SA email without key falls back", async () => {
        process.env.BRIDGE_SA_CLIENT_EMAIL = "monitor-bridge@test.iam.gserviceaccount.com"
        // BRIDGE_SA_PRIVATE_KEY intentionally unset
        const res = await GET(makeReq("AAAAAAAAAA"))
        expect(res.status).toBe(200)
        const body = await res.json()
        // Both must be present to count as scoped; otherwise fall back safely
        expect(body.scoped).toBe(false)
        expect(body.credentials.client_email).toBe("svc@test.iam.gserviceaccount.com")
        expect(logger.warn).toHaveBeenCalledTimes(1)
    })
})
