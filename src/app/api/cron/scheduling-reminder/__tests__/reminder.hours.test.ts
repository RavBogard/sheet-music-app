import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FakeFirestore, tenantFilters } from "@/lib/org/__tests__/fake-admin-firestore"
import { makeTestOrgConfig } from "@/lib/org/__tests__/test-org-config"
import { codeOrgConfig } from "@/lib/org/config-code"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"

/**
 * Multi-tenant phase 1 — the hourly scheduling reminder. Every hour of a day:
 * crc and brotherslazaroff send only at 10 UTC (their pinned hour, the old
 * daily cron slot); a Jerusalem tenant (reminderLocalHour 5, no UTC pin)
 * sends at 05:00 local, which is 02:00 UTC in summer and 03:00 UTC in winter.
 * Each tenant reminds only its own rows; untagged rows are crc's.
 */

let db: FakeFirestore
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }))
const sendSchedulingEmail = vi.fn(async (_a: Record<string, unknown>) => ({ ok: true }))
vi.mock("@/lib/email-scheduling", () => ({ sendSchedulingEmail: (a: Record<string, unknown>) => sendSchedulingEmail(a) }))
vi.mock("@/lib/sms", () => ({ sendSchedulingReminderSMS: async () => ({ ok: true }) }))
vi.mock("@/env.mjs", () => ({ env: { CRON_SECRET: "secret" } }))
vi.mock("@/lib/error-reporting", () => ({ captureException: vi.fn() }))

const H = 3_600_000

function seed(now: number): FakeFirestore {
    const row = (setlistName: string, extra: Record<string, unknown>) => ({
        status: "pending",
        eventDate: new Date(now + 30 * H).toISOString(),
        musicianUid: `u-${setlistName}`,
        musicianEmail: `${setlistName}@x.test`,
        musicianName: setlistName,
        setlistName,
        instrument: "piano",
        ...extra,
    })
    return new FakeFirestore()
        .seed("scheduling_assignments", {
            a1: row("crc-untagged", {}),
            a2: row("crc", { orgId: "crc" }),
            a3: row("bl", { orgId: "brotherslazaroff" }),
            a4: row("testshul", { orgId: "testshul" }),
        })
        .seed("orgs", {
            crc: { ...codeOrgConfig("crc") },
            brotherslazaroff: { ...codeOrgConfig("brotherslazaroff") },
            testshul: { ...makeTestOrgConfig() },
        })
}

async function runAt(iso: string): Promise<string[]> {
    const now = Date.parse(iso)
    vi.setSystemTime(now)
    db = seed(now)
    sendSchedulingEmail.mockClear()
    const { GET } = await import("../route")
    const res = await GET(new Request("https://x.test/api/cron/scheduling-reminder", { headers: { authorization: "Bearer secret" } }))
    expect(res.status).toBe(200)
    return sendSchedulingEmail.mock.calls.map((c) => String(c[0].setlistName)).sort()
}

const hh = (h: number) => String(h).padStart(2, "0")

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    clearPrimedOrgConfigs()
})
afterEach(() => {
    vi.useRealTimers()
    delete process.env.ORG_CONFIG_SOURCE
})

describe("hourly reminder, code tenants (ORG_CONFIG_SOURCE=code)", () => {
    it("crc and BL send only at 10 UTC, each with its own rows; the unknown tenant's row is never sent", async () => {
        for (let h = 0; h < 24; h++) {
            const sent = await runAt(`2026-06-04T${hh(h)}:00:00.000Z`)
            expect(sent, `hour ${h}`).toEqual(h === 10 ? ["bl", "crc", "crc-untagged"] : [])
        }
    })

    it("crc reads pending rows the legacy way (no orgId filter); BL queries by orgId", async () => {
        await runAt("2026-06-04T10:00:00.000Z")
        const pending = db.queries.filter((q) => q.collection === "scheduling_assignments")
        expect(pending).toHaveLength(2)
        expect(pending[0].filters).toEqual([{ field: "status", op: "==", value: "pending" }])
        expect(tenantFilters(db, "scheduling_assignments")).toEqual([{ field: "orgId", op: "==", value: "brotherslazaroff" }])
    })
})

describe("hourly reminder with a Jerusalem tenant (ORG_CONFIG_SOURCE=firestore)", () => {
    beforeEach(() => {
        process.env.ORG_CONFIG_SOURCE = "firestore"
    })

    it.each([
        ["summer (IDT, UTC+3)", "2026-06-04", 2],
        ["winter (IST, UTC+2)", "2026-01-14", 3],
    ])("%s: testshul sends at 05:00 local only; crc and BL still at 10 UTC", async (_label, day, jerusalemUtcHour) => {
        for (let h = 0; h < 24; h++) {
            const sent = await runAt(`${day}T${hh(h)}:00:00.000Z`)
            const expected = [
                ...(h === 10 ? ["bl", "crc", "crc-untagged"] : []),
                ...(h === jerusalemUtcHour ? ["testshul"] : []),
            ].sort()
            expect(sent, `hour ${h}`).toEqual(expected)
        }
    })
})
