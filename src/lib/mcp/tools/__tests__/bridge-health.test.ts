import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * O3 — get_bridge_health (app-side). Verifies the load-bearing behavior: the
 * `alive` verdict is derived from now − lastSeen (NOT the stale last-write-wins
 * booleans), the v10.0.4 diagnostics pass through (and read null on an older
 * bridge), the lease-expiry + state-staleness derivations, and the gate/
 * unconfigured refusals. firebase-admin + the trusted-leader gate are mocked;
 * the PURE server-monitor helpers (computeStateAgeSeconds/isStateStale/
 * serializeLastSeen) stay real so the math is exercised end to end.
 */

vi.mock("@/lib/firebase-admin", () => ({
    initAdmin: vi.fn(),
    getFirestore: vi.fn(() => ({})),
}))

vi.mock("@/lib/mcp/server-tracks-write", () => ({
    assertEditor: vi.fn(),
}))

vi.mock("@/lib/mcp/server-monitor", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/mcp/server-monitor")>()
    return { ...actual, loadMonitorConfig: vi.fn(), loadMixerStateMeta: vi.fn() }
})

import { getBridgeHealth } from "../bridge-health"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { loadMonitorConfig, loadMixerStateMeta } from "@/lib/mcp/server-monitor"

const mockGate = assertEditor as unknown as ReturnType<typeof vi.fn>
const mockConfig = loadMonitorConfig as unknown as ReturnType<typeof vi.fn>
const mockState = loadMixerStateMeta as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
    vi.clearAllMocks()
    mockGate.mockResolvedValue({ ok: true })
    mockState.mockResolvedValue({ snapshot: null, updatedAt: Date.now() - 5_000 })
})

describe("getBridgeHealth (O3)", () => {
    it("reports alive when the heartbeat is recent, surfacing v10.0.4 diagnostics", async () => {
        mockConfig.mockResolvedValue({
            bridge: {
                status: "online",
                x32Connected: true,
                lastSeen: Date.now() - 30_000,
                version: "10.0.4",
                clients: 2,
                socketAlive: true,
                unconfirmedCount: 0,
                queueDepth: 1,
                uptimeMs: 123_456,
                errCount: 4,
                lastError: { msg: "boom", ts: 9 },
            },
        })
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(true)
        expect(res.lastSeenAgeS).toBeGreaterThanOrEqual(29)
        expect(res.lastSeenAgeS).toBeLessThanOrEqual(32)
        expect(res.stateStale).toBe(false)
        expect(res.socketAlive).toBe(true)
        expect(res.queueDepth).toBe(1)
        expect(res.errCount).toBe(4)
        expect(res.lastError).toEqual({ msg: "boom", ts: 9 })
        expect(res.summary).toContain("alive")
    })

    it("reports DOWN when lastSeen is old even though status/x32Connected still read online", async () => {
        mockConfig.mockResolvedValue({
            bridge: {
                status: "online", // last-write-wins — lies once the bridge dies
                x32Connected: true, // also lies
                lastSeen: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
                version: "10.0.4",
            },
        })
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(false)
        expect(res.status).toBe("online") // raw field surfaced, but…
        expect(res.summary).toContain("DOWN") // …the derived verdict is honest
    })

    it("reads null for v10.0.4 diagnostics against an older bridge that doesn't write them", async () => {
        mockConfig.mockResolvedValue({
            bridge: {
                status: "online",
                x32Connected: true,
                lastSeen: Date.now() - 10_000,
                version: "10.0.1",
            },
        })
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(true)
        expect(res.socketAlive).toBeNull()
        expect(res.queueDepth).toBeNull()
        expect(res.errCount).toBeNull()
        expect(res.uptimeMs).toBeNull()
        expect(res.lastError).toBeNull()
    })

    it("flags stateStale when the live mixer snapshot is old", async () => {
        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 5_000, version: "10.0.4" },
        })
        mockState.mockResolvedValue({ snapshot: {}, updatedAt: Date.now() - 5 * 60 * 1000 }) // 5m old
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(true)
        expect(res.stateStale).toBe(true)
    })

    it("derives leaseExpired from bridgeLease.expiresAt (null when absent)", async () => {
        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 5_000, version: "10.0.4" },
            bridgeLease: { ownerId: "x", expiresAt: Date.now() - 1000 }, // expired
        })
        let res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.leaseExpired).toBe(true)

        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 5_000, version: "10.0.4" },
            bridgeLease: { ownerId: "x", expiresAt: Date.now() + 60_000 }, // live
        })
        res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.leaseExpired).toBe(false)

        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 5_000, version: "10.0.4" },
        })
        res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.leaseExpired).toBeNull()
    })

    it("reports not-alive with a clear summary when no bridge heartbeat has ever been written", async () => {
        mockConfig.mockResolvedValue({}) // config exists, no bridge field
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(false)
        expect(res.status).toBeNull()
        expect(res.lastSeenAgeS).toBeNull()
        expect(res.summary).toContain("No bridge heartbeat")
    })

    /**
     * R1 — "standby present" vs "nothing running". Before bridge v10.0.8 a
     * standby wrote nothing anywhere, so these two situations were
     * indistinguishable from the cloud: both read as a dead bridge, and the
     * second one is the only one that needs a human dispatched to the venue.
     */
    it("surfaces a standby bridge alongside a dead heartbeat (crash-relaunch in flight)", async () => {
        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 300_000, version: "10.0.8" },
            bridgeStandby: {
                lastSeen: Date.now() - 4_000,
                instanceId: "VENUEPC-8123-ab12cd34",
                machineId: "machine-A",
            },
        })
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(false)
        expect(res.standby).not.toBeNull()
        expect(res.standby?.ageS).toBe(4)
        expect(res.standby?.instanceId).toBe("VENUEPC-8123-ab12cd34")
        expect(res.summary).toContain("STANDBY bridge is present")
    })

    it("reports standby:null when nothing is standing by (and against an older bridge)", async () => {
        mockConfig.mockResolvedValue({
            bridge: { status: "online", x32Connected: true, lastSeen: Date.now() - 300_000, version: "10.0.4" },
        })
        const res = await getBridgeHealth("admin")
        if (!("alive" in res)) throw new Error("expected a success result")
        expect(res.alive).toBe(false)
        expect(res.standby).toBeNull()
        expect(res.summary).not.toContain("STANDBY")
    })

    it("returns monitor_unconfigured when config/monitor is absent", async () => {
        mockConfig.mockResolvedValue(null)
        const res = await getBridgeHealth("admin")
        expect("ok" in res && res.ok).toBe(false)
        if ("error" in res) expect(res.error.machine_code).toBe("monitor_unconfigured")
    })

    it("passes a gate refusal straight through (non-leader caller)", async () => {
        const refusal = { ok: false as const, error: { code: 403, machine_code: "forbidden_role", message: "no" } }
        mockGate.mockResolvedValue(refusal)
        const res = await getBridgeHealth("musician")
        expect(res).toBe(refusal)
        expect(mockConfig).not.toHaveBeenCalled()
    })
})
