import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * R3 (forceReconnect) + B1 (socket-error crash guard) — v10.0.4. dgram is mocked
 * so we can drive the socket handlers directly without real UDP.
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
    socketHandlers.get("message")?.(buildXinfoBuffer())
}

describe("X32Client v10.0.4 recovery + crash-guard", () => {
    let client: X32Client

    beforeEach(() => {
        vi.useFakeTimers()
        socketHandlers.clear()
        ;(mockSocket.on as ReturnType<typeof vi.fn>).mockClear()
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
        ;(mockSocket.bind as ReturnType<typeof vi.fn>).mockImplementation((_p: number, cb: () => void) => cb())
        ;(mockSocket.on as ReturnType<typeof vi.fn>).mockImplementation((event: string, h: (...a: unknown[]) => void) => {
            socketHandlers.set(event, h)
            return mockSocket
        })
        client = new X32Client({ address: "192.168.1.1", port: 10023 })
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    async function connectClient() {
        const p = client.connect()
        simulateXinfoResponse()
        await p
        ;(mockSocket.send as ReturnType<typeof vi.fn>).mockClear()
    }

    it("R3: forceReconnect drops the connection, emits 'disconnected', and kicks the reconnect loop", async () => {
        await connectClient()
        const inner = client as unknown as { connected: boolean; reconnecting: boolean }
        expect(inner.connected).toBe(true)

        const onDisconnected = vi.fn()
        client.on("disconnected", onDisconnected)

        client.forceReconnect()

        expect(inner.connected).toBe(false)
        expect(onDisconnected).toHaveBeenCalledTimes(1)
        expect(inner.reconnecting).toBe(true)

        // Recover so the reconnect promise settles and timers drain cleanly.
        await vi.advanceTimersByTimeAsync(100)
        simulateXinfoResponse()
        await vi.advanceTimersByTimeAsync(100)
        expect(inner.connected).toBe(true)
    })

    it("B1: a socket 'error' with the index.ts-style listener attached does NOT throw", async () => {
        await connectClient()
        // index.ts attaches exactly this listener so the EventEmitter "error" has a
        // handler (an unhandled "error" emit would otherwise crash the process).
        const onError = vi.fn()
        client.on("error", onError)

        const socketErrorHandler = socketHandlers.get("error")
        expect(socketErrorHandler).toBeDefined()
        expect(() => socketErrorHandler!(new Error("ECONNRESET"))).not.toThrow()
        expect(onError).toHaveBeenCalledTimes(1)
    })

    it("O2: getLastMessageAt reflects the last inbound OSC message", async () => {
        await connectClient()
        expect(client.getLastMessageAt()).toBeGreaterThan(0)
    })
})
