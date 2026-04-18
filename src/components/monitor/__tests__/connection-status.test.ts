import { describe, it, expect } from "vitest"
import {
    isBridgeOnline,
    getBridgeStatusMessage,
    getConnectionDisplayState,
} from "../ConnectionIndicator"
import type { BridgeStatus } from "@/types/monitor"
import type { ConnectionStatus } from "@/lib/firestore-monitor-client"

function makeBridge(overrides: Partial<BridgeStatus> = {}): BridgeStatus {
    return {
        status: "online",
        lastSeen: { toDate: () => new Date() },
        x32Connected: true,
        clients: 1,
        localIp: "192.168.1.100",
        version: "3.1.0",
        ...overrides,
    }
}

describe("isBridgeOnline", () => {
    it("returns true when bridge is online and lastSeen is fresh", () => {
        const bridge = makeBridge()
        expect(isBridgeOnline(bridge)).toBe(true)
    })

    it("returns false when bridge status is offline", () => {
        const bridge = makeBridge({ status: "offline" })
        expect(isBridgeOnline(bridge)).toBe(false)
    })

    it("returns false when lastSeen is stale (>2 minutes)", () => {
        const staleDate = new Date(Date.now() - 3 * 60 * 1000) // 3 minutes ago
        const bridge = makeBridge({ lastSeen: { toDate: () => staleDate } })
        expect(isBridgeOnline(bridge)).toBe(false)
    })

    it("returns true when no bridge data (legacy bridge)", () => {
        expect(isBridgeOnline(undefined)).toBe(true)
    })

    it("returns true when lastSeen is missing", () => {
        const bridge = makeBridge({ lastSeen: undefined })
        expect(isBridgeOnline(bridge)).toBe(true)
    })

    it("handles Firestore Timestamp with seconds field", () => {
        const bridge = makeBridge({
            lastSeen: { seconds: Math.floor(Date.now() / 1000) },
        })
        expect(isBridgeOnline(bridge)).toBe(true)
    })
})

describe("getBridgeStatusMessage", () => {
    it("returns null when bridge is fully connected", () => {
        const bridge = makeBridge()
        expect(getBridgeStatusMessage(bridge)).toBeNull()
    })

    it('returns "Bridge is offline" when bridge heartbeat is stale', () => {
        const staleDate = new Date(Date.now() - 3 * 60 * 1000)
        const bridge = makeBridge({ lastSeen: { toDate: () => staleDate } })
        expect(getBridgeStatusMessage(bridge)).toBe("Bridge is offline")
    })

    it('returns mixer disconnected message when x32Connected is false', () => {
        const bridge = makeBridge({ x32Connected: false })
        const msg = getBridgeStatusMessage(bridge)
        expect(msg).toContain("mixer disconnected")
    })

    it("returns null when no bridge data", () => {
        expect(getBridgeStatusMessage(undefined)).toBeNull()
    })
})

describe("getConnectionDisplayState", () => {
    it("returns connected/green when status=connected and bridge is fully online", () => {
        const result = getConnectionDisplayState("connected", makeBridge())
        expect(result.label).toBe("Connected")
        expect(result.color).toContain("green")
    })

    it("returns bridge offline/red when bridge heartbeat is stale", () => {
        const staleDate = new Date(Date.now() - 3 * 60 * 1000)
        const bridge = makeBridge({ lastSeen: { toDate: () => staleDate } })
        const result = getConnectionDisplayState("connected", bridge)
        expect(result.label).toBe("Bridge offline")
        expect(result.color).toContain("red")
    })

    it("returns mixer disconnected/yellow when bridge online but x32 not connected", () => {
        const bridge = makeBridge({ x32Connected: false })
        const result = getConnectionDisplayState("connected", bridge)
        expect(result.label).toBe("Mixer disconnected")
        expect(result.color).toContain("yellow")
    })

    it("returns connecting/yellow when status=connecting", () => {
        const result = getConnectionDisplayState("connecting")
        expect(result.label).toBe("Connecting...")
        expect(result.color).toContain("yellow")
    })

    it("returns offline/gray when status=disconnected", () => {
        const result = getConnectionDisplayState("disconnected")
        expect(result.label).toBe("Offline")
        expect(result.color).toContain("gray") // muted/gray
    })

    it("returns offline/gray when status=error", () => {
        const result = getConnectionDisplayState("error")
        expect(result.label).toBe("Offline")
        expect(result.color).toContain("gray")
    })
})
