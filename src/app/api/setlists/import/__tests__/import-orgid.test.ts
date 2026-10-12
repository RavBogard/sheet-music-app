// @vitest-environment node
/**
 * Multi-tenant phase 2 — W7 (+ W5 thread) on the two web setlist-import routes.
 *
 * POST /api/setlists/import/execute and /api/setlists/import/commit-document
 * create the setlist (and its seeded tracks) in the HOST tenant
 * (`coerceOrgId(x-org-id)`), never the request body; execute also threads the
 * host tenant into processChartUpload for Drive-downloaded charts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => ({
    writes: [] as Array<{ collection: string; id: string; data: Record<string, unknown> }>,
    pcuInputs: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => (ctx: unknown) => fn(ctx),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/firebase-admin", () => {
    const ref = (collection: string, id: string) => ({ _c: collection, _id: id })
    const db = {
        collection: (name: string) => ({ doc: (id: string) => ref(name, id) }),
        batch: () => {
            const pending: typeof h.writes = []
            return {
                set: (r: { _c: string; _id: string }, data: Record<string, unknown>) =>
                    pending.push({ collection: r._c, id: r._id, data }),
                commit: async () => {
                    h.writes.push(...pending)
                },
            }
        },
    }
    return { initAdmin: () => true, getFirestore: () => db }
})
vi.mock("@/lib/library-upload", () => ({
    processChartUpload: vi.fn(async (input: Record<string, unknown>) => {
        h.pcuInputs.push(input)
        return { ok: true, fileId: "upload-new", title: input.title }
    }),
}))

import { POST as EXECUTE } from "@/app/api/setlists/import/execute/route"
import { POST as COMMIT } from "@/app/api/setlists/import/commit-document/route"

function ctx(org: string | null, body: unknown) {
    const headers = new Headers()
    if (org) headers.set("x-org-id", org)
    return { req: { headers }, body, auth: { uid: "leader", email: "leader@example.com" } }
}

const call = (fn: unknown, c: unknown) => (fn as (c: unknown) => Promise<Response>)(c)

beforeEach(() => {
    h.writes.length = 0
    h.pcuInputs.length = 0
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(Buffer.from("%PDF-1.4 x"), { headers: { "content-type": "application/pdf" } })),
    )
})

function setlistAndTracks() {
    const setlists = h.writes.filter((w) => w.collection === "setlists")
    const tracks = h.writes.filter((w) => w.collection === "tracks")
    return { setlists, tracks }
}

describe("W7 · /api/setlists/import/execute stamps the host tenant", () => {
    it("BL host → setlist + every track carry 'brotherslazaroff'; PCU gets the host org", async () => {
        const items = [
            { type: "header", title: "Opening" },
            { type: "song", title: "Matched", libraryMatchId: "lib-1", libraryMatchName: "Matched" },
            { type: "song", title: "From Drive", chartUrl: "https://drive.google.com/file/d/AbC123/view" },
            { type: "song", title: "Bare" },
        ]
        const res = await call(EXECUTE, ctx("brotherslazaroff", { items, name: "BL Import", orgId: "crc" }))
        expect(res.status).toBe(201)

        const { setlists, tracks } = setlistAndTracks()
        expect(setlists).toHaveLength(1)
        expect(setlists[0].data.orgId).toBe("brotherslazaroff")
        expect(tracks).toHaveLength(4)
        for (const t of tracks) expect(t.data.orgId).toBe("brotherslazaroff")

        expect(h.pcuInputs).toHaveLength(1)
        expect(h.pcuInputs[0].orgId).toBe("brotherslazaroff")
    })

    it("no host header → 'crc'", async () => {
        const res = await call(EXECUTE, ctx(null, { items: [{ type: "song", title: "Bare" }] }))
        expect(res.status).toBe(201)
        const { setlists, tracks } = setlistAndTracks()
        expect(setlists[0].data.orgId).toBe("crc")
        expect(tracks[0].data.orgId).toBe("crc")
    })
})

describe("W7 · /api/setlists/import/commit-document stamps the host tenant", () => {
    it("BL host → setlist + header + song tracks carry 'brotherslazaroff'", async () => {
        const body = {
            name: "BL Doc Import",
            eventDate: "2026-10-16",
            sections: [{ name: "Opening", order: 0 }],
            tracks: [
                { title: "Song A", order: 0, sectionName: "Opening", missingChart: true, recordingCandidates: [] },
                { title: "Song B", order: 1, missingChart: true, recordingCandidates: [] },
            ],
        }
        const res = await call(COMMIT, ctx("brotherslazaroff", body))
        expect(res.status).toBeLessThan(300)

        const { setlists, tracks } = setlistAndTracks()
        expect(setlists).toHaveLength(1)
        expect(setlists[0].data.orgId).toBe("brotherslazaroff")
        expect(tracks.length).toBe(3) // header + 2 songs
        for (const t of tracks) expect(t.data.orgId).toBe("brotherslazaroff")
    })

    // Multi-tenant phase 3: a well-formed id passes coerceOrgId; malformed → crc.
    it("malformed host value → coerceOrgId → 'crc'", async () => {
        const body = {
            name: "X",
            eventDate: "2026-10-16",
            sections: [],
            tracks: [{ title: "Song A", order: 0, missingChart: true, recordingCandidates: [] }],
        }
        await call(COMMIT, ctx("Not A Tenant!", body))
        const { setlists, tracks } = setlistAndTracks()
        expect(setlists[0].data.orgId).toBe("crc")
        expect(tracks[0].data.orgId).toBe("crc")
    })
})
