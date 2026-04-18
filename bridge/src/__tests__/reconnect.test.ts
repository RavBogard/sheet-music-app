import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Capture message handlers via mock
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

// Helper: build a minimal /xinfo OSC response buffer
function buildXinfoBuffer(): Buffer {
    const addressBuf = Buffer.alloc(8)
    addressBuf.write("/xinfo", "ascii")
    const typeTag = Buffer.alloc(8)
    typeTag.write(",ssss", "ascii")
    const arg1 = Buffer.alloc(16)
    arg1.write("192.168.1.1", "ascii")
    const arg2 = Buffer.alloc(4)
    arg2.write("X32", "ascii")
    const arg3 = Buffer.alloc(4)
    arg3.write("X32", "ascii")
    const arg4 = Buffer.alloc(8)
    arg4.write("4.06", "ascii")
    return Buffer.concat([addressBuf, typeTag, arg1, arg2, arg3, arg4])
}

function simulateXinfoResponse() {
    const messageHandler = socketHandlers.get("message")
    if (!messageHandler) throw new Error("No message handler registered on socket")
    messageHandler(buildXinfoBuffer())
}

describe("X32Client reconnection", () => {
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
        // The connect method calls bind, then sends /xinfo, then listens for raw_message
        // Simulate the /xinfo response
        simulateXinfoResponse()
        await connectPromise
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
    }

    it("does not have MAX_ATTEMPTS cap (retries indefinitely)", () => {
        const clientSource = X32Client.toString()
        expect(clientSource).not.toContain("MAX_ATTEMPTS")
    })

    it("attemptReconnect uses exponential backoff starting at 2s", async () => {
        await connectClient()

        const clientAny = client as unknown as {
            connected: boolean
            attemptReconnect: () => Promise<void>
            currentBackoff: number
        }
        clientAny.connected = false

        const reconnectPromise = clientAny.attemptReconnect()

        // First /xinfo probe sent immediately
        await vi.advanceTimersByTimeAsync(100)
        expect(mockSocket.send).toHaveBeenCalled()
        const callCountAfterFirst = (mockSocket.send as ReturnType<typeof vi.fn>).mock.calls.length

        // First attempt times out after 5s
        await vi.advanceTimersByTimeAsync(5000)

        // After timeout, wait for 2s backoff before second attempt
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
        await vi.advanceTimersByTimeAsync(2000)
        await vi.advanceTimersByTimeAsync(100)

        // Second attempt should be sent
        expect(mockSocket.send).toHaveBeenCalled()

        // Succeed on this attempt
        simulateXinfoResponse()
        await vi.advanceTimersByTimeAsync(100)
        await reconnectPromise
    })

    it("backoff caps at 60s", async () => {
        await connectClient()

        const clientAny = client as unknown as {
            connected: boolean
            attemptReconnect: () => Promise<void>
            currentBackoff: number
            shouldStopReconnecting: boolean
        }
        clientAny.connected = false

        const reconnectPromise = clientAny.attemptReconnect()

        // Advance through multiple failed attempts
        // Backoff sequence: 2s, 4s, 8s, 16s, 32s, 60s, 60s...
        // Each attempt = 5s timeout + backoff
        for (let i = 0; i < 7; i++) {
            await vi.advanceTimersByTimeAsync(5000 + 65000) // 5s timeout + max 60s backoff
        }

        // Backoff should be capped at 60000 (it may show as the NEXT backoff after doubling)
        expect(clientAny.currentBackoff).toBeLessThanOrEqual(60000)

        // Stop the loop
        clientAny.shouldStopReconnecting = true
        await vi.advanceTimersByTimeAsync(70000)
        await reconnectPromise
    })

    it("successful reconnect resets backoff for next disconnection", async () => {
        await connectClient()

        const clientAny = client as unknown as {
            connected: boolean
            attemptReconnect: () => Promise<void>
            currentBackoff: number
        }
        clientAny.connected = false

        const reconnectPromise = clientAny.attemptReconnect()

        // Let first attempt timeout (5s), then wait for backoff (2s)
        await vi.advanceTimersByTimeAsync(5000 + 2000 + 200)

        // Second attempt -- succeed
        simulateXinfoResponse()
        await vi.advanceTimersByTimeAsync(100)
        await reconnectPromise

        // After successful reconnect, backoff should be reset to 2000
        expect(clientAny.currentBackoff).toBe(2000)
    })

    it("concurrent attemptReconnect calls are deduplicated", async () => {
        await connectClient()

        const clientAny = client as unknown as {
            connected: boolean
            attemptReconnect: () => Promise<void>
            reconnecting: boolean
        }
        clientAny.connected = false

        // Start first reconnect
        const p1 = clientAny.attemptReconnect()
        expect(clientAny.reconnecting).toBe(true)

        // Start second -- should return immediately (reconnecting flag)
        const p2 = clientAny.attemptReconnect()

        // Both started, only one is actively reconnecting
        expect(clientAny.reconnecting).toBe(true)

        // Succeed
        await vi.advanceTimersByTimeAsync(100)
        simulateXinfoResponse()
        await vi.advanceTimersByTimeAsync(100)
        await p1
        await p2
    })

    it("stopReconnecting breaks the reconnect loop", async () => {
        await connectClient()

        const clientAny = client as unknown as {
            connected: boolean
            attemptReconnect: () => Promise<void>
            stopReconnecting: () => void
            reconnecting: boolean
        }
        clientAny.connected = false

        const reconnectPromise = clientAny.attemptReconnect()
        expect(clientAny.reconnecting).toBe(true)

        // Advance past first attempt timeout
        await vi.advanceTimersByTimeAsync(5100)

        // Stop reconnecting
        clientAny.stopReconnecting()

        // Advance past backoff -- loop should exit
        await vi.advanceTimersByTimeAsync(3000)
        await reconnectPromise

        expect(clientAny.reconnecting).toBe(false)
    })
})
