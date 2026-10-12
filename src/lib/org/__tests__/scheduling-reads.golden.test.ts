import { describe, it, expect, vi, beforeEach } from "vitest"
import { FakeFirestore, type RecordedQuery } from "@/lib/org/__tests__/fake-admin-firestore"

/**
 * Multi-tenant phase 1 GOLDEN — the scheduling reads that used to pull every
 * tenant's rows and filter in memory: GET /api/scheduling/history, GET
 * /api/scheduling/suggest-band, and the MCP list_pending_assignments and
 * suggest_band. Results for crc (tagged AND untagged rows) and
 * brotherslazaroff, written against the code BEFORE the orgId-query change
 * and never edited afterwards. The fixture fits inside every read window, so
 * an indexed tenant query must return exactly what the filtered read did.
 */

let db: FakeFirestore
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
// Multi-tenant phase 2: roster listings go through listTenantMembers (fake =
// spec behaviour; these unmigrated users take the legacy users-doc fallback).
vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: { req: Request }) => unknown) => (req: Request) => fn({ req }),
}))
vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: async () => ({ ok: true }),
}))

const T = (iso: string) => new Date(iso)

export function seedScheduling(fake: FakeFirestore): FakeFirestore {
    return fake
        .seed("scheduling_history", {
            h1: { musicianUid: "u1", action: "assigned", recordedAt: T("2026-05-01T00:00:00Z") },
            h2: { orgId: "crc", musicianUid: "u2", action: "confirmed", recordedAt: T("2026-05-02T00:00:00Z") },
            h3: { orgId: "brotherslazaroff", musicianUid: "u3", action: "assigned", recordedAt: T("2026-05-03T00:00:00Z") },
            h4: { orgId: "brotherslazaroff", musicianUid: "u4", action: "declined", recordedAt: T("2026-05-04T00:00:00Z") },
            h5: { musicianUid: "u4", action: "assigned", recordedAt: T("2026-05-05T00:00:00Z") },
        })
        .seed("scheduling_assignments", {
            c1: { status: "confirmed", musicianUid: "u1", musicianName: "One", instrument: "piano", setlistId: "s1", setlistName: "Crc A", assignedAt: T("2026-05-01T00:00:00Z") },
            c2: { orgId: "crc", status: "confirmed", musicianUid: "u2", musicianName: "Two", instrument: "bass", setlistId: "s1", setlistName: "Crc A", assignedAt: T("2026-05-02T00:00:00Z") },
            c3: { orgId: "brotherslazaroff", status: "confirmed", musicianUid: "u3", musicianName: "Three", instrument: "drums", setlistId: "s9", setlistName: "BL Gig", assignedAt: T("2026-05-03T00:00:00Z") },
            c4: { orgId: "brotherslazaroff", status: "pending", musicianUid: "u4", musicianName: "Four", instrument: "acoustic_guitar", setlistId: "s9", setlistName: "BL Gig", assignedAt: T("2026-05-04T00:00:00Z") },
            c5: { status: "declined", musicianUid: "u1", musicianName: "One", instrument: "piano", setlistId: "s2", setlistName: "Crc B", assignedAt: T("2026-05-05T00:00:00Z") },
            c6: { orgId: "crc", status: "pending", musicianUid: "u2", musicianName: "Two", instrument: "bass", setlistId: "s2", setlistName: "Crc B", assignedAt: T("2026-05-06T00:00:00Z") },
            c7: { status: "pending", musicianUid: "u4", musicianName: "Four", instrument: "acoustic_guitar", setlistId: "s2", setlistName: "Crc B", assignedAt: T("2026-05-07T00:00:00Z"), autoConfirmed: true },
            c8: { orgId: "brotherslazaroff", status: "confirmed", musicianUid: "u4", musicianName: "Four", instrument: "acoustic_guitar", setlistId: "s8", setlistName: "BL Older", assignedAt: T("2026-04-07T00:00:00Z") },
        })
        .seed("users", {
            u1: { role: "musician", displayName: "One", email: "u1@x.test", musicianProfile: { instrument: "piano", schedulingTier: "core" } },
            u2: { role: "band_leader", orgIds: ["crc"], displayName: "Two", email: "u2@x.test", musicianProfile: { instrument: "bass" } },
            u3: { role: "musician", orgIds: ["brotherslazaroff"], displayName: "Three", email: "u3@x.test", musicianProfile: { instrument: "drums", schedulingTier: "core" } },
            u4: { role: "musician", orgIds: ["crc", "brotherslazaroff"], displayName: "Four", email: "u4@x.test", musicianProfile: { instrument: "acoustic_guitar", schedulingTier: "guest" } },
            u5: { role: "pending", orgIds: ["crc"], displayName: "Five", email: "u5@x.test", musicianProfile: { instrument: "flute" } },
        })
        .seed("config", {
            congregation: { scheduling: { rabbiProfiles: [{ name: "Rabbi Daniel", musicalRole: "leads", bandSizeGuidance: "three or four" }] } },
        })
        .seed("setlists", {
            s1: { orgId: "crc", rabbi: "Rabbi Daniel", assignedUids: ["u2"] },
            s9: { orgId: "brotherslazaroff", assignedUids: [] },
        })
}

beforeEach(() => {
    db = seedScheduling(new FakeFirestore())
})

function req(path: string, org: string) {
    return new Request(`https://x.test${path}`, { headers: { "x-org-id": org } })
}

async function json(res: unknown) {
    return (res as Response).json()
}

export function queriesOf(fake: FakeFirestore, collection: string): RecordedQuery[] {
    return fake.queries.filter((q) => q.collection === collection)
}

describe("golden /api/scheduling/history", () => {
    it("crc: tagged + untagged history and analytics", async () => {
        const { GET } = await import("@/app/api/scheduling/history/route")
        const body = await json(await (GET as unknown as (r: Request) => Promise<Response>)(req("/api/scheduling/history", "crc")))
        expect(body.history.map((h: { id: string }) => h.id)).toEqual(["h5", "h2", "h1"])
        expect(body.analytics).toMatchInlineSnapshot(`
          {
            "instrumentFrequency": [
              {
                "count": 2,
                "instrument": "bass",
              },
              {
                "count": 2,
                "instrument": "piano",
              },
              {
                "count": 1,
                "instrument": "acoustic_guitar",
              },
            ],
            "musicianStats": [
              {
                "confirmed": 1,
                "declined": 0,
                "name": "Two",
                "pending": 1,
                "uid": "u2",
              },
              {
                "confirmed": 1,
                "declined": 1,
                "name": "One",
                "pending": 0,
                "uid": "u1",
              },
              {
                "confirmed": 0,
                "declined": 0,
                "name": "Four",
                "pending": 1,
                "uid": "u4",
              },
            ],
            "responseRate": 75,
            "totalAssignments": 5,
          }
        `)
    })
    it("brotherslazaroff: own rows only", async () => {
        const { GET } = await import("@/app/api/scheduling/history/route")
        const body = await json(await (GET as unknown as (r: Request) => Promise<Response>)(req("/api/scheduling/history", "brotherslazaroff")))
        expect(body.history.map((h: { id: string }) => h.id)).toEqual(["h4", "h3"])
        expect(body.analytics).toMatchInlineSnapshot(`
          {
            "instrumentFrequency": [
              {
                "count": 2,
                "instrument": "acoustic_guitar",
              },
              {
                "count": 1,
                "instrument": "drums",
              },
            ],
            "musicianStats": [
              {
                "confirmed": 1,
                "declined": 0,
                "name": "Four",
                "pending": 1,
                "uid": "u4",
              },
              {
                "confirmed": 1,
                "declined": 0,
                "name": "Three",
                "pending": 0,
                "uid": "u3",
              },
            ],
            "responseRate": 67,
            "totalAssignments": 3,
          }
        `)
    })
    it("musicianUid filter", async () => {
        const { GET } = await import("@/app/api/scheduling/history/route")
        const crc = await json(await (GET as unknown as (r: Request) => Promise<Response>)(req("/api/scheduling/history?musicianUid=u4", "crc")))
        const bl = await json(await (GET as unknown as (r: Request) => Promise<Response>)(req("/api/scheduling/history?musicianUid=u4", "brotherslazaroff")))
        expect(crc.history.map((h: { id: string }) => h.id)).toEqual(["h5"])
        expect(bl.history.map((h: { id: string }) => h.id)).toEqual(["h4"])
    })
})

describe("golden /api/scheduling/suggest-band", () => {
    it.each(["crc", "brotherslazaroff"])("%s", async (org) => {
        const { GET } = await import("@/app/api/scheduling/suggest-band/route")
        const body = await json(
            await (GET as unknown as (r: Request) => Promise<Response>)(
                req(`/api/scheduling/suggest-band?setlistId=s1&rabbiName=Rabbi%20Daniel&selectedUids=u2`, org),
            ),
        )
        expect(body).toMatchSnapshot()
    })
})

describe("golden MCP list_pending_assignments + suggest_band", () => {
    it.each(["crc", "brotherslazaroff"])("list_pending_assignments %s", async (org) => {
        const { listPendingAssignments } = await import("@/lib/mcp/tools/roster")
        const all = await listPendingAssignments("caller", {}, org)
        const one = await listPendingAssignments("caller", { uid: "u4" }, org)
        expect({ all, one }).toMatchSnapshot()
    })
    it.each([
        ["crc", "s1"],
        ["brotherslazaroff", "s9"],
    ])("suggest_band %s", async (org, setlistId) => {
        const { suggestBand } = await import("@/lib/mcp/tools/roster")
        expect(await suggestBand("caller", { setlistId }, org)).toMatchSnapshot()
    })
})
