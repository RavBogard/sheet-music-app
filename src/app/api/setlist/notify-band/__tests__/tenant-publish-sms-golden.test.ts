// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 1 golden: the first-notify SMS that POST
 * /api/setlist/notify-band sends. crc and brotherslazaroff setlists get today's
 * exact text; a testshul setlist gets its own prefix from tenant config.
 */

const h = vi.hoisted(() => ({
    sendSMS: vi.fn(async () => ({ ok: true })),
    setlist: {} as Record<string, unknown>,
}))

vi.mock("@/lib/api-wrapper", () => ({
    createApiHandler: (fn: (ctx: unknown) => unknown) => (ctx: unknown) => fn(ctx),
}))
// Multi-tenant phase 6: this file pins the SMS text; the notifyBand gate on
// this route is tested in src/__tests__/mt-p6/feature-gates.test.ts.
vi.mock("@/lib/org/features", () => ({ requireFeature: vi.fn(async () => null) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "ts" } }))
vi.mock("@/lib/song-usage", () => ({ recordSongUsage: vi.fn(async () => ({ recorded: 0, skipped: 0 })) }))
vi.mock("@/lib/server-tracks", () => ({
    getTracksForSetlist: vi.fn(async () => [{ fileId: "f1", title: "Song One", type: "song" }]),
}))
vi.mock("@/lib/email", () => ({
    emailAllMembers: vi.fn(async () => ({ sent: 0, failed: 0, errors: [], messageIds: [] })),
}))
vi.mock("@/lib/push-send", () => ({ sendPushToUsers: vi.fn(async () => ({ sent: 0, failed: 0 })) }))
vi.mock("@/lib/sms", () => ({ sendSMS: h.sendSMS }))
vi.mock("@/lib/firebase-admin", () => {
    const users: Record<string, Record<string, unknown>> = {
        leader: { displayName: "Jordan Leader", email: "leader@example.com" },
        player: {
            displayName: "Alex Player",
            musicianProfile: { phone: "3145550101", notificationPreferences: { sms: true } },
        },
    }
    const anyRef = (): Record<string, unknown> => ({
        set: async () => undefined,
        update: async () => undefined,
        doc: () => anyRef(),
        collection: () => ({ doc: () => anyRef() }),
    })
    const db = {
        batch: () => ({ set: () => undefined, commit: async () => undefined }),
        collection: (name: string) => ({
            doc: (id: string) => ({
                ...anyRef(),
                get: async () =>
                    name === "setlists"
                        ? { exists: true, id, data: () => h.setlist }
                        : { exists: id in users, id, data: () => users[id] },
            }),
        }),
    }
    return { initAdmin: () => true, getFirestore: () => db }
})

import { POST } from "@/app/api/setlist/notify-band/route"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

// Noon UTC, so the locale date is the same in any test-runner time zone.
const EVENT = new Date("2026-03-13T12:00:00Z")

async function notify(orgId?: string): Promise<string> {
    h.sendSMS.mockClear()
    h.setlist = {
        name: "Friday Night Set",
        ownerId: "leader",
        eventDate: { toDate: () => EVENT },
        lastNotifiedAt: null,
        ...(orgId ? { orgId } : {}),
    }
    const call = POST as unknown as (ctx: unknown) => Promise<Response>
    const res = await call({
        req: {},
        body: { setlistId: "sl-1", musicians: [{ uid: "player", name: "Alex Player", email: "" }] },
        auth: { uid: "leader", email: "leader@example.com", isBandLeader: true },
    })
    expect(res.status).toBe(200)
    expect(h.sendSMS).toHaveBeenCalledTimes(1)
    const [to, body] = h.sendSMS.mock.calls[0] as unknown as [string, string]
    expect(to).toBe("3145550101")
    return body
}

const GOLDEN =
    'CRC Music: "Friday Night Set" for March 13, 2026 has been published. View it at https://centralreform.live/perform/setlist/sl-1'

beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_URL
    clearPrimedOrgConfigs()
})

describe("golden: notify-band publish SMS", () => {
    it("golden unstamped setlist (crc)", async () => {
        expect(await notify()).toBe(GOLDEN)
    })
    it("golden crc setlist", async () => {
        expect(await notify("crc")).toBe(GOLDEN)
    })
    it("golden brotherslazaroff setlist (frozen CRC text)", async () => {
        expect(await notify("brotherslazaroff")).toBe(GOLDEN)
    })
})

describe("testshul: publish SMS prefix reads tenant config", () => {
    it("a testshul setlist texts with the tenant prefix", async () => {
        primeTestOrg()
        expect(await notify("testshul")).toBe(
            'Test Shul Music: "Friday Night Set" for March 13, 2026 has been published. View it at https://centralreform.live/perform/setlist/sl-1',
        )
    })
})

describe("multi-tenant phase 2 W4: song usage carries the setlist's tenant", () => {
    it("passes rowOrg(setlist.orgId) to recordSongUsage (unstamped → crc)", async () => {
        const { recordSongUsage } = await import("@/lib/song-usage")
        const rec = vi.mocked(recordSongUsage)
        rec.mockClear()
        await notify("brotherslazaroff")
        expect(rec).toHaveBeenCalledTimes(1)
        expect(rec.mock.calls[0][4]).toBe("brotherslazaroff")
        rec.mockClear()
        await notify()
        expect(rec.mock.calls[0][4]).toBe("crc")
    })
})
