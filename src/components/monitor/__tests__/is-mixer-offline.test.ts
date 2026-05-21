import { describe, it, expect } from "vitest"
import { isMixerOffline } from "@/components/monitor/ConnectionIndicator"
import type { BridgeStatus } from "@/types/monitor"

function bridge(over: Partial<BridgeStatus> = {}): BridgeStatus {
    return {
        status: "online",
        lastSeen: { seconds: Math.floor(Date.now() / 1000) } as unknown as BridgeStatus["lastSeen"],
        x32Connected: true,
        clients: 1,
        localIp: null,
        version: "10.0.0",
        ...over,
    }
}

describe("isMixerOffline (C-6 — DisconnectedOverlay gate)", () => {
    it("is offline when the Firestore transport is disconnected or errored", () => {
        expect(isMixerOffline("disconnected")).toBe(true)
        expect(isMixerOffline("error")).toBe(true)
    })

    it("is NOT offline (no overlay) on a healthy connected desk", () => {
        expect(isMixerOffline("connected", bridge())).toBe(false)
    })

    it("is NOT offline when connected with no bridge data (legacy bridge assumed online)", () => {
        expect(isMixerOffline("connected", undefined)).toBe(false)
    })

    it("is offline when the bridge heartbeat reports offline", () => {
        expect(isMixerOffline("connected", bridge({ status: "offline" }))).toBe(true)
    })

    it("is offline when the bridge heartbeat is stale (>120s)", () => {
        const stale = bridge({
            lastSeen: { seconds: Math.floor(Date.now() / 1000) - 300 } as unknown as BridgeStatus["lastSeen"],
        })
        expect(isMixerOffline("connected", stale)).toBe(true)
    })

    it("is offline when the bridge is up but the X32 is disconnected", () => {
        expect(isMixerOffline("connected", bridge({ x32Connected: false }))).toBe(true)
    })
})
