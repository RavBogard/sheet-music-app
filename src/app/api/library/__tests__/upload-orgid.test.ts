/**
 * Multi-tenant phase 2 — W5 + W11 on the web upload path.
 *
 * POST /api/library/upload passes the HOST tenant (proxy-set x-org-id) to
 * processChartUpload, which stamps it on library_index/{id} and songs/{id}
 * (one batch) and on every Storage object it writes (uploadToStorage's 4th
 * argument → customMetadata.orgId). Mock shape follows upload-musescore.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const batchWrites: Array<{ collection: string; id: string; data: Record<string, unknown> }> = []

function docRef(collection: string, id: string) {
    return {
        _collection: collection,
        _id: id,
        get: vi.fn(async () =>
            collection === "users" && id === "test-user"
                ? { exists: true, data: () => ({ canUpload: true }) }
                : { exists: false, data: () => undefined },
        ),
        set: vi.fn(async () => undefined),
    }
}

function collectionRef(name: string) {
    const chain: Record<string, unknown> = {
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        select: vi.fn(() => chain),
        get: vi.fn(async () => ({ docs: [], empty: true, size: 0 })),
        doc: vi.fn((id: string) => docRef(name, id)),
    }
    return chain
}

const mockFirestore = {
    collection: vi.fn((name: string) => collectionRef(name)),
    batch: vi.fn(() => ({
        set: vi.fn((ref: { _collection: string; _id: string }, data: Record<string, unknown>) => {
            batchWrites.push({ collection: ref._collection, id: ref._id, data })
        }),
        update: vi.fn(),
        commit: vi.fn(async () => undefined),
    })),
}

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn().mockReturnValue(true),
    getFirestore: vi.fn(() => mockFirestore),
    verifyIdToken: vi.fn(),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => null) }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const mockUploadToStorage = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "gs://bucket/path")
vi.mock("@/lib/firebase-storage", () => ({
    uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
    getStorageObjectSize: () => {
        const main = [...mockUploadToStorage.mock.calls].reverse().find((c) => !String(c[0]).startsWith("originals/"))
        return (main?.[1] as Buffer | undefined)?.byteLength ?? 0
    },
    deleteStorageObjectAtPath: vi.fn(),
}))
vi.mock("@/lib/musescore-converter", () => ({
    processMuseScoreFile: vi.fn(async () => ({
        musicXml: "<score-partwise><part-list/></score-partwise>",
        originalContent: Buffer.from("original-mscz-content"),
    })),
}))

import { verifyIdToken } from "@/lib/firebase-admin"
import { POST } from "../upload/route"

function uploadReq(fileName: string, mimeType: string, org?: string) {
    const buffer = Buffer.from("chart-bytes-" + fileName)
    const file = {
        name: fileName,
        type: mimeType,
        size: buffer.length,
        arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
    }
    const form = new Map<string, unknown>([["file", file], ["title", fileName.replace(/\.[^.]+$/, "")]])
    const headers: Record<string, string> = { Authorization: "Bearer t", "Content-Type": "multipart/form-data" }
    if (org) headers["x-org-id"] = org
    const req = new NextRequest("http://localhost/api/library/upload", { method: "POST", headers })
    vi.spyOn(req, "formData").mockResolvedValue({
        get: (k: string) => form.get(k) ?? null,
        getAll: (k: string) => (form.has(k) ? [form.get(k)] : []),
        has: (k: string) => form.has(k),
    } as unknown as FormData)
    return req
}

beforeEach(() => {
    vi.clearAllMocks()
    batchWrites.length = 0
    vi.mocked(verifyIdToken).mockResolvedValue({ uid: "test-user", email: "u@test", role: "admin" } as never)
})

describe("W5/W11 · /api/library/upload stamps the host tenant", () => {
    it("BL host → library_index + songs carry orgId 'brotherslazaroff'; Storage writes get it too", async () => {
        const res = await POST(uploadReq("Song.mscz", "application/x-musescore", "brotherslazaroff"))
        expect(res.status).toBe(201)

        const index = batchWrites.find((w) => w.collection === "library_index")
        const song = batchWrites.find((w) => w.collection === "songs")
        expect(index?.data.orgId).toBe("brotherslazaroff")
        expect(song?.data.orgId).toBe("brotherslazaroff")
        expect(song?.id).toBe(index?.id)

        // converted object + original (originals/…) both carry the tenant
        expect(mockUploadToStorage).toHaveBeenCalledTimes(2)
        for (const call of mockUploadToStorage.mock.calls) expect(call[3]).toBe("brotherslazaroff")
    })

    it("no / unknown host header → coerceOrgId → 'crc'", async () => {
        const res = await POST(uploadReq("Chart.pdf", "application/pdf", "evil-org"))
        expect(res.status).toBe(201)
        expect(batchWrites.find((w) => w.collection === "library_index")?.data.orgId).toBe("crc")
        expect(batchWrites.find((w) => w.collection === "songs")?.data.orgId).toBe("crc")
        expect(mockUploadToStorage.mock.calls[0][3]).toBe("crc")
    })
})
