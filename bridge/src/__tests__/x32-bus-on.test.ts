import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildOSCMessage, parseOSCMessage } from "./x32-mock-server"

/**
 * monitor-master-mute-fix — verify the X32 master-mute OSC contract.
 *
 * Asserts:
 *   1. `setBusOn(bus, true)`  writes `/bus/MM/mix/on` with integer arg `1`.
 *   2. `setBusOn(bus, false)` writes `/bus/MM/mix/on` with integer arg `0`.
 *   3. An inbound `/bus/MM/mix/on` update mutates `bus.on` and emits `bus_on`
 *      with `(idx, on)` — the C2 read-back path the transport's ack-resolver
 *      listens on. Mirror of the existing `/mtx/MM/mix/on` / `matrix_on` contract
 *      (see firestore-transport's `bus_on` listener).
 *
 * dgram is mocked so we observe the exact OSC writes the client emits + can
 * feed inbound messages deterministically.
 */

const socketHandlers = new Map<string, (...args: unknown[]) => void>()

const mockSocket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        socketHandlers.set(event, handler)
        return mockSocket
    }),
    once: vi.fn(),
    bind: vi.fn((_port: number, cb: () => void) => cb()),
    send: vi.fn(),
    close: vi.fn(),
    address: vi.fn(() => ({ port: 12345 })),
}

vi.mock("dgram", () => ({ createSocket: vi.fn(() => mockSocket) }))

import { X32Client } from "../x32-client"
import type { BusInfo } from "../types"

function oscIn(address: string, args: Array<{ type: "f" | "i" | "s"; value: number | string }> = []): void {
    const handler = socketHandlers.get("message")
    if (!handler) throw new Error("No message handler registered on socket")
    handler(buildOSCMessage(address, args))
}

function lastSendBuffer(): Buffer {
    const calls = (mockSocket.send as ReturnType<typeof vi.fn>).mock.calls
    if (calls.length === 0) throw new Error("no send() call captured")
    return calls[calls.length - 1][0] as Buffer
}

function parseOrThrow(buf: Buffer): ReturnType<typeof parseOSCMessage> & object {
    const parsed = parseOSCMessage(buf)
    if (!parsed) throw new Error("failed to parse OSC message")
    return parsed
}

describe("X32Client bus master-mute OSC contract (monitor-master-mute-fix)", () => {
    let client: X32Client

    beforeEach(() => {
        vi.useFakeTimers()
        socketHandlers.clear()
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
        ;(mockSocket.bind as ReturnType<typeof vi.fn>).mockImplementation((_port: number, cb: () => void) => cb())
        ;(mockSocket.on as ReturnType<typeof vi.fn>).mockImplementation(
            (event: string, handler: (...args: unknown[]) => void) => {
                socketHandlers.set(event, handler)
                return mockSocket
            },
        )
        client = new X32Client({ address: "192.168.1.1", port: 10023 })
    })

    afterEach(() => {
        client.disconnect()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    async function connectClient() {
        const p = client.connect()
        oscIn("/xinfo", [
            { type: "s", value: "192.168.1.1" },
            { type: "s", value: "X32" },
            { type: "s", value: "X32" },
            { type: "s", value: "4.06" },
        ])
        await p
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
    }

    it("setBusOn(5, true) writes /bus/05/mix/on with integer arg 1 (X32 unmuted convention)", async () => {
        await connectClient()
        client.setBusOn(5, true)
        const buf = lastSendBuffer()
        const parsed = parseOrThrow(buf)
        expect(parsed.address).toBe("/bus/05/mix/on")
        expect(parsed.args[0]?.type).toBe("i")
        expect(parsed.args[0]?.value).toBe(1)
    })

    it("setBusOn(5, false) writes /bus/05/mix/on with integer arg 0 (X32 muted convention)", async () => {
        await connectClient()
        client.setBusOn(5, false)
        const buf = lastSendBuffer()
        const parsed = parseOrThrow(buf)
        expect(parsed.address).toBe("/bus/05/mix/on")
        expect(parsed.args[0]?.type).toBe("i")
        expect(parsed.args[0]?.value).toBe(0)
    })

    it("setBusOn pads single-digit bus indices to 2 chars (X32 OSC convention)", async () => {
        await connectClient()
        client.setBusOn(1, true)
        const parsed = parseOrThrow(lastSendBuffer())
        expect(parsed.address).toBe("/bus/01/mix/on")
    })

    it("inbound /bus/MM/mix/on=1 mutates bus.on=true and emits bus_on(idx, true)", async () => {
        await connectClient()
        // Seed a bus into the client so routeParameterChange can find it.
        const bus: BusInfo = { index: 5, name: "IEM", fader: 0.5, on: false, sends: [] }
        ;(client as unknown as { buses: BusInfo[] }).buses = [bus]

        const events: Array<[number, boolean]> = []
        client.on("bus_on", (idx: number, on: boolean) => events.push([idx, on]))

        oscIn("/bus/05/mix/on", [{ type: "i", value: 1 }])

        expect(bus.on).toBe(true)
        expect(events).toEqual([[5, true]])
    })

    it("inbound /bus/MM/mix/on=0 mutates bus.on=false and emits bus_on(idx, false) — the master-mute readback", async () => {
        await connectClient()
        const bus: BusInfo = { index: 3, name: "Daniel", fader: 0.7, on: true, sends: [] }
        ;(client as unknown as { buses: BusInfo[] }).buses = [bus]

        const events: Array<[number, boolean]> = []
        client.on("bus_on", (idx: number, on: boolean) => events.push([idx, on]))

        oscIn("/bus/03/mix/on", [{ type: "i", value: 0 }])

        expect(bus.on).toBe(false)
        expect(events).toEqual([[3, false]])
    })

    it("inbound /bus/MM/mix/on for an unknown bus is a no-op (no throw, no emit)", async () => {
        await connectClient()
        ;(client as unknown as { buses: BusInfo[] }).buses = []

        const events: Array<[number, boolean]> = []
        client.on("bus_on", (idx: number, on: boolean) => events.push([idx, on]))

        expect(() => oscIn("/bus/99/mix/on", [{ type: "i", value: 1 }])).not.toThrow()
        expect(events).toEqual([])
    })
})
