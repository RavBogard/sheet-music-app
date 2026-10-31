// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    user: { role: "musician" as string | undefined, soundEngineer: false },
    owned: [] as number[],
    ack: undefined as Record<string, unknown> | undefined,
    state: {
        buses: [
            {
                index: 5,
                name: "Daniel",
                fader: 0.75,
                sends: [
                    { channelIndex: 1, level: 0.75, on: true },
                    { channelIndex: 2, level: 0, on: true },
                    { channelIndex: 3, level: 0.5, on: false },
                ],
            },
        ],
        channels: [
            { index: 1, name: "Daniel" },
            { index: 2, name: "Spare" },
            { index: 3, name: "Wall" },
        ],
    },
}))

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: () => ({}),
}))
vi.mock("@/lib/mcp/server-monitor", async (orig) => {
    const actual = await orig<typeof import("@/lib/mcp/server-monitor")>()
    return {
        ...actual,
        assertMonitorAccess: vi.fn(async () => ({
            ok: true,
            user: h.user,
            ownedBuses: h.owned,
            config: { monitorBuses: [1, 2, 3, 4, 5], busAssignments: {} },
        })),
        loadMixerStateMeta: vi.fn(async () => ({ snapshot: h.state, updatedAt: Date.now() })),
        commandAckRef: vi.fn(() => ({ get: async () => ({ exists: Boolean(h.ack), data: () => h.ack }) })),
    }
})

import { getMix, x32LevelToDb } from "../tools/monitor"
import { getCommandStatus } from "../tools/monitor-observability"

beforeEach(() => {
    h.user = { role: "musician", soundEngineer: false }
    h.owned = []
    h.ack = undefined
})

describe("x32LevelToDb (MIXER-08)", () => {
    it("follows the X32 taper and reads silence as null", () => {
        expect(x32LevelToDb(0)).toBeNull()
        expect(x32LevelToDb(0.75)).toBe(0)
        expect(x32LevelToDb(0.5)).toBe(-10)
        expect(x32LevelToDb(1)).toBe(10)
    })
})

describe("get_mix (MIXER-06, MIXER-08)", () => {
    it("marks sends audible with a dB value and filters with onlyActive", async () => {
        h.user = { role: "admin", soundEngineer: false }
        const all = (await getMix("u", { busIndex: 5 })) as any
        expect(all.sends.map((s: any) => [s.channelName, s.audible])).toEqual([
            ["Daniel", true],
            ["Spare", false],
            ["Wall", false],
        ])
        expect(all.sends[0].db).toBe(0)
        expect(all.sends[1].db).toBeNull()
        const active = (await getMix("u", { busIndex: 5, onlyActive: true })) as any
        expect(active.sends.map((s: any) => s.channelIndex)).toEqual([1])
    })

    it("tells a privileged caller with no bus to pass busIndex and lists the buses", async () => {
        h.user = { role: "admin", soundEngineer: false }
        const r = (await getMix("u", {})) as any
        expect(r.ok).toBe(false)
        expect(JSON.stringify(r)).toContain("busIndex")
        expect(JSON.stringify(r)).toContain("validBusIndices")
        expect(JSON.stringify(r)).not.toMatch(/ask an admin to assign/i)
    })

    it("still sends a musician with no bus to an admin", async () => {
        const r = (await getMix("u", {})) as any
        expect(r.ok).toBe(false)
        expect(JSON.stringify(r)).toMatch(/admin/i)
    })
})

describe("get_command_status (MIXER-17)", () => {
    it("hides another user's ack from a musician but not from a sound engineer or the owner", async () => {
        h.ack = { status: "applied", uid: "someone-else", confirmedValue: 0.5 }
        expect(((await getCommandStatus("me", { commandId: "c1" })) as any).found).toBe(false)
        h.ack = { status: "applied", uid: "me", confirmedValue: 0.5 }
        expect(((await getCommandStatus("me", { commandId: "c1" })) as any).found).toBe(true)
        h.ack = { status: "applied", uid: "someone-else" }
        h.user = { role: "musician", soundEngineer: true }
        expect(((await getCommandStatus("me", { commandId: "c1" })) as any).found).toBe(true)
    })
})
