// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Multi-tenant phase 1 golden: the task-assignment, task-completion and
 * scheduling emails. The crc and brotherslazaroff payloads (from line, subject,
 * HTML) were recorded from the code BEFORE these emails took an `org`, and must
 * never change. The testshul cases prove the copy now comes from tenant config.
 */

const { sendSpy } = vi.hoisted(() => ({ sendSpy: vi.fn() }))
vi.mock("resend", () => ({
    Resend: vi.fn(() => ({ emails: { send: sendSpy } })),
}))
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { sendTaskAssignmentEmail, sendTaskCompletionEmail } from "@/lib/email"
import { sendSchedulingEmail } from "@/lib/email-scheduling"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"

const assignment = {
    to: "player@example.com",
    cc: ["leader@example.com"],
    recipientName: "Alex Player",
    assignerName: "Jordan Leader",
    setlistName: "Friday Night Set",
    taskTitle: "Learn the bridge",
    taskDescription: "Bars 17-24, watch the key change",
    taskUrl: "https://example.test/setlists/s1",
}
const completion = {
    to: "leader@example.com",
    assignerName: "Jordan Leader",
    assigneeName: "Alex Player",
    setlistName: "Friday Night Set",
    taskTitle: "Learn the bridge",
    taskUrl: "https://example.test/setlists/s1",
}
const scheduling = {
    to: "player@example.com",
    recipientName: "Alex Player",
    setlistName: "Friday Night Set",
    eventDate: "Friday, March 13, 2026",
    instrument: "Bass",
    scheduleUrl: "https://example.test/schedule",
    assignmentId: "as-1",
    newSongs: [{ title: "Song One", fileId: "f1" }],
}

type Payload = { from: string; to: string; subject: string; html: string; cc?: string[] }
const lastPayload = (): Payload => sendSpy.mock.calls.at(-1)![0] as Payload
const asText = (p: Payload) => `FROM: ${p.from}\nTO: ${p.to}\nCC: ${p.cc?.join(",") ?? ""}\nSUBJECT: ${p.subject}\n\n${p.html}`

beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key"
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.RESEND_FROM_EMAIL_BROSLAZ
    sendSpy.mockReset()
    sendSpy.mockResolvedValue({ data: { id: "m1" }, error: null })
    clearPrimedOrgConfigs()
})
afterEach(() => {
    delete process.env.RESEND_API_KEY
    clearPrimedOrgConfigs()
})

const ORGS = ["crc", "brotherslazaroff"] as const

describe("golden: task + scheduling emails render today's text for crc and BL", () => {
    for (const org of ORGS) {
        it(`golden task assignment (${org})`, async () => {
            await sendTaskAssignmentEmail({ ...assignment, org } as typeof assignment)
            await expect(asText(lastPayload())).toMatchFileSnapshot("__goldens__/email-task-assignment.golden.txt")
        })
        it(`golden task completion (${org})`, async () => {
            await sendTaskCompletionEmail({ ...completion, org } as typeof completion)
            await expect(asText(lastPayload())).toMatchFileSnapshot("__goldens__/email-task-completion.golden.txt")
        })
        for (const status of ["pending", "confirmed", "cancelled"] as const) {
            it(`golden scheduling ${status} (${org})`, async () => {
                await sendSchedulingEmail({ ...scheduling, status, org } as typeof scheduling & { status: typeof status })
                await expect(asText(lastPayload())).toMatchFileSnapshot(`__goldens__/email-scheduling-${status}.golden.txt`)
            })
        }
    }

    it("golden: omitting org is the crc rendering", async () => {
        await sendTaskAssignmentEmail(assignment)
        const bare = asText(lastPayload())
        await sendTaskAssignmentEmail({ ...assignment, org: "crc" } as typeof assignment)
        expect(asText(lastPayload())).toBe(bare)
        expect(lastPayload().from).toBe("CRC Music <noreply@centralreform.live>")
        expect(lastPayload().html).toContain(">CRC Music — Central Reform Congregation</p>")
    })
})

describe("testshul: emails read tenant config", () => {
    it("task assignment + completion carry the tenant from-name and footer", async () => {
        primeTestOrg()
        await sendTaskAssignmentEmail({ ...assignment, org: "testshul" })
        expect(lastPayload().from).toBe("Test Shul Music <noreply@centralreform.live>")
        expect(lastPayload().html).toContain(">Test Shul Music — Test Shul Tehila</p>")
        expect(lastPayload().html).not.toContain("CRC")
        await sendTaskCompletionEmail({ ...completion, org: "testshul" })
        expect(lastPayload().from).toBe("Test Shul Music <noreply@centralreform.live>")
        expect(lastPayload().html).toContain(">Test Shul Music — Test Shul Tehila</p>")
    })
    it("scheduling email names the tenant as the venue", async () => {
        primeTestOrg()
        await sendSchedulingEmail({ ...scheduling, status: "pending", org: "testshul" })
        const p = lastPayload()
        expect(p.from).toBe("Test Shul Music <noreply@centralreform.live>")
        expect(p.html).toContain("for an upcoming service at Test Shul Tehila.")
        expect(p.html).toContain(">Test Shul Music — Test Shul Tehila</p>")
        expect(p.html).not.toContain("Central Reform")
        await sendSchedulingEmail({ ...scheduling, status: "cancelled", org: "testshul" })
        expect(lastPayload().html).toContain("upcoming service at Test Shul Tehila has been cancelled.")
    })
})
