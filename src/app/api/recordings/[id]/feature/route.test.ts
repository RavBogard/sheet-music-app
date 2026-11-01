/**
 * POST /api/recordings/[id]/feature — a band leader (or admin) of the
 * recording's congregation makes it the song's one featured take.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { fakeDb } from "@/lib/recordings/__tests__/fake-db"

let db = fakeDb()
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => null }))
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

// The caller: role in the host tenant, from x-test-role / x-org-id. With no
// x-test-role the real withAuth runs (a signed-out request).
vi.mock("@/lib/api-auth", async () => ({
    withAuth: async (req: Request, ...rest: unknown[]) => {
        const role = req.headers.get("x-test-role")
        if (!role) {
            const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth")
            return (actual.withAuth as (...a: unknown[]) => unknown)(req, ...rest)
        }
        const orgId = req.headers.get("x-org-id") ?? "crc"
        return {
            uid: "u1", email: undefined, token: {}, role,
            isAdmin: role === "admin", isBandLeader: role === "band_leader", isMusician: role === "musician",
            orgId, po: false,
            access: { uid: "u1", orgId, role, effectiveRole: role, soundEngineer: false, canUpload: false, po: false, source: "membership" },
        }
    },
}))

describe("POST /api/recordings/[id]/feature", () => {
    let POST: (req: NextRequest, ctx: unknown) => Promise<Response>
    beforeAll(async () => {
        POST = (await import("./route")).POST as never
    })
    beforeEach(() => {
        db = fakeDb({
            recordings: {
                a: { orgId: "crc", songId: "s1", title: "A", storagePath: "recordings/a.mp3", featured: true },
                b: { orgId: "crc", songId: "s1", title: "B", storagePath: "recordings/b.mp3" },
            },
        })
    })
    const call = (id: string, role: string, org = "crc") =>
        POST(
            new NextRequest(`http://localhost/api/recordings/${id}/feature`, {
                method: "POST",
                headers: { "x-test-role": role, "x-org-id": org },
            }),
            { params: Promise.resolve({ id }) },
        )

    it("band leader of the recording's org sets featured", async () => {
        const res = await call("b", "band_leader")
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, songId: "s1", unset: ["a"] })
        expect(db.store.recordings.b.featured).toBe(true)
        expect(db.store.recordings.a.featured).toBe(false)
    })

    it("musician gets 403", async () => {
        expect((await call("b", "musician")).status).toBe(403)
        expect(db.store.recordings.b.featured).toBeUndefined()
    })

    it("other-org leader gets 404", async () => {
        expect((await call("b", "band_leader", "brotherslazaroff")).status).toBe(404)
        expect(db.store.recordings.b.featured).toBeUndefined()
    })

    it("a signed-out POST gets 401", async () => {
        const res = await POST(
            new NextRequest("http://localhost/api/recordings/b/feature", { method: "POST" }),
            { params: Promise.resolve({ id: "b" }) },
        )
        expect(res.status).toBe(401)
        expect(db.store.recordings.b.featured).toBeUndefined()
    })

    it("a held take cannot be featured", async () => {
        db.store.recordings.b.status = "held"
        expect((await call("b", "admin")).status).toBe(409)
    })
})
