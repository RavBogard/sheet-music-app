import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildOSCMessage, parseOSCMessage } from "./x32-mock-server"

/**
 * Monitor Overhaul Phase 1 — query-after-command (C2) + B11 sentinel.
 *
 * Mocks the UDP socket (like health-keepalive.test.ts) so we drive the X32Client
 * deterministically with fake timers. C2: after a SET the client issues ONE
 * debounced GET for the same address; its reply travels the normal inbound path
 * and refreshes the cache — closing R1 (the X32 never echoes a client's own
 * write). The confirm is fire-and-forget: no reply means no fabricated value.
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

vi.mock("dgram", () => ({
    createSocket: vi.fn(() => mockSocket),
}))

import { X32Client } from "../x32-client"

/** Deliver an inbound OSC message to the client (as if from the desk). */
function oscIn(address: string, args: Array<{ type: "f" | "i" | "s"; value: number | string }> = []): void {
    const handler = socketHandlers.get("message")
    if (!handler) throw new Error("No message handler registered on socket")
    handler(buildOSCMessage(address, args))
}

/** Decode every buffer the client sent: its address + whether it carried args. */
function sentMessages(): Array<{ address: string; hasArgs: boolean }> {
    return (mockSocket.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => {
        const msg = parseOSCMessage(c[0] as Buffer)
        return { address: msg?.address ?? "", hasArgs: (msg?.args.length ?? 0) > 0 }
    })
}

function getsFor(address: string): number {
    return sentMessages().filter((m) => m.address === address && !m.hasArgs).length
}
function setsFor(address: string): number {
    return sentMessages().filter((m) => m.address === address && m.hasArgs).length
}

describe("X32Client query-after-command (C2) + B11 unconfirmed sentinel", () => {
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

    it("a SET schedules ONE debounced confirm GET that refreshes the cache when the desk replies (kills R1)", async () => {
        await connectClient()
        ;(client as unknown as { buses: unknown }).buses = [{ index: 3, name: "Keys", fader: 0.7, sends: [] }]
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()

        client.setBusFader(3, 0.2)
        // The SET goes out immediately; the confirm GET has not fired yet.
        expect(setsFor("/bus/03/mix/fader")).toBe(1)
        expect(getsFor("/bus/03/mix/fader")).toBe(0)

        await vi.advanceTimersByTimeAsync(75) // CONFIRM_DEBOUNCE_MS
        expect(getsFor("/bus/03/mix/fader")).toBe(1)

        // Cache stays at the old value until the desk actually replies…
        expect(client.buses.find((b) => b.index === 3)!.fader).toBeCloseTo(0.7, 5)
        // …then the reply (the C2 read-back) refreshes it to the confirmed value.
        oscIn("/bus/03/mix/fader", [{ type: "f", value: 0.2 }])
        expect(client.buses.find((b) => b.index === 3)!.fader).toBeCloseTo(0.2, 5)
    })

    it("debounces: rapid SETs to one target coalesce into a single confirm GET", async () => {
        await connectClient()
        ;(client as unknown as { buses: unknown }).buses = [{ index: 3, name: "Keys", fader: 0.7, sends: [] }]
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()

        client.setBusFader(3, 0.2)
        await vi.advanceTimersByTimeAsync(40)
        client.setBusFader(3, 0.3) // reschedules the confirm
        await vi.advanceTimersByTimeAsync(40) // 40ms since last SET — not yet
        expect(getsFor("/bus/03/mix/fader")).toBe(0)
        await vi.advanceTimersByTimeAsync(40) // now ≥75ms since the last SET
        expect(getsFor("/bus/03/mix/fader")).toBe(1)
    })

    it("does NOT fabricate a value when the confirm GET gets no reply (heartbeat reconciles)", async () => {
        await connectClient()
        ;(client as unknown as { buses: unknown }).buses = [{ index: 3, name: "Keys", fader: 0.7, sends: [] }]

        client.setBusFader(3, 0.2)
        await vi.advanceTimersByTimeAsync(300) // GET fired, but no reply delivered
        // Cache is untouched — the bridge never writes the un-confirmed target value.
        expect(client.buses.find((b) => b.index === 3)!.fader).toBeCloseTo(0.7, 5)
    })

    it("send/matrix setters all schedule their own confirm GET", async () => {
        await connectClient()
        ;(client as unknown as { buses: unknown }).buses = [
            { index: 1, name: "Worship", fader: 0.5, sends: [{ channelIndex: 2, level: 0.3, on: true }] },
        ]
        ;(client as unknown as { matrices: unknown }).matrices = [{ index: 4, name: "Mtx 4", fader: 0.6, on: true }]
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()

        client.setSendLevel(2, 1, 0.9)
        client.setSendOn(2, 1, false)
        client.setMatrixFader(4, 0.1)
        client.setMatrixOn(4, false)
        await vi.advanceTimersByTimeAsync(75)

        expect(getsFor("/ch/02/mix/01/level")).toBe(1)
        expect(getsFor("/ch/02/mix/01/on")).toBe(1)
        expect(getsFor("/mtx/04/mix/fader")).toBe(1)
        expect(getsFor("/mtx/04/mix/on")).toBe(1)
    })

    it("B11: syncFullState marks value reads that fail as unconfirmed, not silent 0/false/true", async () => {
        await connectClient()
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()

        const sync = client.syncFullState([1]) // bus 1 only; the desk replies to nothing
        // syncFullState runs sequential query waves (channels → bus name/fader →
        // sends → matrices), each with its own 2s timeout, so the next wave can't
        // schedule until the prior one settles. Advance in 2s steps until the sync
        // settles (bounded), letting each wave's timers fire in turn.
        let settled = false
        void sync.then(() => { settled = true })
        for (let i = 0; i < 8 && !settled; i++) {
            await vi.advanceTimersByTimeAsync(2100)
        }
        await sync

        const unconfirmed = client.getUnconfirmed()
        expect(unconfirmed).toContain("bus_fader:1")
        expect(unconfirmed).toContain("send_level:1:1")
        expect(unconfirmed).toContain("send_on:1:1")
        expect(unconfirmed).toContain("matrix_fader:1")
        expect(unconfirmed).toContain("matrix_on:1")
    })

    it("B11: a fully-successful sync leaves nothing unconfirmed", async () => {
        await connectClient()

        // Auto-answer every GET the moment the client sends it (the pendingCallback
        // is already registered by query() before send() is called), so no query
        // times out. syncFullState fires channel queries, THEN bus, THEN matrix —
        // replying inside the send hook covers all three waves regardless of order.
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockImplementation((buf: Buffer) => {
            const msg = parseOSCMessage(buf)
            if (!msg || msg.args.length > 0) return // ignore SETs / keepalives with args
            if (/\/config\/name$/.test(msg.address)) oscIn(msg.address, [{ type: "s", value: "x" }])
            else if (/\/on$/.test(msg.address)) oscIn(msg.address, [{ type: "i", value: 1 }])
            else if (/\/(fader|level)$/.test(msg.address)) oscIn(msg.address, [{ type: "f", value: 0.5 }])
        })

        await client.syncFullState([1])
        expect(client.getUnconfirmed()).toEqual([])
    })
})
