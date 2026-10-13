import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FakeFirestore } from "@/lib/org/__tests__/fake-admin-firestore"

/**
 * Multi-tenant phase 1 GOLDEN — the scheduling reminder as it runs today: the
 * Vercel cron fires once a day at 10:00 UTC and reminds every pending
 * assignment whose service is within 48 hours (crc rows with and without an
 * orgId, and Brothers Lazaroff rows). Written against the code BEFORE the
 * hourly per-tenant change and never edited afterwards.
 */

let db: FakeFirestore
// Multi-tenant phase 6: this file pins the reminder's per-tenant timing with
// every tenant's schedulingEmails on (as before the flag). The flag's own
// loop is tested in src/__tests__/mt-p6/feature-gates.test.ts.
vi.mock("@/lib/org/features", async () => {
    const { cronTenantIds } = await import("@/lib/org/cron-tenants")
    return { tenantsWithFeature: () => cronTenantIds(), hasFeature: async () => true, requireFeature: async () => null }
})
vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => db }))
const sendSchedulingEmail = vi.fn(async (_a: Record<string, unknown>) => ({ ok: true }))
const sendSchedulingReminderSMS = vi.fn(async (_a: Record<string, unknown>) => ({ ok: true }))
vi.mock("@/lib/email-scheduling", () => ({ sendSchedulingEmail: (a: Record<string, unknown>) => sendSchedulingEmail(a) }))
vi.mock("@/lib/sms", () => ({ sendSchedulingReminderSMS: (a: Record<string, unknown>) => sendSchedulingReminderSMS(a) }))
vi.mock("@/env.mjs", () => ({ env: { CRON_SECRET: "secret" } }))
vi.mock("@/lib/error-reporting", () => ({ captureException: vi.fn() }))

export const NOW = Date.parse("2026-06-04T10:00:00.000Z")
const H = 3_600_000

export function seedReminderData(fake: FakeFirestore, now: number): FakeFirestore {
    return fake
        .seed("scheduling_assignments", {
            a1: { status: "pending", eventDate: new Date(now + 30 * H).toISOString(), musicianUid: "u1", musicianEmail: "u1@x.test", musicianName: "One", setlistName: "Crc Untagged", instrument: "piano" },
            a2: { orgId: "crc", status: "pending", eventDate: { seconds: (now + 40 * H) / 1000 }, musicianUid: "u2", musicianEmail: "u2@x.test", musicianPhone: "+15550002", musicianName: "Two", setlistName: "Crc Tagged", instrument: "bass" },
            a3: { orgId: "brotherslazaroff", status: "pending", eventDate: new Date(now + 20 * H).toISOString(), musicianUid: "u3", musicianEmail: "u3@x.test", musicianName: "Three", setlistName: "BL Gig", instrument: "drums" },
            a4: { status: "pending", eventDate: new Date(now + 72 * H).toISOString(), musicianUid: "u1", musicianEmail: "u1@x.test", musicianName: "One", setlistName: "Too Far", instrument: "piano" },
            a5: { orgId: "crc", status: "confirmed", eventDate: new Date(now + 10 * H).toISOString(), musicianUid: "u1", musicianEmail: "u1@x.test", musicianName: "One", setlistName: "Confirmed", instrument: "piano" },
            a6: { orgId: "brotherslazaroff", status: "pending", eventDate: new Date(now + 10 * H).toISOString(), lastRemindedAt: { seconds: (now - 2 * H) / 1000 }, musicianUid: "u3", musicianEmail: "u3@x.test", musicianName: "Three", setlistName: "Already", instrument: "drums" },
        })
        .seed("users", {
            u1: { musicianProfile: {} },
            u2: { musicianProfile: { notificationPreferences: { sms: true } } },
            u3: { orgIds: ["brotherslazaroff"], musicianProfile: { notificationPreferences: { email: false } } },
        })
}

export async function runReminder(): Promise<Record<string, unknown>> {
    const { GET } = await import("../route")
    const res = await GET(new Request("https://x.test/api/cron/scheduling-reminder", { headers: { authorization: "Bearer secret" } }))
    return (await res.json()) as Record<string, unknown>
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    db = seedReminderData(new FakeFirestore(), NOW)
    sendSchedulingEmail.mockClear()
    sendSchedulingReminderSMS.mockClear()
})
afterEach(() => vi.useRealTimers())

describe("golden scheduling reminder at 10:00 UTC (today's cron slot)", () => {
    it("reminds crc (tagged and untagged) and BL pending rows due within 48h", async () => {
        const body = await runReminder()
        expect(body).toEqual({ success: true, reminded: 3, emailsSent: 2, smsSent: 1 })
        expect(sendSchedulingEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(["u1@x.test", "u2@x.test"])
        expect(sendSchedulingEmail.mock.calls.map((c) => c[0].setlistName).sort()).toEqual(["Crc Tagged", "Crc Untagged"])
        expect(sendSchedulingReminderSMS.mock.calls.map((c) => c[0].to)).toEqual(["+15550002"])
        expect(db.adds.map((a) => a.path).sort()).toEqual([
            "users/u1/notifications",
            "users/u2/notifications",
            "users/u3/notifications",
        ])
        expect(db.updates.map((u) => u.path).sort()).toEqual([
            "scheduling_assignments/a1",
            "scheduling_assignments/a2",
            "scheduling_assignments/a3",
        ])
    })
})
