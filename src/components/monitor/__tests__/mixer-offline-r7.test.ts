import { describe, it, expect } from "vitest"
import {
    getBridgeStatusMessage,
    getConnectionDisplayState,
    isMixerOffline,
    isMixerUnreachable,
    isStateSyncing,
} from "@/components/monitor/ConnectionIndicator"
import type { BridgeStatus } from "@/types/monitor"

/**
 * R7 — never take a fader away from a musician while the command path works.
 *
 * The bridge publishes `x32Connected` FOLDED: `socketAlive && stateAgeMs < 30s`.
 * The client then used that bit to wrap every fader in `DisconnectedOverlay`
 * (`pointer-events-none`, "Mixer offline — last known levels"), so a >30s
 * Firestore write stall — congested venue uplink, a RESOURCE_EXHAUSTED burst —
 * disabled monitor control MID-SERVICE on a desk that was answering commands
 * the whole time. `socketAlive` is the raw bit that distinguishes the two.
 */

function bridge(over: Partial<BridgeStatus> = {}): BridgeStatus {
    return {
        status: "online",
        lastSeen: { seconds: Math.floor(Date.now() / 1000) } as unknown as BridgeStatus["lastSeen"],
        x32Connected: true,
        clients: 1,
        localIp: null,
        version: "10.0.4",
        ...over,
    }
}

/** The exact shape of the bug: socket up, state pipeline wedged past 30s. */
const wedgedStatePipeline = bridge({ socketAlive: true, x32Connected: false })

/** A genuinely dead desk: socket down, so the fold is false for the real reason. */
const deadMixer = bridge({ socketAlive: false, x32Connected: false })

describe("R7 — a wedged state pipeline must not disable the faders", () => {
    it("does NOT overlay when the socket is alive but x32Connected folded false", () => {
        expect(isMixerOffline("connected", wedgedStatePipeline)).toBe(false)
    })

    it("still overlays when the mixer is genuinely unreachable", () => {
        expect(isMixerOffline("connected", deadMixer)).toBe(true)
    })

    it("classifies the wedged case as 'syncing', not 'unreachable'", () => {
        expect(isStateSyncing(wedgedStatePipeline)).toBe(true)
        expect(isMixerUnreachable(wedgedStatePipeline)).toBe(false)

        expect(isStateSyncing(deadMixer)).toBe(false)
        expect(isMixerUnreachable(deadMixer)).toBe(true)
    })

    it("shows a quiet 'Syncing…' label rather than 'Mixer disconnected'", () => {
        expect(getConnectionDisplayState("connected", wedgedStatePipeline).label).toBe("Syncing…")
        expect(getConnectionDisplayState("connected", deadMixer).label).toBe("Mixer disconnected")
        expect(getConnectionDisplayState("connected", bridge({ socketAlive: true })).label)
            .toBe("Connected")
    })

    it("returns no blocking bridge message while syncing — the popover must keep its faders", () => {
        // QuickMonitorPanel uses this as an EARLY RETURN: a non-null message
        // replaces the entire fader panel with one line of text. Returning
        // "mixer disconnected" during a Firestore stall took every fader off the
        // musician's screen on a healthy desk.
        expect(getBridgeStatusMessage(wedgedStatePipeline)).toBeNull()
        expect(getBridgeStatusMessage(deadMixer)).toBe("Bridge online — mixer disconnected")
    })

    it("falls back to the folded bit on a pre-v10.0.4 bridge that omits socketAlive", () => {
        // We cannot observe reachability there, so the previous (conservative)
        // behaviour is preserved deliberately rather than assumed away.
        const legacy = bridge({ x32Connected: false })
        expect(legacy.socketAlive).toBeUndefined()
        expect(isMixerOffline("connected", legacy)).toBe(true)
        expect(isStateSyncing(legacy)).toBe(false)
    })

    it("keeps every pre-existing hard-offline case (no regression to C-6)", () => {
        expect(isMixerOffline("disconnected")).toBe(true)
        expect(isMixerOffline("error")).toBe(true)
        expect(isMixerOffline("connected", undefined)).toBe(false)
        expect(isMixerOffline("connected", bridge({ socketAlive: true }))).toBe(false)
        expect(isMixerOffline("connected", bridge({ status: "offline" }))).toBe(true)

        const heartbeatDead = bridge({
            socketAlive: true,
            lastSeen: { seconds: Math.floor(Date.now() / 1000) - 300 } as unknown as BridgeStatus["lastSeen"],
        })
        // A dead bridge outranks a live socket: nothing is draining commands.
        expect(isMixerOffline("connected", heartbeatDead)).toBe(true)
    })
})
