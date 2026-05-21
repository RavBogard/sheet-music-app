import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mirrors reconnect.test.ts: mock the UDP socket so we drive the X32Client
// deterministically with fake timers. The client's own EventEmitter wiring
// (this.once / this.emit "raw_message") is real — only the socket is mocked.
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

// A minimal /xinfo OSC response buffer (the X32 answers /xinfo — that's what
// the keepalive relies on; it does NOT answer /xremote).
function buildXinfoBuffer(): Buffer {
    const addressBuf = Buffer.alloc(8)
    addressBuf.write("/xinfo", "ascii")
    const typeTag = Buffer.alloc(8)
    typeTag.write(",ssss", "ascii")
    const arg1 = Buffer.alloc(16); arg1.write("192.168.1.1", "ascii")
    const arg2 = Buffer.alloc(4); arg2.write("X32", "ascii")
    const arg3 = Buffer.alloc(4); arg3.write("X32", "ascii")
    const arg4 = Buffer.alloc(8); arg4.write("4.06", "ascii")
    return Buffer.concat([addressBuf, typeTag, arg1, arg2, arg3, arg4])
}

function simulateXinfoResponse() {
    const messageHandler = socketHandlers.get("message")
    if (!messageHandler) throw new Error("No message handler registered on socket")
    messageHandler(buildXinfoBuffer())
}

// Decode the OSC address of every buffer the client sent on the socket.
function sentAddresses(): string[] {
    return (mockSocket.send as ReturnType<typeof vi.fn>).mock.calls.map((c) => {
        const buf = c[0] as Buffer
        const end = buf.indexOf(0)
        return buf.toString("ascii", 0, end === -1 ? buf.length : end)
    })
}

describe("X32Client keepalive / response-based liveness (BR-02)", () => {
    let client: X32Client

    beforeEach(() => {
        vi.useFakeTimers()
        socketHandlers.clear()
        ;(mockSocket.on as ReturnType<typeof vi.fn>).mockClear()
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
        ;(mockSocket.bind as ReturnType<typeof vi.fn>).mockImplementation((_port: number, cb: () => void) => cb())
        ;(mockSocket.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
            socketHandlers.set(event, handler)
            return mockSocket
        })
        client = new X32Client({ address: "192.168.1.1", port: 10023 })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    async function connectClient() {
        const connectPromise = client.connect()
        simulateXinfoResponse()
        await connectPromise
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
    }

    it("sends a periodic /xinfo keepalive while the console is idle", async () => {
        await connectClient()
        // No param traffic at all — the only inbound-soliciting send is the keepalive.
        await vi.advanceTimersByTimeAsync(8000)
        expect(sentAddresses()).toContain("/xinfo")
    })

    it("does NOT false-disconnect an idle-but-alive X32 (keepalive answered)", async () => {
        await connectClient()

        const onDisc = vi.fn()
        client.on("disconnected", onDisc)
        const reconnectMock = vi.fn()
        ;(client as unknown as { attemptReconnect: () => void }).attemptReconnect = reconnectMock

        // 60s of an idle console: zero param traffic, but the X32 answers each
        // /xinfo keepalive. Liveness must hold the whole time.
        for (let i = 0; i < 12; i++) {
            await vi.advanceTimersByTimeAsync(5000)
            simulateXinfoResponse()
        }

        expect(onDisc).not.toHaveBeenCalled()
        expect(reconnectMock).not.toHaveBeenCalled()
        expect(client.isConnected()).toBe(true)
    })

    it("STILL detects a truly unreachable X32 (no response within the 20s window)", async () => {
        await connectClient()

        const onDisc = vi.fn()
        client.on("disconnected", onDisc)
        const reconnectMock = vi.fn()
        ;(client as unknown as { attemptReconnect: () => void }).attemptReconnect = reconnectMock

        // Dead console: no responses at all. Past the 20s health window.
        await vi.advanceTimersByTimeAsync(26000)

        expect(onDisc).toHaveBeenCalled()
        expect(reconnectMock).toHaveBeenCalled()
        expect(client.isConnected()).toBe(false)
    })
})
