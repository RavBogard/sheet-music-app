/**
 * PGR-01 — GET /api/cron/backup.
 * Covers: CRON_SECRET auth (401), dormant-safe logical no-op when
 * BACKUP_BUCKET unset, real Firestore export when BACKUP_BUCKET set
 * (mocked export client), and the dated backups/{YYYY-MM-DD} audit doc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

// ── Firestore mock (collection-aware so we can assert on backups/ + config/) ──
const backupsDocSet = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined)
const configDocSet = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined)
let backupsDocId = ""

const mockFirestore = {
    collection: vi.fn((name: string) => {
        if (name === "backups") {
            return {
                doc: (id: string) => {
                    backupsDocId = id
                    return { set: backupsDocSet }
                },
            }
        }
        if (name === "config") {
            return { doc: (_id: string) => ({ set: configDocSet }) }
        }
        // logicalBackup counts setlists/users/tasks/songUsage
        return {
            count: () => ({ get: async () => ({ data: () => ({ count: 5 }) }) }),
            doc: (_id: string) => ({ set: vi.fn(async () => undefined) }),
        }
    }),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/error-reporting", () => ({
    captureException: vi.fn(),
}))

vi.mock("@/env.mjs", () => ({
    env: { CRON_SECRET: "test-secret" },
}))

// google-auth-library export client — request spy lets us assert the
// Firestore exportDocuments REST call shape.
const requestSpy = vi.fn<(...args: unknown[]) => Promise<{ data: { name: string } }>>(async () => ({
    data: { name: "projects/demo-proj/operations/op-abc123" },
}))
vi.mock("google-auth-library", () => ({
    GoogleAuth: vi.fn().mockImplementation(() => ({
        getClient: vi.fn(async () => ({ request: requestSpy })),
    })),
}))

import { GET } from "../route"

const SECRET = "test-secret"

beforeEach(() => {
    vi.clearAllMocks()
    backupsDocId = ""
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-proj"
    delete process.env.BACKUP_BUCKET
})

describe("GET /api/cron/backup — auth", () => {
    it("401s when no Authorization header is present", async () => {
        const res = await GET(makeReq("/api/cron/backup"))
        expect(res.status).toBe(401)
        expect(requestSpy).not.toHaveBeenCalled()
    })

    it("401s when the bearer token does not match CRON_SECRET", async () => {
        const res = await GET(makeReq("/api/cron/backup", { token: "wrong-secret" }))
        expect(res.status).toBe(401)
        expect(requestSpy).not.toHaveBeenCalled()
    })
})

describe("GET /api/cron/backup — dormant-safe (BACKUP_BUCKET unset)", () => {
    it("returns a logical no-op without throwing and writes a dated audit doc", async () => {
        const res = await GET(makeReq("/api/cron/backup", { token: SECRET }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.type).toBe("logical")
        // No real export attempted when the bucket is unconfigured.
        expect(requestSpy).not.toHaveBeenCalled()
        // Dated audit doc written with logical status.
        expect(backupsDocSet).toHaveBeenCalledTimes(1)
        expect(backupsDocId).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const audit = backupsDocSet.mock.calls[0][0] as Record<string, unknown>
        expect(audit.status).toBe("logical")
        expect(audit.type).toBe("logical")
    })
})

describe("GET /api/cron/backup — real export (BACKUP_BUCKET set)", () => {
    it("invokes the Firestore exportDocuments API with the bucket and records the op", async () => {
        process.env.BACKUP_BUCKET = "centralreform-backups"
        const res = await GET(makeReq("/api/cron/backup", { token: SECRET }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.exportOpName).toBe("projects/demo-proj/operations/op-abc123")

        // The export REST call fired against the right endpoint with the bucket.
        expect(requestSpy).toHaveBeenCalledTimes(1)
        const call = requestSpy.mock.calls[0][0] as { url: string; data: { outputUriPrefix: string } }
        expect(call.url).toContain(":exportDocuments")
        expect(call.data.outputUriPrefix).toContain("centralreform-backups")

        // Dated audit doc captures the export op + bucket path.
        expect(backupsDocId).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const audit = backupsDocSet.mock.calls[0][0] as Record<string, unknown>
        expect(audit.status).toBe("export_initiated")
        expect(audit.type).toBe("gcs")
        expect(audit.exportOpName).toBe("projects/demo-proj/operations/op-abc123")
        expect(String(audit.bucketPath)).toContain("centralreform-backups")
    })
})
