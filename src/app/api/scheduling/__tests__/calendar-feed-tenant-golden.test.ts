// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Multi-tenant phase 1 golden: the .ics feed. crc and brotherslazaroff hosts
 * get today's exact calendar (PRODID, name, time zone, UIDs, location,
 * filename); a testshul host gets its own identity and time zone.
 */

const h = vi.hoisted(() => ({
    users: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
    assignments: [] as Array<{ id: string; data: () => Record<string, unknown> }>,
}))

vi.mock("@/lib/firebase-admin", () => {
    const chain = (docs: () => unknown[]) => {
        const c: Record<string, unknown> = {}
        c.where = () => c
        c.limit = () => c
        c.get = async () => ({ empty: docs().length === 0, docs: docs() })
        return c
    }
    return {
        initAdmin: () => true,
        getFirestore: () => ({
            collection: (name: string) =>
                chain(() => (name === "users" ? h.users : name === "scheduling_assignments" ? h.assignments : [])),
        }),
    }
})
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/constants", () => ({ BASE_URL: "https://centralreform.live" }))
// The registry does not know the fixture tenant yet; let it through so the
// testshul case can exercise the x-org-id path.
vi.mock("@/lib/org/registry", async (orig) => {
    const real = await orig<typeof import("@/lib/org/registry")>()
    return {
        ...real,
        coerceOrgId: (v: string | null | undefined) => (v === "testshul" ? "testshul" : real.coerceOrgId(v)),
    }
})

import { GET } from "@/app/api/scheduling/calendar-feed/[token]/route"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

const TOKEN = "tok1234567890abcdef"

async function feed(orgHeader?: string) {
    const headers: Record<string, string> = {}
    if (orgHeader) headers["x-org-id"] = orgHeader
    const req = new NextRequest(`http://localhost/api/scheduling/calendar-feed/${TOKEN}`, { headers })
    const res = await GET(req, { params: Promise.resolve({ token: TOKEN }) })
    expect(res.status).toBe(200)
    return { body: await res.text(), disposition: res.headers.get("Content-Disposition") }
}

const GOLDEN_ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRC Music//Musician Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    String.raw`X-WR-CALNAME:CRC Music - Alex\, Player`,
    "X-WR-TIMEZONE:America/Chicago",
    "BEGIN:VEVENT",
    "UID:crc-as-1@centralreform.live",
    "DTSTAMP:20260301T150000Z",
    "DTSTART:20260313T233000Z",
    "DTEND:20260314T010000Z",
    "SUMMARY:Friday Night Set (Bass)",
    String.raw`DESCRIPTION:Status: Confirmed\nInstrument: Bass\nSetlist: https://centralreform.live/setlists/sl-1\nSchedule: https://centralreform.live/schedule`,
    "LOCATION:Central Reform Congregation",
    "STATUS:CONFIRMED",
    "URL:https://centralreform.live/setlists/sl-1",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:crc-as-2@centralreform.live",
    "DTSTAMP:20260301T150000Z",
    "DTSTART:20260314T150000Z",
    "DTEND:20260314T163000Z",
    "SUMMARY:Saturday Set",
    String.raw`DESCRIPTION:Status: Pending\nSetlist: https://centralreform.live/setlists/sl-2\nSchedule: https://centralreform.live/schedule`,
    "LOCATION:Central Reform Congregation",
    "STATUS:TENTATIVE",
    "URL:https://centralreform.live/setlists/sl-2",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n")
const GOLDEN_DISPOSITION = 'attachment; filename="crc-schedule-tok12345.ics"'

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-03-01T15:00:00Z"))
    clearPrimedOrgConfigs()
    h.users = [{ id: "u1", data: () => ({ displayName: "Alex, Player" }) }]
    h.assignments = [
        {
            id: "as-1",
            data: () => ({
                status: "confirmed",
                setlistName: "Friday Night Set",
                setlistId: "sl-1",
                instrument: "Bass",
                eventDate: "2026-03-13T23:30:00Z",
            }),
        },
        {
            id: "as-2",
            data: () => ({
                status: "pending",
                setlistName: "Saturday Set",
                setlistId: "sl-2",
                instrument: "",
                eventDate: { seconds: Date.UTC(2026, 2, 14, 15, 0, 0) / 1000 },
            }),
        },
    ]
})
afterEach(() => {
    vi.useRealTimers()
    clearPrimedOrgConfigs()
})

describe("golden: calendar feed for crc and BL", () => {
    it("golden no x-org-id (crc)", async () => {
        const { body, disposition } = await feed()
        expect(body).toBe(GOLDEN_ICS)
        expect(disposition).toBe(GOLDEN_DISPOSITION)
    })
    it("golden crc host", async () => {
        const { body, disposition } = await feed("crc")
        expect(body).toBe(GOLDEN_ICS)
        expect(disposition).toBe(GOLDEN_DISPOSITION)
    })
    it("golden brotherslazaroff host (frozen CRC feed)", async () => {
        const { body, disposition } = await feed("brotherslazaroff")
        expect(body).toBe(GOLDEN_ICS)
        expect(disposition).toBe(GOLDEN_DISPOSITION)
    })
})
