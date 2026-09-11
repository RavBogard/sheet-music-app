import { describe, it, expect, vi } from "vitest"

// ── Mock state ──
//
// Mocking approach copied from
// `src/app/api/library/__tests__/upload-musescore.test.ts`, which exercises
// `processChartUpload` (via the HTTP route) against a mocked
// `@/lib/firebase-admin`. This test calls `processChartUpload` directly and
// only needs the Firestore `library_index.where("nameLower","==",…).get()`
// exact-duplicate query to resolve — the .txt upload here never reaches the
// Storage/MuseScore/HEIC branches, but firebase-storage + musescore-converter
// are mocked anyway to mirror the proven-working shape and avoid any
// incidental real calls.

const queryChain: Record<string, unknown> = {
    where: vi.fn(() => queryChain),
    limit: vi.fn(() => queryChain),
    select: vi.fn(() => queryChain),
    get: vi.fn(async () => ({
        docs: [
            {
                id: "existing-1",
                data: () => ({ name: "Hashkivenu", status: "active" }),
            },
        ],
        size: 1,
        empty: false,
    })),
}

const mockFirestore = {
    collection: vi.fn(() => queryChain),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
}))

vi.mock("@/lib/logger", () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: vi.fn(),
    getStorageObjectSize: vi.fn(),
    deleteStorageObjectAtPath: vi.fn(),
}))

vi.mock("@/lib/musescore-converter", () => ({
    processMuseScoreFile: vi.fn(),
}))

// ── Import after mocks ──

import { processChartUpload } from "@/lib/library-upload"

describe("processChartUpload duplicate payload", () => {
    it("carries matchedFileId/matchedTitle/score on an exact-duplicate 409", async () => {
        const result = await processChartUpload({
            buffer: Buffer.from("x"),
            originalFileName: "Hashkivenu.txt",
            mimeType: "text/plain",
            title: "Hashkivenu",
            uploaderUid: "u1",
        })

        expect(result).toMatchObject({
            ok: false,
            code: "duplicate_exact",
            matchedFileId: "existing-1",
            matchedTitle: "Hashkivenu",
            score: 1,
        })
    })
})
