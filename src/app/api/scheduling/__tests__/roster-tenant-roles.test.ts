// @vitest-environment node
/**
 * Multi-tenant phase 2 — roster / people listings use the MEMBERSHIP role in
 * the tenant (listTenantMembers), not the global users.role.
 *
 * Fixture (all migrated, so there is no legacy fallback):
 *   dana  — users.role 'band_leader'; crc: band_leader, brotherslazaroff: member
 *   bo    — users.role 'member';      brotherslazaroff: musician (BL-only)
 *   cy    — users.role 'musician';    crc: musician
 *
 * In BL, dana is a plain member: excluded from musician+ rosters (suggest,
 * suggest-band, email-packets) but included in the member+ broadcast
 * (notify-updated). bo is in every BL roster despite users.role 'member'.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

let db: FakeFirestore
const sent: string[] = []

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => (ctx: unknown) => fn(ctx),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/org/access", () => import("@/test-stubs/org-access-fake"))
vi.mock("@/lib/email", () => ({
    sendSetlistEmail: vi.fn(async (a: { to: string }) => {
        sent.push(a.to)
        return true
    }),
}))
vi.mock("@/lib/server-tracks", () => ({ getTracksForSetlist: vi.fn(async () => []) }))
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }))

const MIGRATED = { membershipsMigratedAt: new Date("2026-10-12T00:00:00Z") }
const member = (tenantId: string, uid: string, role: string) => ({
    uid, tenantId, role, soundEngineer: false, addedBy: "migration", addedAt: new Date(0),
})

function seed(): FakeFirestore {
    const f = new FakeFirestore()
        .seed("users", {
            dana: { ...MIGRATED, role: "band_leader", displayName: "Dana", email: "dana@x.test", musicianProfile: { instrument: "piano" } },
            bo: { ...MIGRATED, role: "member", displayName: "Bo", email: "bo@x.test", musicianProfile: { instrument: "drums" } },
            cy: { ...MIGRATED, role: "musician", displayName: "Cy", email: "cy@x.test", musicianProfile: { instrument: "bass" } },
        })
        .seed("memberships", {
            crc__dana: member("crc", "dana", "band_leader"),
            brotherslazaroff__dana: member("brotherslazaroff", "dana", "member"),
            brotherslazaroff__bo: member("brotherslazaroff", "bo", "musician"),
            crc__cy: member("crc", "cy", "musician"),
        })
        .seed("setlists", {
            blSet: { orgId: "brotherslazaroff", ownerId: "owner", name: "BL Gig" },
            crcSet: { orgId: "crc", ownerId: "owner", name: "Shabbat" },
        })
        .seed("config", { congregation__brotherslazaroff: {}, congregation: {} })
    // notify-updated writes users/{uid}/notifications/{auto} through db.batch()
    const baseDocRef = f.docRef.bind(f)
    ;(f as unknown as { docRef: (c: string, id: string) => unknown }).docRef = (c: string, id: string) => {
        const ref = baseDocRef(c, id)
        return {
            ...ref,
            collection: (sub: string) => ({ ...ref.collection(sub), doc: () => ({ _path: `${c}/${id}/${sub}/auto` }) }),
        }
    }
    ;(f as unknown as { batch: () => unknown }).batch = () => {
        const refs: string[] = []
        return {
            set: (ref: { _path: string }) => refs.push(ref._path),
            commit: async () => {
                for (const p of refs) sent.push(p)
            },
        }
    }
    return f
}

function ctx(org: string, url: string, body?: unknown) {
    const headers = new Headers({ "x-org-id": org })
    return {
        req: { headers, url: `https://x.test${url}`, nextUrl: new URL(`https://x.test${url}`) },
        body,
        auth: { uid: "caller", email: "caller@x.test", isAdmin: true, isBandLeader: true, isMusician: true, orgId: org },
    }
}
const call = async (fn: unknown, c: unknown) => (await (fn as (c: unknown) => Promise<Response>)(c)).json()

beforeEach(() => {
    db = seed()
    sent.length = 0
})

describe("roster listings use the tenant membership role", () => {
    it("suggest-band (BL): crc band_leader who is only a BL member is excluded; BL musician included", async () => {
        const { GET } = await import("@/app/api/scheduling/suggest-band/route")
        const body = await call(GET, ctx("brotherslazaroff", "/api/scheduling/suggest-band?setlistId=blSet"))
        const uids = (body.suggestions as Array<{ uid: string }>).map((s) => s.uid).sort()
        expect(uids).toEqual(["bo"])
    })

    it("suggest-band (crc): dana (crc band_leader) and cy listed; BL-only bo is not", async () => {
        const { GET } = await import("@/app/api/scheduling/suggest-band/route")
        const body = await call(GET, ctx("crc", "/api/scheduling/suggest-band?setlistId=crcSet"))
        const uids = (body.suggestions as Array<{ uid: string }>).map((s) => s.uid).sort()
        expect(uids).toEqual(["cy", "dana"])
    })

    it("suggest (BL host): only BL musician+ members", async () => {
        const { GET } = await import("@/app/api/scheduling/suggest/route")
        const body = await call(GET, ctx("brotherslazaroff", "/api/scheduling/suggest?setlistId=blSet"))
        expect((body.suggestions as Array<{ uid: string; name: string }>).map((s) => [s.uid, s.name])).toEqual([["bo", "Bo"]])
    })

    it("email-packets (BL setlist): emails BL musician+ only", async () => {
        const { POST } = await import("@/app/api/setlist/email-packets/route")
        const body = await call(POST, ctx("brotherslazaroff", "/api/setlist/email-packets", { setlistId: "blSet" }))
        expect(body).toEqual({ sent: 1, failed: 0, total: 1 })
        expect(sent).toEqual(["bo@x.test"])
    })

    it("email-packets: another tenant's setlist is not found and nothing is sent", async () => {
        const { POST } = await import("@/app/api/setlist/email-packets/route")
        const res = await (POST as unknown as (c: unknown) => Promise<Response>)(
            ctx("brotherslazaroff", "/api/setlist/email-packets", { setlistId: "crcSet" }),
        )
        expect(res.status).toBe(404)
        // The same answer as a setlist that does not exist.
        const missing = await (POST as unknown as (c: unknown) => Promise<Response>)(
            ctx("brotherslazaroff", "/api/setlist/email-packets", { setlistId: "no-such-setlist" }),
        )
        expect(missing.status).toBe(404)
        expect(await res.json()).toEqual(await missing.json())
        expect(sent).toEqual([])
    })

    it("notify-updated (BL host): member+ broadcast includes BL member dana and musician bo, not crc-only cy", async () => {
        const { POST } = await import("@/app/api/setlists/notify-updated/route")
        const body = await call(
            POST,
            ctx("brotherslazaroff", "/api/setlists/notify-updated", { setlistId: "blSet", setlistName: "BL Gig", trackCount: 3 }),
        )
        expect(body).toEqual({ ok: true, count: 2 })
        expect(sent.map((p) => p.split("/")[1]).sort()).toEqual(["bo", "dana"])
    })
})
