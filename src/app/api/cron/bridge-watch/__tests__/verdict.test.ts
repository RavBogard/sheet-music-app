import { describe, it, expect } from "vitest"
import { evaluateBridge } from "@/app/api/cron/bridge-watch/route"

/**
 * R8 — the pre-service tripwire's verdict logic.
 *
 * The owner CANNOT act mid-service, so this is a before-service check and its
 * whole value is: silent when green, and when not green, one root cause plus one
 * thing to do. These tests pin both halves — including the trap the tool exists
 * to defeat, that `bridge.status` reads "online" forever after a crash because
 * it is last-write-wins with no TTL.
 */

const NOW = 1_700_000_000_000
const sec = (n: number) => NOW - n * 1000

const healthy = {
    bridge: {
        status: "online" as const,
        lastSeen: sec(30),
        socketAlive: true,
        x32Connected: true,
        version: "10.0.7",
    },
    stateUpdatedAt: sec(5),
    leaseExpiresAt: NOW + 60_000,
    now: NOW,
}

describe("evaluateBridge — silent when green", () => {
    it("reports healthy with no problems on a live bridge", () => {
        const v = evaluateBridge(healthy)
        expect(v.healthy).toBe(true)
        expect(v.problems).toEqual([])
        expect(v.signature).toBe("")
        expect(v.alive).toBe(true)
    })

    it("tolerates an idle-but-fresh desk (10s heartbeat re-set keeps state young)", () => {
        expect(evaluateBridge({ ...healthy, stateUpdatedAt: sec(25) }).healthy).toBe(true)
    })

    it("stays healthy at the 120s liveness boundary (2 missed 60s beats)", () => {
        const v = evaluateBridge({ ...healthy, bridge: { ...healthy.bridge, lastSeen: sec(120) } })
        expect(v.alive).toBe(true)
        expect(v.healthy).toBe(true)
    })
})

describe("evaluateBridge — the failures worth waking someone for", () => {
    it("calls a crashed bridge DOWN even though status still says 'online'", () => {
        // The exact trap: last-write-wins fields keep reading "online" (a
        // 13.5h-stale "online" is on the record). Only now − lastSeen is honest.
        const v = evaluateBridge({
            ...healthy,
            bridge: { ...healthy.bridge, status: "online", lastSeen: sec(3600) },
        })
        expect(v.healthy).toBe(false)
        expect(v.alive).toBe(false)
        expect(v.signature).toBe("down")
        expect(v.problems[0]).toMatch(/DOWN/)
        expect(v.problems[0]).toMatch(/cannot be trusted/)
        expect(v.remedy).toMatch(/[Rr]estart/)
    })

    it("reports ONLY the root cause when the bridge is down", () => {
        // A dead process cannot have a reachable mixer or fresh state; listing
        // all three consequences buries the one action that matters.
        const v = evaluateBridge({
            bridge: { status: "online", lastSeen: sec(3600), socketAlive: false, x32Connected: false },
            stateUpdatedAt: sec(3600),
            leaseExpiresAt: NOW - 1000,
            now: NOW,
        })
        expect(v.problems).toHaveLength(1)
        expect(v.signature).toBe("down")
    })

    it("flags an unreachable mixer on a live bridge, and says to reconnect", () => {
        const v = evaluateBridge({
            ...healthy,
            bridge: { ...healthy.bridge, socketAlive: false, x32Connected: false },
        })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("mixer-unreachable")
        expect(v.mixerReachable).toBe(false)
        expect(v.remedy).toMatch(/bridge_reconnect/)
    })

    it("does NOT cry 'mixer unreachable' when only the folded bit is false (R7's fold)", () => {
        // socketAlive true + x32Connected false = state pipeline wedged, not a
        // dead desk. It is still worth reporting — but as stale state, with the
        // resync remedy, not as a mixer that needs power-cycling.
        const v = evaluateBridge({
            ...healthy,
            bridge: { ...healthy.bridge, socketAlive: true, x32Connected: false },
            stateUpdatedAt: sec(600),
        })
        expect(v.mixerReachable).toBe(true)
        expect(v.signature).toBe("state-stale")
        expect(v.remedy).toMatch(/bridge_resync/)
    })

    it("falls back to x32Connected on a bridge too old to publish socketAlive", () => {
        const v = evaluateBridge({
            ...healthy,
            bridge: { status: "online", lastSeen: sec(30), x32Connected: false, version: "9.0.0" },
        })
        expect(v.mixerReachable).toBe(false)
        expect(v.signature).toBe("mixer-unreachable")
    })

    it("flags a wedged state-write path on an otherwise healthy bridge", () => {
        const v = evaluateBridge({ ...healthy, stateUpdatedAt: sec(600) })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("state-stale")
        expect(v.stateAgeS).toBe(600)
    })

    it("flags an expired lease — the standby deadlock that reads green on every iPad", () => {
        const v = evaluateBridge({ ...healthy, leaseExpiresAt: NOW - 1000 })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("lease-expired")
        expect(v.problems[0]).toMatch(/standby/)
    })

    it("flags a bridge that has never written a heartbeat", () => {
        const v = evaluateBridge({ ...healthy, bridge: undefined })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("no-heartbeat")
        expect(v.alive).toBe(false)
    })

    it("flags a heartbeating bridge that never published a snapshot", () => {
        const v = evaluateBridge({ ...healthy, stateUpdatedAt: null })
        expect(v.healthy).toBe(false)
        expect(v.signature).toBe("no-state")
        expect(v.stateAgeS).toBeNull()
    })

    it("gives every failure a remedy — an alert with no action is noise", () => {
        const cases = [
            { ...healthy, bridge: undefined },
            { ...healthy, bridge: { ...healthy.bridge, lastSeen: sec(3600) } },
            { ...healthy, bridge: { ...healthy.bridge, socketAlive: false, x32Connected: false } },
            { ...healthy, stateUpdatedAt: sec(600) },
            { ...healthy, stateUpdatedAt: null },
            { ...healthy, leaseExpiresAt: NOW - 1000 },
        ]
        for (const c of cases) {
            const v = evaluateBridge(c)
            expect(v.healthy).toBe(false)
            expect(v.remedy.length).toBeGreaterThan(0)
        }
    })

    it("produces a stable signature so an unchanged problem is not re-sent", () => {
        const a = evaluateBridge({ ...healthy, stateUpdatedAt: sec(600) })
        const b = evaluateBridge({ ...healthy, stateUpdatedAt: sec(900) })
        expect(a.signature).toBe(b.signature) // same problem, later — stay quiet

        const c = evaluateBridge({ ...healthy, bridge: { ...healthy.bridge, lastSeen: sec(3600) } })
        expect(c.signature).not.toBe(a.signature) // different problem — speak up
    })

    it("combines independent problems into one order-insensitive signature", () => {
        const v = evaluateBridge({
            ...healthy,
            bridge: { ...healthy.bridge, socketAlive: false, x32Connected: false },
            stateUpdatedAt: sec(600),
            leaseExpiresAt: NOW - 1000,
        })
        expect(v.signature).toBe("lease-expired+mixer-unreachable+state-stale")
        expect(v.problems.length).toBe(3)
    })

    it("parses every Firestore timestamp shape the bridge might have written", () => {
        const shapes = [
            sec(30),
            new Date(sec(30)),
            new Date(sec(30)).toISOString(),
            { seconds: Math.floor(sec(30) / 1000) },
            { toMillis: () => sec(30) },
        ]
        for (const lastSeen of shapes) {
            const v = evaluateBridge({ ...healthy, bridge: { ...healthy.bridge, lastSeen } })
            expect(v.alive).toBe(true)
            expect(v.healthy).toBe(true)
        }
    })

    it("treats an unparseable timestamp as DOWN, not as fine (fail closed)", () => {
        const v = evaluateBridge({ ...healthy, bridge: { ...healthy.bridge, lastSeen: "not a date" } })
        expect(v.alive).toBe(false)
        expect(v.signature).toBe("down")
        expect(v.lastSeenAgeS).toBeNull()
    })
})
