import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Cycle-1 F-001/F-002/F-003 regression — defensive guards on mixer state
 * read by `list_monitor_buses` and `get_matrix`.
 *
 * Before the fix, if `monitor-live/state.buses` was stored as a non-array
 * (an object, a string, undefined behind a corrupted field), the handler
 * called `.map` on it and threw `TypeError: (...).map is not a function`.
 * The MCP framework propagated the throw as a raw error string with no
 * structured envelope, leaving agent callers with an un-typed failure.
 *
 * The fix:
 *   1. Coerce state.buses + state.matrices through `Array.isArray ? x : []`.
 *   2. Wrap the handler body in try/catch so any unexpected throw produces
 *      a structured `ToolError` instead of escaping as raw JS error.
 *
 * These tests mock `loadMixerState` directly so the handler is exercised
 * without an emulator (fast unit test). Access-side mocks let
 * `assertMonitorAccess` pass cleanly.
 */

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => ({ _isMockDb: true })),
}))

vi.mock("@/lib/mcp/server-monitor", () => ({
    assertMonitorAccess: vi.fn(),
    loadMixerState: vi.fn(),
    isPrivilegedMonitor: vi.fn(() => true), // admin/SE path — surfaces matrices
    serializeLastSeen: vi.fn(() => null),
    canControlBus: vi.fn(() => true),
    enqueueCommand: vi.fn(),
}))

import {
    assertMonitorAccess,
    loadMixerState,
    isPrivilegedMonitor,
} from "@/lib/mcp/server-monitor"
import { listMonitorBuses, getMatrix } from "../tools/monitor"

const adminAccessOk = {
    ok: true as const,
    user: { role: "admin", soundEngineer: false },
    ownedBuses: [],
    config: {
        busAssignments: {},
        bridge: null,
    } as never,
}

beforeEach(() => {
    vi.mocked(assertMonitorAccess).mockResolvedValue(adminAccessOk)
    vi.mocked(isPrivilegedMonitor).mockReturnValue(true)
})

afterEach(() => {
    vi.clearAllMocks()
})

describe("list_monitor_buses — F-001 defensive guards", () => {
    it("returns empty arrays when state.buses is an object (non-array)", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            // Corrupted shape — TS type says `BusInfo[]` but Firestore returned an object.
            buses: { "1": { index: 1, name: "Vox wedge" } } as unknown as never,
            matrices: undefined as never,
            channels: [] as never,
            config: {} as never,
        })

        const result = await listMonitorBuses("admin-uid")

        expect(result).toMatchObject({
            buses: [],
            matrices: [],
            isPrivileged: true,
        })
        // Crucially: did NOT throw.
        expect("error" in result).toBe(false)
    })

    it("returns empty arrays when state.matrices is an object (non-array)", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            buses: [] as never,
            matrices: { "1": { index: 1, name: "FOH-L" } } as unknown as never,
            channels: [] as never,
            config: {} as never,
        })

        const result = await listMonitorBuses("admin-uid")
        expect(result).toMatchObject({ buses: [], matrices: [] })
    })

    it("handles happy path with real BusInfo[]", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            buses: [
                { index: 1, name: "Vox wedge" },
                { index: 2, name: "Bass" },
            ] as never,
            matrices: [] as never,
            channels: [] as never,
            config: {} as never,
        })

        const result = await listMonitorBuses("admin-uid")
        expect(result).toMatchObject({
            buses: [
                { index: 1, name: "Vox wedge", assignedTo: [] },
                { index: 2, name: "Bass", assignedTo: [] },
            ],
        })
    })

    it("F-7: marks each bus active (configured) vs inactive (never set up)", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            buses: [
                // named + a send on → active
                {
                    index: 1,
                    name: "Vox wedge",
                    fader: 0.5,
                    sends: [{ channelIndex: 1, level: 0.4, on: true }],
                },
                // named, fader 0, only send off → still configured (active by name)
                {
                    index: 2,
                    name: "Andrea Wedge",
                    fader: 0,
                    sends: [{ channelIndex: 1, level: 0, on: false }],
                },
                // no name, fader 0, no sends → never set up (inactive)
                { index: 3, name: "", fader: 0, sends: [] },
            ] as never,
            matrices: [] as never,
            channels: [] as never,
            config: {} as never,
        })
        const result = (await listMonitorBuses("admin-uid")) as {
            buses: Array<{ index: number; active: boolean }>
        }
        const byIndex = Object.fromEntries(
            result.buses.map((b) => [b.index, b]),
        )
        expect(byIndex[1].active).toBe(true)
        expect(byIndex[2].active).toBe(true)
        expect(byIndex[3].active).toBe(false)
    })

    it("F-003: unexpected throw inside handler returns the rich envelope", async () => {
        vi.mocked(loadMixerState).mockRejectedValue(
            new Error("Firestore offline"),
        )

        const result = await listMonitorBuses("admin-uid")
        // Cycle-2 REG-001b: handler errors now use the rich envelope shape.
        // Cycle-3 REG-002 (cycle3-envelope @ 2b8762f97) moved `message`
        // from the top level into `error.message`; this fixture was missed
        // and is repaired here by C4-009 fixes-fixture-migration-tail.
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "internal_error",
                message: expect.stringMatching(
                    /list_monitor_buses internal error: Firestore offline/,
                ),
            },
        })
    })
})

describe("get_matrix — F-002 defensive guards", () => {
    it("returns empty matrices array when state.matrices is an object", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            buses: [] as never,
            matrices: { "1": { index: 1 } } as unknown as never,
            channels: [] as never,
            config: {} as never,
        })

        const result = await getMatrix("admin-uid", {})
        expect(result).toMatchObject({ matrices: [] })
        expect("error" in result).toBe(false)
    })

    it("handles happy path with real MatrixInfo[]", async () => {
        vi.mocked(loadMixerState).mockResolvedValue({
            buses: [] as never,
            matrices: [
                { index: 1, name: "FOH-L", fader: 0.7, on: true },
                { index: 2, name: "FOH-R", fader: 0.7, on: true },
            ] as never,
            channels: [] as never,
            config: {} as never,
        })

        const result = await getMatrix("admin-uid", {})
        expect(result).toMatchObject({
            matrices: [
                { index: 1, name: "FOH-L", fader: 0.7, on: true },
                { index: 2, name: "FOH-R", fader: 0.7, on: true },
            ],
        })
    })

    it("F-003: unexpected throw inside handler returns the rich envelope", async () => {
        vi.mocked(loadMixerState).mockRejectedValue(
            new Error("Bridge daemon unreachable"),
        )

        const result = await getMatrix("admin-uid", {})
        // Cycle-2 REG-001b: handler errors now use the rich envelope shape.
        // Cycle-3 REG-002 (cycle3-envelope @ 2b8762f97) moved `message`
        // from the top level into `error.message`; this fixture was missed
        // and is repaired here by C4-009 fixes-fixture-migration-tail.
        expect(result).toMatchObject({
            ok: false,
            error: {
                machine_code: "internal_error",
                message: expect.stringMatching(
                    /get_matrix internal error: Bridge daemon unreachable/,
                ),
            },
        })
    })
})
