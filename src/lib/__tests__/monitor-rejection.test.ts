import { describe, it, expect, beforeEach } from "vitest"
import { useMonitorStore } from "@/lib/monitor-store"
import { faderReducer, humanizeRejection, initFaderState } from "@/lib/monitor/fader-confirmation"
import { coerceMixerSnapshot } from "@/lib/monitor/coerce-state"
import type { MixerSnapshot, MonitorConfig } from "@/types/monitor"

/**
 * R2 (rejection rollback + reason) and R5 (unconfirmed propagation), at the
 * store / reducer level.
 *
 * The behaviour being protected: the bridge already classified every command as
 * applied / rejected+reason / timeout and wrote it to
 * `monitor-live/commands/acks`, and NONE of it reached a musician — the rules
 * denied the read and the client never subscribed. Every distinct failure looked
 * identical on an iPad: a 2s spinner, then the knob eases back, no words. These
 * tests pin the two halves that make a rejection actionable — the optimistic
 * value goes back to what the desk actually holds, and a reason survives to the
 * fader that can show it.
 */

const cfg = (): MonitorConfig => ({
    bridgeUrl: "",
    x32Address: "",
    x32Port: 0,
    monitorBuses: [],
    busAssignments: {},
})

function snapshot(over: Partial<MixerSnapshot> = {}): MixerSnapshot {
    return {
        channels: [],
        buses: [
            {
                index: 5,
                name: "Bus 5",
                fader: 0.5,
                on: true,
                sends: [
                    { channelIndex: 3, level: 0.4, on: true },
                    { channelIndex: 7, level: 0.6, on: true },
                ],
            },
        ],
        matrices: [{ index: 2, name: "Mtx 2", fader: 0.3, on: true }],
        config: cfg(),
        ...over,
    }
}

const store = () => useMonitorStore.getState()

describe("R2 — rejection rolls the optimistic value back", () => {
    beforeEach(() => {
        store().reset()
        store().setSnapshot(snapshot(), "u1", 1000)
    })

    it("restores the pre-drag send level and records the reason", () => {
        // Musician drags channel 3 on bus 5 from 0.4 up to 0.85 (optimistic).
        store().updateSendLevel(5, 3, 0.85)
        expect(store().buses[0].sends[0].level).toBe(0.85)

        // The bridge refuses it — not their bus.
        store().rejectCommand("send_level:3:5", "unauthorized")

        expect(store().buses[0].sends[0].level).toBe(0.4) // the desk's real value
        expect(store().rejections["send_level:3:5"]).toEqual({ reason: "unauthorized", seq: 1 })
    })

    it("rolls back to the value BEFORE the drag, not the previous throttled tick", () => {
        // A 3s drag emits ~10 optimistic writes/s. Rolling back one tick would
        // leave the musician at a level neither they nor the desk ever chose.
        store().updateSendLevel(5, 3, 0.5)
        store().updateSendLevel(5, 3, 0.6)
        store().updateSendLevel(5, 3, 0.7)
        store().updateSendLevel(5, 3, 0.85)

        store().rejectCommand("send_level:3:5", "bridge-standby")
        expect(store().buses[0].sends[0].level).toBe(0.4)
    })

    it("touches ONLY the rejected target — a co-owner's other faders are untouched", () => {
        store().updateSendLevel(5, 3, 0.85)
        store().updateSendLevel(5, 7, 0.95)
        store().updateBusFader(5, 0.9)

        store().rejectCommand("send_level:3:5", "unauthorized")

        expect(store().buses[0].sends[0].level).toBe(0.4)  // rolled back
        expect(store().buses[0].sends[1].level).toBe(0.95) // untouched
        expect(store().buses[0].fader).toBe(0.9)           // untouched
    })

    it("rolls back a bus master fader", () => {
        store().updateBusFader(5, 0.95)
        store().rejectCommand("bus_fader:5", "unauthorized")
        expect(store().buses[0].fader).toBe(0.5)
    })

    it("rolls back boolean mutes, including a rollback TO false", () => {
        // `false` is a legitimate previous value; a truthiness check here would
        // silently skip the rollback and leave a channel muted.
        store().updateSendOn(5, 3, false)
        store().rejectCommand("send_on:3:5", "unauthorized")
        expect(store().buses[0].sends[0].on).toBe(true)

        store().updateBusOn(5, false)
        store().rejectCommand("bus_on:5", "unauthorized")
        expect(store().buses[0].on).toBe(true)
    })

    it("rolls back a matrix fader", () => {
        store().updateMatrixFader(2, 0.9)
        store().rejectCommand("matrix_fader:2", "unauthorized")
        expect(store().matrices[0].fader).toBe(0.3)
    })

    it("an authoritative snapshot supersedes the captured value — no rollback afterwards", () => {
        store().updateSendLevel(5, 3, 0.85)

        // The desk speaks: someone else (or the engineer) set 0.7.
        const s = snapshot()
        s.buses[0].sends[0].level = 0.7
        store().setSnapshot(s, "u1", 2000)
        expect(store().rollbacks).toEqual({})

        // A late rejection must NOT undo that real change back to 0.4.
        store().rejectCommand("send_level:3:5", "superseded by a newer command for the same target")
        expect(store().buses[0].sends[0].level).toBe(0.7)
        // …but the reason is still recorded, so the fader can still speak.
        expect(store().rejections["send_level:3:5"].reason).toContain("superseded")
    })

    it("a repeat rejection of the same fader advances seq (so the cue re-fires)", () => {
        store().updateSendLevel(5, 3, 0.85)
        store().rejectCommand("send_level:3:5", "unauthorized")
        store().updateSendLevel(5, 3, 0.9)
        store().rejectCommand("send_level:3:5", "unauthorized")
        expect(store().rejections["send_level:3:5"].seq).toBe(2)
    })

    it("an unparseable key records the reason and changes no values", () => {
        store().updateSendLevel(5, 3, 0.85)
        store().rejectCommand("future_primitive:1:2", "unknown or malformed command: set_wat")
        expect(store().buses[0].sends[0].level).toBe(0.85)
        expect(store().rejections["future_primitive:1:2"]).toBeTruthy()
    })

    it("clearRejection removes the entry", () => {
        store().updateSendLevel(5, 3, 0.85)
        store().rejectCommand("send_level:3:5", "unauthorized")
        store().clearRejection("send_level:3:5")
        expect(store().rejections["send_level:3:5"]).toBeUndefined()
    })

    it("reset clears rejections and rollbacks", () => {
        store().updateSendLevel(5, 3, 0.85)
        store().rejectCommand("send_level:3:5", "unauthorized")
        store().reset()
        expect(store().rejections).toEqual({})
        expect(store().rollbacks).toEqual({})
        expect(store().unconfirmed).toEqual([])
    })
})

describe("R2 — the fader machine reverts immediately, with words", () => {
    it("a rejection ends the pending wait at once instead of after the 2s timeout", () => {
        let s = initFaderState(0.4, 1)
        s = faderReducer(s, { type: "commit", value: 0.85, now: 1000 })
        expect(s.phase).toBe("pending")

        // 50ms later — nowhere near FADER_CONFIRM_TIMEOUT_MS.
        s = faderReducer(s, { type: "rejected", value: 0.4, reason: "unauthorized" })

        expect(s.phase).toBe("idle")
        expect(s.displayValue).toBe(0.4)
        expect(s.optimisticValue).toBeNull()
        expect(s.outcome).toBe("rejected")
        expect(s.rejectionReason).toBe("unauthorized")
    })

    it("is IGNORED mid-drag — never yank a knob out from under a finger (C-12)", () => {
        let s = initFaderState(0.4, 1)
        s = faderReducer(s, { type: "drag_start" })
        s = faderReducer(s, { type: "drag_move", value: 0.9 })

        s = faderReducer(s, { type: "rejected", value: 0.4, reason: "unauthorized" })

        expect(s.phase).toBe("dragging")
        expect(s.displayValue).toBe(0.9)
        expect(s.outcome).toBeNull()
    })

    it("a new drag clears a lingering rejection reason", () => {
        let s = initFaderState(0.4, 1)
        s = faderReducer(s, { type: "rejected", value: 0.4, reason: "unauthorized" })
        s = faderReducer(s, { type: "drag_start" })
        expect(s.outcome).toBeNull()
        expect(s.rejectionReason).toBeNull()
    })

    it("clear_outcome drops the reason too (no stale sentence on the next move)", () => {
        let s = initFaderState(0.4, 1)
        s = faderReducer(s, { type: "rejected", value: 0.4, reason: "unauthorized" })
        s = faderReducer(s, { type: "clear_outcome" })
        expect(s.outcome).toBeNull()
        expect(s.rejectionReason).toBeNull()
    })

    it("existing confirm/revert behaviour is unchanged", () => {
        let s = initFaderState(0.4, 1)
        s = faderReducer(s, { type: "commit", value: 0.85, now: 1000 })
        s = faderReducer(s, { type: "external", value: 0.85, seq: 2, now: 1100 })
        expect(s.outcome).toBe("confirmed")
        expect(s.rejectionReason).toBeNull()
    })
})

describe("R2 — musician-facing wording", () => {
    it("names each bridge reason in words a musician can act on", () => {
        expect(humanizeRejection("unauthorized")).toBe("No permission for this bus")
        expect(humanizeRejection("bridge-standby")).toBe("Bridge is restarting")
        expect(humanizeRejection("superseded by a newer command for the same target")).toBe("Superseded")
        expect(humanizeRejection("unknown or malformed command: set_wat"))
            .toBe("Mixer didn't understand that")
    })

    it("never leaks a raw X32 error string onto a fader", () => {
        const raw = "ECONNREFUSED 192.168.1.40:10023"
        expect(humanizeRejection(raw)).toBe("The mixer refused that")
        expect(humanizeRejection(undefined)).toBe("The mixer refused that")
        expect(humanizeRejection("")).toBe("The mixer refused that")
    })
})

describe("R5 — `unconfirmed` reaches the musician instead of being dropped", () => {
    beforeEach(() => store().reset())

    it("coerceMixerSnapshot carries the bridge's unconfirmed list through", () => {
        const parsed = coerceMixerSnapshot({
            channels: [],
            buses: [],
            matrices: [],
            unconfirmed: ["bus_fader:5", "send_level:3:5"],
        })
        expect(parsed.unconfirmed).toEqual(["bus_fader:5", "send_level:3:5"])
    })

    it("degrades to [] on a missing or corrupted field rather than throwing at render", () => {
        expect(coerceMixerSnapshot({}).unconfirmed).toEqual([])
        expect(coerceMixerSnapshot({ unconfirmed: null }).unconfirmed).toEqual([])
        expect(coerceMixerSnapshot({ unconfirmed: "bus_fader:5" }).unconfirmed).toEqual([])
        // Array→map corruption (the C-4 failure mode) still yields usable keys.
        expect(coerceMixerSnapshot({ unconfirmed: { "0": "bus_fader:5" } }).unconfirmed)
            .toEqual(["bus_fader:5"])
        // Non-string members are filtered, not rendered.
        expect(coerceMixerSnapshot({ unconfirmed: ["bus_fader:5", 7, null] }).unconfirmed)
            .toEqual(["bus_fader:5"])
    })

    it("the store exposes it, so a fabricated 0 can be drawn differently from a real 0", () => {
        const s = snapshot({ unconfirmed: ["send_level:3:5"] })
        s.buses[0].sends[0].level = 0 // the bridge's fabricated fallback
        store().setSnapshot(s, "u1", 1000)

        expect(store().unconfirmed).toEqual(["send_level:3:5"])
        expect(store().buses[0].sends[0].level).toBe(0)
    })

    it("a changed unconfirmed list is not swallowed by the no-change fast path", () => {
        // The equality check skips the store write when nothing changed; if
        // `unconfirmed` were left out of it, a fader would keep its old flag
        // forever once the desk started (or stopped) answering.
        const first = snapshot({ unconfirmed: [] })
        store().setSnapshot(first, "u1", 1000)
        expect(store().unconfirmed).toEqual([])

        const second = snapshot({ unconfirmed: ["bus_fader:5"] })
        second.channels = first.channels
        second.buses = store().buses
        second.matrices = store().matrices
        store().setSnapshot(second, "u1", 1001)

        expect(store().unconfirmed).toEqual(["bus_fader:5"])
    })

    it("clears when the desk starts answering again", () => {
        store().setSnapshot(snapshot({ unconfirmed: ["bus_fader:5"] }), "u1", 1000)
        store().setSnapshot(snapshot({ unconfirmed: [] }), "u1", 1001)
        expect(store().unconfirmed).toEqual([])
    })
})
