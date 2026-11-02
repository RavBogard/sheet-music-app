/**
 * Direct-to-Storage recording uploads: POST /api/recordings/upload-url signs a
 * PUT for one exact file; POST /api/recordings/upload/complete checks what
 * landed and writes the recording doc. Both are band leader / admin of the
 * host congregation, for that congregation's songs only.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { fakeDb } from "@/lib/recordings/__tests__/fake-db"

let db = fakeDb()
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => null }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

const storage = vi.hoisted(() => ({
    objects: new Map<string, { size: number; contentType: string }>(),
    sign: vi.fn(),
    deleted: [] as string[],
}))
vi.mock("@/lib/recordings/direct-upload-server", async () => {
    const actual = await vi.importActual<typeof import("@/lib/recordings/direct-upload-server")>(
        "@/lib/recordings/direct-upload-server",
    )
    return {
        ...actual,
        signRecordingPut: async (path: string, contentType: string, size: number, exp: number) => {
            storage.sign(path, contentType, size, exp)
            return {
                url: `https://storage.example/${path}?sig=1`,
                headers: { "Content-Type": contentType, "x-goog-content-length-range": `${size},${size}` },
            }
        },
        statRecordingObject: async (path: string) => storage.objects.get(path) ?? null,
        deleteRecordingObject: async (path: string) => {
            storage.deleted.push(path)
            storage.objects.delete(path)
        },
    }
})

// The caller: uid + role in the host tenant, from x-test-uid / x-test-role / x-org-id.
vi.mock("@/lib/api-auth", async () => ({
    withAuth: async (req: Request, ...rest: unknown[]) => {
        const role = req.headers.get("x-test-role")
        if (!role) {
            const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth")
            return (actual.withAuth as (...a: unknown[]) => unknown)(req, ...rest)
        }
        const orgId = req.headers.get("x-org-id") ?? "crc"
        const uid = req.headers.get("x-test-uid") ?? "leader-1"
        return {
            uid, email: undefined, token: {}, role,
            isAdmin: role === "admin", isBandLeader: role === "band_leader" || role === "admin", isMusician: true,
            orgId, po: false,
            access: { uid, orgId, role, effectiveRole: role, soundEngineer: false, canUpload: false, po: false, source: "membership" },
        }
    },
}))

type Caller = { role?: string; org?: string; uid?: string }
type Route = (req: NextRequest) => Promise<Response>

function req(path: string, body: unknown, who: Caller = {}) {
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (who.role !== undefined) headers["x-test-role"] = who.role
    else headers["x-test-role"] = "band_leader"
    headers["x-org-id"] = who.org ?? "crc"
    if (who.uid) headers["x-test-uid"] = who.uid
    return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body: JSON.stringify(body) })
}

const MB = 1024 * 1024
const mp3 = { songId: "song-crc", fileName: "Hashkiveinu take 2.mp3", mimeType: "audio/mpeg", size: 12 * MB }

describe("recording direct upload", () => {
    let signUrl: Route
    let complete: Route
    beforeAll(async () => {
        signUrl = (await import("./route")).POST as never
        complete = (await import("../upload/complete/route")).POST as never
    })
    beforeEach(() => {
        storage.objects.clear()
        storage.sign.mockClear()
        storage.deleted.length = 0
        db = fakeDb({
            songs: {
                "song-crc": { orgId: "crc", title: "Hashkiveinu" },
                "song-bl": { orgId: "brotherslazaroff", title: "Gig opener" },
            },
        })
    })

    async function sign(body: unknown = mp3, who: Caller = {}) {
        const res = await signUrl(req("/api/recordings/upload-url", body, who))
        return { res, json: (await res.json()) as Record<string, unknown> }
    }
    async function finish(recordingId: string, who: Caller = {}) {
        const res = await complete(req("/api/recordings/upload/complete", { recordingId }, who))
        return { res, json: (await res.json()) as Record<string, unknown> }
    }
    function land(recordingId: string, size = mp3.size, contentType = "audio/mpeg") {
        const pending = db.store.recording_uploads[recordingId] as { storagePath: string }
        storage.objects.set(pending.storagePath, { size, contentType })
    }

    describe("upload-url", () => {
        it("signs a PUT for this exact file and records it as pending", async () => {
            const { res, json } = await sign()
            expect(res.status).toBe(200)
            const id = json.recordingId as string
            expect(id).toMatch(/^rec-/)
            expect(json.headers).toEqual({ "Content-Type": "audio/mpeg", "x-goog-content-length-range": `${mp3.size},${mp3.size}` })
            expect(storage.sign).toHaveBeenCalledWith(`recordings/${id}.mp3`, "audio/mpeg", mp3.size, expect.any(Number))
            expect(db.store.recording_uploads[id]).toMatchObject({ orgId: "crc", uid: "leader-1", songId: "song-crc", size: mp3.size })
            expect(db.store.recordings).toBeUndefined()
        })

        it("takes an iPad file with no type by its extension", async () => {
            const { res } = await sign({ ...mp3, fileName: "take.m4a", mimeType: "" })
            expect(res.status).toBe(200)
            expect(storage.sign.mock.calls[0][1]).toBe("audio/mp4")
        })

        it("refuses a musician", async () => {
            const { res, json } = await sign(mp3, { role: "musician" })
            expect(res.status).toBe(403)
            expect(json.code).toBe("forbidden_role")
            expect(storage.sign).not.toHaveBeenCalled()
        })

        it("refuses another tenant's band leader on this congregation's song", async () => {
            const { res, json } = await sign(mp3, { org: "brotherslazaroff" })
            expect(res.status).toBe(404)
            expect(json.code).toBe("song_not_found")
            expect(storage.sign).not.toHaveBeenCalled()
        })

        it("refuses a file that isn't audio", async () => {
            const { res, json } = await sign({ ...mp3, fileName: "chart.pdf", mimeType: "application/pdf" })
            expect(res.status).toBe(400)
            expect(json.code).toBe("unsupported_type")
        })

        it("refuses a file over 200 MB", async () => {
            const { res, json } = await sign({ ...mp3, size: 201 * MB })
            expect(res.status).toBe(413)
            expect(json.code).toBe("file_too_large")
        })
    })

    describe("complete", () => {
        it("writes the recording doc with the old route's fields, once", async () => {
            const id = (await sign()).json.recordingId as string
            land(id)
            const first = await finish(id)
            expect(first.res.status).toBe(201)
            expect(first.json).toMatchObject({ success: true, recordingId: id, title: "Hashkiveinu take 2" })
            expect(db.store.recordings[id]).toMatchObject({
                id, orgId: "crc", songId: "song-crc", title: "Hashkiveinu take 2",
                fileName: mp3.fileName, mimeType: "audio/mpeg", storagePath: `recordings/${id}.mp3`, createdBy: "leader-1",
            })
            expect(db.store.recordings[id].featured).toBeUndefined()

            const retry = await finish(id)
            expect(retry.res.status).toBe(200)
            expect(retry.json).toMatchObject({ success: true, recordingId: id })
            expect(Object.keys(db.store.recordings)).toHaveLength(1)
        })

        it("refuses a musician", async () => {
            const id = (await sign()).json.recordingId as string
            land(id)
            expect((await finish(id, { role: "musician" })).res.status).toBe(403)
            expect(db.store.recordings).toBeUndefined()
        })

        it("another person can't complete someone else's upload", async () => {
            const id = (await sign()).json.recordingId as string
            land(id)
            expect((await finish(id, { uid: "leader-2" })).res.status).toBe(404)
            expect(db.store.recordings).toBeUndefined()
        })

        it("the other congregation can't complete this congregation's upload", async () => {
            const id = (await sign()).json.recordingId as string
            land(id)
            expect((await finish(id, { org: "brotherslazaroff" })).res.status).toBe(404)
            expect(db.store.recordings).toBeUndefined()
        })

        it("rejects and deletes an object whose size doesn't match what was signed", async () => {
            const id = (await sign()).json.recordingId as string
            land(id, mp3.size - 1)
            const { res, json } = await finish(id)
            expect(res.status).toBe(400)
            expect(json.code).toBe("upload_mismatch")
            expect(storage.deleted).toEqual([`recordings/${id}.mp3`])
            expect(db.store.recordings).toBeUndefined()
        })

        it("rejects an object whose content type doesn't match what was signed", async () => {
            const id = (await sign()).json.recordingId as string
            land(id, mp3.size, "text/html")
            const { res, json } = await finish(id)
            expect(res.status).toBe(400)
            expect(json.code).toBe("upload_mismatch")
            expect(db.store.recordings).toBeUndefined()
        })

        it("says so when the bytes never arrived", async () => {
            const id = (await sign()).json.recordingId as string
            const { res, json } = await finish(id)
            expect(res.status).toBe(409)
            expect(json.code).toBe("upload_missing")
        })

        it("an unknown id is not found", async () => {
            const { res } = await finish("rec-00000000-0000-0000-0000-000000000000")
            expect(res.status).toBe(404)
        })
    })
})
