// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 1 golden: the scheduling SMS bodies. The crc and
 * brotherslazaroff bodies are today's exact text; the testshul cases prove the
 * venue word now comes from tenant config.
 */

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
    sendSchedulingAssignmentSMS,
    sendSchedulingCancellationSMS,
    sendSchedulingReminderSMS,
} from "@/lib/sms"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

const fetchSpy = vi.fn()

beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = "AC123"
    process.env.TWILIO_AUTH_TOKEN = "tok"
    process.env.TWILIO_PHONE_NUMBER = "+15550000000"
    fetchSpy.mockReset()
    fetchSpy.mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM1", status: "queued" }) })
    vi.stubGlobal("fetch", fetchSpy)
    clearPrimedOrgConfigs()
})
afterEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN
    delete process.env.TWILIO_PHONE_NUMBER
    vi.unstubAllGlobals()
    clearPrimedOrgConfigs()
})

const lastBody = () => new URLSearchParams(fetchSpy.mock.calls.at(-1)![1].body as string).get("Body")

const base = {
    to: "(314) 555-0101",
    musicianName: "Alex Player",
    setlistName: "Friday Night Set",
    eventDate: "Friday, March 13",
    scheduleUrl: "https://example.test/schedule",
}

const GOLDEN = {
    confirmed:
        'Hi Alex! You\'re confirmed to play on Bass at CRC on Friday, March 13 for "Friday Night Set". New songs: A, B, C +1 more. View schedule: https://example.test/schedule',
    pending:
        'Hi Alex, you\'re scheduled to play on Bass at CRC on Friday, March 13 for "Friday Night Set". New songs: A, B, C +1 more. Please confirm: https://example.test/schedule',
    reminder:
        'Reminder: CRC service "Friday Night Set" on Friday, March 13. You\'re playing on Bass. Setlist: https://example.test/schedule',
    cancelled:
        'Hi Alex, your CRC service assignment for "Friday Night Set" on Friday, March 13 has been cancelled.',
}

async function renderAll(org?: string) {
    const extra = org ? { org } : {}
    const out: Record<string, string | null> = {}
    for (const status of ["confirmed", "pending"] as const) {
        await sendSchedulingAssignmentSMS({ ...base, ...extra, instrument: "Bass", status, newSongs: ["A", "B", "C", "D"] } as Parameters<typeof sendSchedulingAssignmentSMS>[0])
        out[status] = lastBody()
    }
    await sendSchedulingReminderSMS({ ...base, ...extra, instrument: "Bass" } as Parameters<typeof sendSchedulingReminderSMS>[0])
    out.reminder = lastBody()
    await sendSchedulingCancellationSMS({ ...base, ...extra } as Parameters<typeof sendSchedulingCancellationSMS>[0])
    out.cancelled = lastBody()
    return out
}

describe("golden: scheduling SMS bodies for crc and BL", () => {
    it("golden (no org = crc)", async () => {
        expect(await renderAll()).toEqual(GOLDEN)
    })
    it("golden crc", async () => {
        expect(await renderAll("crc")).toEqual(GOLDEN)
    })
    it("golden brotherslazaroff (frozen CRC text)", async () => {
        expect(await renderAll("brotherslazaroff")).toEqual(GOLDEN)
    })
})

describe("testshul: SMS venue word reads tenant config", () => {
    it("uses the tenant abbreviation", async () => {
        primeTestOrg()
        const out = await renderAll("testshul")
        expect(out.confirmed).toContain(" at TST on Friday, March 13")
        expect(out.pending).toContain(" at TST on Friday, March 13")
        expect(out.reminder).toBe('Reminder: TST service "Friday Night Set" on Friday, March 13. You\'re playing on Bass. Setlist: https://example.test/schedule')
        expect(out.cancelled).toBe('Hi Alex, your TST service assignment for "Friday Night Set" on Friday, March 13 has been cancelled.')
    })
})
