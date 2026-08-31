import { describe, it, expect } from "vitest"
import {
    busFaderKey,
    busOnKey,
    commandTargetKey,
    matrixFaderKey,
    matrixOnKey,
    parseTargetKey,
    sendLevelKey,
    sendOnKey,
} from "@/lib/monitor/target-key"

/**
 * The client's key vocabulary MUST stay byte-identical to the bridge's. Drift
 * here fails silently — a fader simply never matches its own ack (R2) or its own
 * `unconfirmed` marker (R5), and everything looks fine. The literals below are
 * transcribed from the bridge:
 *
 *   bridge/src/x32-client.ts syncFullState()   → `unconfirmed.add(...)`
 *   bridge/src/firestore-transport.ts          → confirmKeyFor() / resolvePendingAck()
 */
describe("target-key — the bridge's own key spelling", () => {
    it("pins every literal against the bridge", () => {
        expect(busFaderKey(5)).toBe("bus_fader:5")
        expect(busOnKey(5)).toBe("bus_on:5")
        expect(sendLevelKey(3, 5)).toBe("send_level:3:5")
        expect(sendOnKey(3, 5)).toBe("send_on:3:5")
        expect(matrixFaderKey(2)).toBe("matrix_fader:2")
        expect(matrixOnKey(2)).toBe("matrix_on:2")
    })

    it("send keys are CHANNEL first, then bus — the reverse of the command argument order", () => {
        // setSendLevel(busIndex, channelIndex) vs `send_level:<ch>:<bus>`. This
        // asymmetry is inherited from the bridge and is the obvious thing to get
        // backwards; a swap here would mis-flag a DIFFERENT musician's fader.
        expect(sendLevelKey(1, 9)).toBe("send_level:1:9")
        expect(sendLevelKey(9, 1)).toBe("send_level:9:1")
    })

    it("bus 0 is a real bus (C-11) — keys must not treat index 0 as absent", () => {
        expect(busFaderKey(0)).toBe("bus_fader:0")
        expect(commandTargetKey({ type: "set_bus_master", busIndex: 0 })).toBe("bus_fader:0")
        expect(commandTargetKey({ type: "set_send_level", busIndex: 0, channelIndex: 0 }))
            .toBe("send_level:0:0")
    })

    describe("commandTargetKey", () => {
        it("maps every command type the client can send", () => {
            expect(commandTargetKey({ type: "set_bus_master", busIndex: 5 })).toBe("bus_fader:5")
            expect(commandTargetKey({ type: "set_bus_on", busIndex: 5 })).toBe("bus_on:5")
            expect(commandTargetKey({ type: "set_send_level", busIndex: 5, channelIndex: 3 }))
                .toBe("send_level:3:5")
            expect(commandTargetKey({ type: "set_send_on", busIndex: 5, channelIndex: 3 }))
                .toBe("send_on:3:5")
            expect(commandTargetKey({ type: "set_matrix_fader", matrixIndex: 2 })).toBe("matrix_fader:2")
            expect(commandTargetKey({ type: "set_matrix_on", matrixIndex: 2 })).toBe("matrix_on:2")
        })

        it("returns null for missing fields and unknown types (mirrors confirmKeyFor)", () => {
            expect(commandTargetKey({ type: "set_send_level", busIndex: 5 })).toBeNull()
            expect(commandTargetKey({ type: "set_bus_master" })).toBeNull()
            expect(commandTargetKey({ type: "request_state" })).toBeNull()
            expect(commandTargetKey({})).toBeNull()
        })
    })

    describe("parseTargetKey", () => {
        it("round-trips every builder", () => {
            expect(parseTargetKey(busFaderKey(5))).toEqual({ kind: "bus_fader", busIndex: 5 })
            expect(parseTargetKey(busOnKey(0))).toEqual({ kind: "bus_on", busIndex: 0 })
            expect(parseTargetKey(sendLevelKey(3, 5)))
                .toEqual({ kind: "send_level", channelIndex: 3, busIndex: 5 })
            expect(parseTargetKey(sendOnKey(3, 5)))
                .toEqual({ kind: "send_on", channelIndex: 3, busIndex: 5 })
            expect(parseTargetKey(matrixFaderKey(6))).toEqual({ kind: "matrix_fader", matrixIndex: 6 })
            expect(parseTargetKey(matrixOnKey(6))).toEqual({ kind: "matrix_on", matrixIndex: 6 })
        })

        it("returns null rather than guessing on anything malformed", () => {
            // A newer bridge inventing a key must degrade to "no rollback",
            // never to a rollback aimed at the wrong slot.
            expect(parseTargetKey("bus_fader")).toBeNull()
            expect(parseTargetKey("bus_fader:x")).toBeNull()
            expect(parseTargetKey("bus_fader:")).toBeNull()
            expect(parseTargetKey("send_level:1")).toBeNull()
            expect(parseTargetKey("future_thing:1:2")).toBeNull()
            expect(parseTargetKey("")).toBeNull()
        })
    })
})
