// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeReq } from "@/__tests__/api-test-helpers"

const mockFetchFileById = vi.fn()
const mockIsFolder = vi.fn()

vi.mock("@/lib/file-fetcher", () => ({ fetchFileById: (...a: unknown[]) => mockFetchFileById(...a) }))
vi.mock("@/lib/library/folder-row", () => ({ isDriveFolderRow: (...a: unknown[]) => mockIsFolder(...a) }))
vi.mock("@/lib/drive-file-auth", () => ({ hasBrowserFetchMetadata: () => true }))
vi.mock("@/lib/mcp/auth", () => ({ verifyBearer: vi.fn(async () => ({ error: "no" })) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

describe("GET /api/drive/file/[fileId] on a Drive folder (TEL-01)", () => {
    beforeEach(() => vi.clearAllMocks())

    it("answers 400 not_a_chart and never asks Drive for bytes", async () => {
        mockIsFolder.mockResolvedValue(true)
        const { GET } = await import("@/app/api/drive/file/[fileId]/route")
        const res = await GET(makeReq("/api/drive/file/folder1"), { params: Promise.resolve({ fileId: "folder1" }) })
        expect(res.status).toBe(400)
        expect(JSON.stringify(await res.json())).toContain("not_a_chart")
        expect(mockFetchFileById).not.toHaveBeenCalled()
    })
})
