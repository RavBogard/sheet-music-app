import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildOSCMessage } from "./x32-mock-server"

/**
 * Monitor Overhaul Phase 2 — B9 query/echo correlation.
 *
 * The X32 has no correlation id; it replies to the same address. Now that C2
 * issues a query after every command, two queries to the SAME address can be in
 * flight at once (e.g. the 30s re-query overlapping a reconnect re-query). The
 * old single-slot `pendingCallbacks` map clobbered the first waiter when the
 * second registered, so the first promise hung until its 2s timeout. The fix is
 * a per-address FIFO queue: each inbound reply resolves the OLDEST outstanding
 * waiter, in send order.
 *
 * dgram is mocked so we drive the client deterministically with fake timers.
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

function oscIn(address: string, args: Array<{ type: "f" | "i" | "s"; value: number | string }> = []): void {
    const handler = socketHandlers.get("message")
    if (!handler) throw new Error("No message handler registered on socket")
    handler(buildOSCMessage(address, args))
}

describe("X32Client query correlation (B9) — concurrent same-address queries", () => {
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

    it("resolves two in-flight queries to the SAME address in FIFO order (no clobber)", async () => {
        await connectClient()

        // Two concurrent reads of the same bus fader — the B9 collision case.
        const p1 = client.queryBusFader(3)
        const p2 = client.queryBusFader(3)

        // Replies arrive in order; each goes to the oldest outstanding waiter.
        oscIn("/bus/03/mix/fader", [{ type: "f", value: 0.11 }])
        oscIn("/bus/03/mix/fader", [{ type: "f", value: 0.22 }])

        expect(await p1).toBeCloseTo(0.11, 5)
        expect(await p2).toBeCloseTo(0.22, 5)
        // Pre-fix, p1 would never resolve (its callback was overwritten by p2) and
        // would reject at the 2s timeout instead.
    })

    it("a timeout on one concurrent waiter does not disturb the other", async () => {
        await connectClient()

        const p1 = client.queryBusFader(3)
        const p2 = client.queryBusFader(3)
        // Attach p2's rejection expectation NOW, before advancing timers, so the
        // timeout rejection isn't momentarily unhandled.
        const p2Rejects = expect(p2).rejects.toThrow(/Query timeout/)

        // Only one reply arrives → resolves the oldest (p1).
        oscIn("/bus/03/mix/fader", [{ type: "f", value: 0.55 }])
        expect(await p1).toBeCloseTo(0.55, 5)

        // p2 has no reply → it (and only it) rejects at its own 2s timeout.
        await vi.advanceTimersByTimeAsync(2000)
        await p2Rejects
    })

    it("interleaved queries to DIFFERENT addresses each resolve independently", async () => {
        await connectClient()

        const pFader = client.queryBusFader(1)
        const pName = client.queryBusName(2)

        oscIn("/bus/02/config/name", [{ type: "s", value: "Bass IEM" }])
        oscIn("/bus/01/mix/fader", [{ type: "f", value: 0.7 }])

        expect(await pName).toBe("Bass IEM")
        expect(await pFader).toBeCloseTo(0.7, 5)
    })
})
